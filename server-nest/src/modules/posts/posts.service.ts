import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Block,
  Bookmark,
  Like,
  Order,
  Poll,
  PollOption,
  PollVote,
  Post,
  Product,
  Purchase,
  RedPacket,
  RedPacketGrab,
  Reward,
  Topic,
  TopicFollow,
  User,
} from '../../database/entities';
import { HelpersService, rewardNum } from '../../common/helpers.service';
import { RateLimitService } from '../../common/rate-limit.service';
import { SiteService } from '../site/site.service';
import { checkSensitive } from '../../common/sensitive';
import {
  CreatePostDto,
  ShareDto,
  UpdatePostDto,
  VoteDto,
} from './dto/post.dto';

/**
 * Ported from server/src/routes/posts.js. Reproduces serializePost (with
 * visibility/unlock handling), poll building, the feed query variants, the
 * block filter, and every CRUD/interaction endpoint — response shapes match
 * the Express version byte-for-byte so the client works unchanged.
 */
// 付费内容价格钳制：非数/负数 → 0；超过后台上限 → 钳到上限。抽成纯函数以便 vitest 覆盖边界。
export function clampPrice(raw: unknown, max: number): number {
  return Math.min(Math.max(0, Number(raw) || 0), Math.max(0, Number(max) || 0));
}

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post) private readonly posts: Repository<Post>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Like) private readonly likes: Repository<Like>,
    @InjectRepository(Bookmark)
    private readonly bookmarks: Repository<Bookmark>,
    @InjectRepository(Block) private readonly blocks: Repository<Block>,
    @InjectRepository(Topic) private readonly topics: Repository<Topic>,
    @InjectRepository(TopicFollow)
    private readonly topicFollows: Repository<TopicFollow>,
    @InjectRepository(Purchase)
    private readonly purchases: Repository<Purchase>,
    @InjectRepository(Reward) private readonly rewards: Repository<Reward>,
    @InjectRepository(Poll) private readonly polls: Repository<Poll>,
    @InjectRepository(PollOption)
    private readonly pollOptions: Repository<PollOption>,
    @InjectRepository(PollVote)
    private readonly pollVotes: Repository<PollVote>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(RedPacket)
    private readonly redPackets: Repository<RedPacket>,
    @InjectRepository(RedPacketGrab)
    private readonly redPacketGrabs: Repository<RedPacketGrab>,
    private readonly helpers: HelpersService,
    private readonly dataSource: DataSource,
    private readonly rateLimit: RateLimitService,
    private readonly site: SiteService,
  ) {}

  /** 构造 post 的红包视图(进度 + 抢红包列表 + 自己的份额)。Mirrors Express buildRedPacket. */
  async buildRedPacket(postId: number, viewerId: number | null) {
    const rp = await this.redPackets.findOne({ where: { post_id: postId } });
    if (!rp) return null;
    const grabs = await this.redPacketGrabs.find({
      where: { packet_id: rp.id },
      order: { amount: 'DESC', id: 'ASC' },
      take: 12,
    });
    const mine = viewerId
      ? await this.redPacketGrabs.findOne({
          where: { packet_id: rp.id, user_id: viewerId },
        })
      : null;
    const best = await this.redPacketGrabs.findOne({
      where: { packet_id: rp.id },
      order: { amount: 'DESC', id: 'ASC' },
    });
    return {
      id: rp.id,
      blessing: rp.blessing || '恭喜发财，大吉大利',
      totalPoints: rp.total_points,
      totalCount: rp.total_count,
      grabbedCount: rp.total_count - rp.remaining_count,
      grabbedPoints: rp.total_points - rp.remaining_points,
      over: rp.remaining_count <= 0,
      isOwner: viewerId === rp.user_id,
      myAmount: mine ? mine.amount : null, // null => 尚未抢
      bestUserId: best ? best.user_id : null,
      grabs: await Promise.all(
        grabs.map(async (g) => ({
          user: await this.helpers.publicUser(
            await this.helpers.getUser(g.user_id),
            viewerId,
          ),
          amount: g.amount,
        })),
      ),
    };
  }

  private async viewerLiked(
    userId: number | null,
    type: string,
    id: number,
  ): Promise<boolean> {
    if (!userId) return false;
    return !!(await this.likes.findOne({
      where: { user_id: userId, target_type: type, target_id: id },
    }));
  }

  // 表情回应 (reactions) —— 与 Express 对齐。like 为默认/兜底类型。
  private async viewerReactionFor(
    type: string,
    id: number,
    viewerId: number | null,
  ): Promise<string | null> {
    if (!viewerId) return null;
    const l = await this.likes.findOne({
      where: { user_id: viewerId, target_type: type, target_id: id },
    });
    return l ? l.reaction || 'like' : null;
  }

  private async reactionCountsFor(
    type: string,
    id: number,
  ): Promise<Record<string, number> | null> {
    const rows = await this.likes.query(
      "SELECT COALESCE(reaction,'like') r, COUNT(*) c FROM likes WHERE target_type=? AND target_id=? GROUP BY COALESCE(reaction,'like')",
      [type, id],
    );
    if (!rows.length) return null;
    const out: Record<string, number> = {};
    for (const row of rows) out[row.r] = Number(row.c);
    return out;
  }

  /** Build the poll attached to a post (or null). Reveals per-option counts. */
  async buildPoll(postId: number, viewerId: number | null) {
    const poll = await this.polls.findOne({ where: { post_id: postId } });
    if (!poll) return null;
    const options = await this.pollOptions.find({
      where: { poll_id: poll.id },
      order: { idx: 'ASC', id: 'ASC' },
    });
    const myVotes = viewerId
      ? (
          await this.pollVotes.find({
            where: { poll_id: poll.id, user_id: viewerId },
          })
        ).map((r) => r.option_id)
      : [];
    const closed = !!(poll.deadline && poll.deadline <= this.helpers.nowSql());
    return {
      id: poll.id,
      multi: !!poll.multi,
      deadline: poll.deadline || null,
      closed,
      totalVotes: poll.total_votes,
      voted: myVotes.length > 0,
      myVotes,
      options: options.map((o) => ({ id: o.id, text: o.text, votes: o.votes })),
    };
  }

  /** Serialize a post with visibility/unlock handling. Returns null when hidden. */
  async serializePost(
    row: Post,
    viewerId: number | null,
    { deep = true }: { deep?: boolean } = {},
  ): Promise<any | null> {
    const author = await this.helpers.getUser(row.user_id);
    const anon = row.visibility === 'anonymous';
    const isOwner = viewerId === row.user_id;
    let unlocked = true;
    let locked: any = null;

    if (row.visibility === 'paid' && !isOwner) {
      unlocked = viewerId
        ? !!(await this.purchases.findOne({
            where: { user_id: viewerId, post_id: row.id },
          }))
        : false;
      if (!unlocked) locked = { type: 'paid', price: row.price };
    }
    if (row.visibility === 'password' && !isOwner) {
      locked = { type: 'password' };
      unlocked = false;
    }
    if (row.visibility === 'private' && !isOwner) {
      return null;
    }

    let shared = null;
    let sharedDeleted = false; // 转发帖：原帖已被删（share_of 还在但取不到源）→ 前端显「原动态已删除」占位而非凭空少一块
    if (row.share_of && deep) {
      const src = await this.posts.findOne({ where: { id: row.share_of } });
      if (src) shared = await this.serializePost(src, viewerId, { deep: false });
      else sharedDeleted = true;
    }

    const now = this.helpers.nowSql();
    const topic = row.topic_id
      ? await this.topics
          .findOne({ where: { id: row.topic_id } })
          .then((t) => (t ? { id: t.id, name: t.name } : null))
      : null;

    const bookmarked = viewerId
      ? !!(await this.bookmarks.findOne({
          where: { user_id: viewerId, post_id: row.id },
        }))
      : false;

    return {
      id: row.id,
      content: unlocked ? row.content : (row.content || '').slice(0, 40),
      media: unlocked ? JSON.parse(row.media || '[]') : [],
      mediaType: row.media_type,
      visibility: row.visibility,
      price: row.price,
      location: row.location,
      device: row.device,
      views: row.views,
      likeCount: row.like_count,
      commentCount: row.comment_count,
      shareCount: row.share_count,
      createdAt: row.created_at,
      edited: !!row.edited,
      pinned: !!row.pinned,
      globalPinned: !!(row.global_pin_until && row.global_pin_until > now),
      liked: await this.viewerLiked(viewerId, 'post', row.id),
      myReaction: await this.viewerReactionFor('post', row.id, viewerId),
      reactions: row.like_count > 0 ? await this.reactionCountsFor('post', row.id) : null,
      bookmarked,
      locked,
      unlocked,
      topic,
      poll: unlocked ? await this.buildPoll(row.id, viewerId) : null,
      redPacket: unlocked ? await this.buildRedPacket(row.id, viewerId) : null,
      shared,
      sharedDeleted,
      author:
        anon && !isOwner
          ? {
              id: 0,
              nickname: '匿名用户',
              username: '',
              avatar: 'emoji:🕶️',
              anonymous: true,
              level: 0,
            }
          : await this.helpers.publicUser(author, viewerId),
    };
  }

  private async serializeMany(
    rows: Post[],
    viewerId: number | null,
  ): Promise<any[]> {
    const out: any[] = [];
    for (const r of rows) {
      const s = await this.serializePost(r, viewerId);
      if (s) out.push(s);
    }
    return out;
  }

  /** Raw-SQL feed query mirroring feedQuery() (keeps global-pin float + scoring). */
  private async runFeedQuery(
    filter: string,
    viewerId: number | null,
    city: string | undefined,
    limit: number,
    offset: number,
  ): Promise<Post[] | null> {
    const repo = this.posts;
    // 全站置顶优先(VIP 动态置顶 v2.81)。注意：表达式不要内嵌方向，方向走 orderBy 第二参，
    // 否则 TypeORM 会再补默认 ASC，生成 `... END) DESC ASC` 在 MySQL 上语法报错(整个 feed 挂)。
    const gp = `(CASE WHEN p.global_pin_until > :now THEN 1 ELSE 0 END)`;
    const now = this.helpers.nowSql();
    let qb = repo
      .createQueryBuilder('p')
      .where("p.visibility != 'private'");

    switch (filter) {
      case 'following': {
        if (!viewerId) return null;
        qb = repo
          .createQueryBuilder('p')
          .where("p.visibility != 'private'")
          .andWhere(
            'p.user_id IN (SELECT following_id FROM follows WHERE follower_id = :viewerId)',
            { viewerId },
          )
          .orderBy(gp, 'DESC')
          .addOrderBy('p.created_at', 'DESC')
          .setParameter('now', now);
        break;
      }
      case 'video':
        qb = qb
          .andWhere("p.media_type = 'video'")
          .orderBy('p.created_at', 'DESC');
        break;
      case 'samecity':
        qb = qb
          .andWhere("p.location = :city AND p.location != ''", {
            city: city || '',
          })
          .orderBy('p.created_at', 'DESC');
        break;
      case 'recommend':
        qb = qb
          .orderBy(gp, 'DESC')
          .addOrderBy(
            '(p.like_count * 3 + p.comment_count * 2 + p.views * 0.1)',
            'DESC',
          )
          .addOrderBy('p.created_at', 'DESC')
          .setParameter('now', now);
        break;
      default:
        qb = qb
          .orderBy(gp, 'DESC')
          .addOrderBy('p.created_at', 'DESC')
          .setParameter('now', now);
        break;
    }
    return qb.limit(limit).offset(offset).getMany();
  }

  private async blockedSet(viewerId: number | null): Promise<Set<number>> {
    if (!viewerId) return new Set();
    const a = await this.blocks.find({ where: { blocker_id: viewerId } });
    const b = await this.blocks.find({ where: { blocked_id: viewerId } });
    return new Set([
      ...a.map((r) => r.blocked_id),
      ...b.map((r) => r.blocker_id),
    ]);
  }

  // ---- GET /api/posts ----
  async feed(
    viewer: User | null,
    filter = 'all',
    rawLimit?: any,
    rawOffset?: any,
  ) {
    const viewerId = viewer?.id || null;
    const limit = Math.min(30, Math.max(1, Number(rawLimit) || 12));
    const offset = Math.max(0, Number(rawOffset) || 0);
    const rows = await this.runFeedQuery(
      filter,
      viewerId,
      viewer?.location,
      limit + 1,
      offset,
    );
    if (rows === null) return { posts: [], hasMore: false };
    const hasMore = rows.length > limit;
    const blocked = await this.blockedSet(viewerId);
    const visible = rows
      .slice(0, limit)
      .filter((r) => !blocked.has(r.user_id));
    const posts = await this.serializeMany(visible, viewerId);
    return { posts, hasMore };
  }

  // ---- GET /api/posts/:id (increments views) ----
  async findOne(id: number, viewer: User | null) {
    const row = await this.posts.findOne({ where: { id } });
    if (!row) throw new NotFoundException('动态不存在');
    await this.posts.increment({ id: row.id }, 'views', 1);
    row.views += 1;
    const post = await this.serializePost(row, viewer?.id || null);
    if (!post) throw new ForbiddenException('这是一条私密动态');
    return { post };
  }

  // ---- GET /api/posts/:id/related ----
  async related(id: number, viewer: User | null) {
    const row = await this.posts.findOne({ where: { id } });
    if (!row) return { posts: [] };
    let rows: Post[] = [];
    if (row.topic_id) {
      rows = await this.posts
        .createQueryBuilder('p')
        .where('p.topic_id = :tid AND p.id != :id', { tid: row.topic_id, id })
        .andWhere("p.visibility IN ('public','paid','password')")
        .orderBy('(p.like_count * 3 + p.comment_count * 2)', 'DESC')
        .limit(6)
        .getMany();
    }
    if (rows.length < 4) {
      const more = await this.posts
        .createQueryBuilder('p')
        .where('p.user_id = :uid AND p.id != :id', { uid: row.user_id, id })
        .andWhere("p.visibility IN ('public','paid','password')")
        .orderBy('p.created_at', 'DESC')
        .limit(6)
        .getMany();
      const seen = new Set(rows.map((r) => r.id));
      for (const m of more) {
        if (rows.length >= 6) break;
        if (!seen.has(m.id)) {
          rows.push(m);
          seen.add(m.id);
        }
      }
    }
    return { posts: await this.serializeMany(rows.slice(0, 5), viewer?.id || null) };
  }

  // ---- GET /api/posts/:id/siblings ----
  async siblings(id: number) {
    const cur = await this.posts.findOne({
      where: { id },
      select: ['id', 'user_id', 'created_at'],
    });
    if (!cur) return { prev: null, next: null };
    const vis = "p.visibility IN ('public','paid','password')";
    const brief = (r: any) =>
      r
        ? {
            id: r.id,
            content: (r.content || '[图片/视频]')
              .replace(/[#@]/g, '')
              .slice(0, 28),
          }
        : null;
    const prev = await this.posts
      .createQueryBuilder('p')
      .select(['p.id', 'p.content'])
      .where('p.user_id = :uid AND p.created_at > :ts', {
        uid: cur.user_id,
        ts: cur.created_at,
      })
      .andWhere(vis)
      .orderBy('p.created_at', 'ASC')
      .getOne();
    const next = await this.posts
      .createQueryBuilder('p')
      .select(['p.id', 'p.content'])
      .where('p.user_id = :uid AND p.created_at < :ts', {
        uid: cur.user_id,
        ts: cur.created_at,
      })
      .andWhere(vis)
      .orderBy('p.created_at', 'DESC')
      .getOne();
    return { prev: brief(prev), next: brief(next) };
  }

  // ---- POST /api/posts ----
  async create(user: User, dto: CreatePostDto) {
    await this.rateLimit.enforce('post', user); // 防刷屏：超频抛 429（管理员豁免/开关关则放行）
    let content = (dto.content || '').trim();
    const media = dto.media || [];
    const mediaType = dto.mediaType || 'text';
    const visibility = dto.visibility || 'public';
    const password = dto.password || '';
    // 付费内容价格上限（后台 paid_price_max，默认 100000），超出即钳制
    const priceMax = Number(await this.site.getConfig('paid_price_max', '100000')) || 100000;
    const price = clampPrice(dto.price, priceMax);
    const location = dto.location || '';
    const device = dto.device || '电脑端';
    const poll = dto.poll;

    // validate poll up front (2-6 non-empty options)
    let pollOpts: string[] | null = null;
    if (poll && Array.isArray(poll.options)) {
      pollOpts = poll.options
        .map((o) => (o || '').toString().trim())
        .filter(Boolean)
        .slice(0, 6);
      if (pollOpts.length < 2)
        throw new BadRequestException('投票至少需要 2 个选项');
      if (pollOpts.some((o) => checkSensitive(o)))
        throw new BadRequestException('选项包含敏感信息，请修改后重试');
    }

    // validate 红包 (points/count/blessing + 余额) — mirrors Express
    let rpData: { points: number; count: number; blessing: string } | null = null;
    const rpIn = dto.redPacket;
    if (rpIn && (rpIn.points || rpIn.count)) {
      const points = Math.floor(Number(rpIn.points) || 0);
      const count = Math.floor(Number(rpIn.count) || 0);
      if (count < 1 || count > 100)
        throw new BadRequestException('红包个数需在 1-100 之间');
      if (points < count)
        throw new BadRequestException(`${count} 个红包至少需要 ${count} 积分`);
      if (points > 100000)
        throw new BadRequestException('单个红包最多 100000 积分');
      const bless = (rpIn.blessing || '').toString().trim().slice(0, 30);
      if (checkSensitive(bless))
        throw new BadRequestException('祝福语包含敏感信息，请修改后重试');
      const fresh = await this.helpers.getUser(user.id);
      if ((fresh?.points ?? 0) < points)
        throw new HttpException(
          `积分不足，发 ${points} 积分红包需要这么多积分`,
          402,
        );
      rpData = { points, count, blessing: bless };
    }

    if (!content && (!media || media.length === 0) && !pollOpts && !rpData)
      throw new BadRequestException('说点什么或添加图片/视频吧');
    if (checkSensitive(content))
      throw new BadRequestException('内容包含敏感信息，请修改后重试');

    // resolve topic from #...# or explicit topic name
    let topicId: number | null = null;
    const topicNames = this.helpers.parseTopics(content);
    const topicName = dto.topic || topicNames[0];
    if (topicName) {
      let t = await this.topics.findOne({ where: { name: topicName } });
      if (!t) {
        t = await this.topics.save(
          this.topics.create({ name: topicName, created_at: this.helpers.nowSql() }),
        );
      }
      topicId = t.id;
      await this.topics
        .createQueryBuilder()
        .update(Topic)
        .set({
          post_count: () => 'post_count + 1',
          hot: () => 'hot + 1',
        })
        .where('id = :id', { id: topicId })
        .execute();
    }

    // circle membership gate
    let circleId2: number | null = null;
    if (dto.circleId) {
      const joined = await this.dataSource.query(
        'SELECT 1 FROM circle_members WHERE circle_id = ? AND user_id = ? LIMIT 1',
        [dto.circleId, user.id],
      );
      if (joined && joined.length) circleId2 = Number(dto.circleId);
    }

    const saved = await this.posts.save(
      this.posts.create({
        user_id: user.id,
        content,
        media: JSON.stringify(media || []),
        media_type: mediaType,
        visibility,
        password: visibility === 'password' ? password : null,
        price: Number(price) || 0,
        location,
        device,
        topic_id: topicId,
        circle_id: circleId2,
        created_at: this.helpers.nowSql(),
      }),
    );

    if (circleId2) {
      await this.dataSource.query(
        'UPDATE circles SET post_count = post_count + 1 WHERE id = ?',
        [circleId2],
      );
    }

    // attach poll
    if (pollOpts) {
      const days = Math.max(0, Math.min(30, Number(poll!.days) || 0));
      const deadline =
        days > 0
          ? new Date(Date.now() + days * 86400000)
              .toISOString()
              .slice(0, 19)
              .replace('T', ' ')
          : null;
      const pSaved = await this.polls.save(
        this.polls.create({
          post_id: saved.id,
          multi: poll!.multi ? 1 : 0,
          deadline,
          created_at: this.helpers.nowSql(),
        }),
      );
      let i = 0;
      for (const text of pollOpts) {
        await this.pollOptions.save(
          this.pollOptions.create({
            poll_id: pSaved.id,
            text: text.slice(0, 60),
            idx: i++,
          }),
        );
      }
    }

    // attach 红包: escrow the author's points into the packet
    if (rpData) {
      await this.users
        .query('UPDATE users SET points = points - ? WHERE id = ?', [
          rpData.points,
          user.id,
        ])
        .catch(() =>
          this.users.query(
            'UPDATE users SET points = points - $1 WHERE id = $2',
            [rpData!.points, user.id],
          ),
        );
      await this.redPackets.save(
        this.redPackets.create({
          post_id: saved.id,
          user_id: user.id,
          total_points: rpData.points,
          total_count: rpData.count,
          remaining_points: rpData.points,
          remaining_count: rpData.count,
          blessing: rpData.blessing,
          created_at: this.helpers.nowSql(),
        }),
      );
    }

    await this.helpers.award(user.id, {
      exp: rewardNum(await this.site.getConfig('reward_post_exp'), 5),
      points: rewardNum(await this.site.getConfig('reward_post_points'), 2),
    });

    // @mentions
    const mentionedIds = new Set<number>();
    for (const name of this.helpers.parseMentions(content)) {
      const target = await this.users
        .createQueryBuilder('u')
        .where('u.username = :name OR u.nickname = :name', { name })
        .getOne();
      if (target) {
        mentionedIds.add(target.id);
        await this.helpers.notify({
          userId: target.id,
          actorId: user.id,
          type: 'mention',
          targetType: 'post',
          targetId: saved.id,
          preview: content.slice(0, 60),
        });
      }
    }

    // 话题订阅：公开动态发到某话题时提醒关注该话题的用户（跳过作者与已 @ 到的人；限量避免大扇出）
    if (topicId && visibility === 'public' && !circleId2) {
      // 内容通常已含 #话题#，直接用片段作预览，避免话题名重复
      const snippet =
        (content || '').replace(/\s+/g, ' ').trim().slice(0, 60) || `#${topicName}#`;
      const followers = await this.topicFollows.find({
        where: { topic_id: topicId },
        take: 500,
      });
      for (const f of followers) {
        if (f.user_id === user.id || mentionedIds.has(f.user_id)) continue;
        await this.helpers.notify({
          userId: f.user_id,
          actorId: user.id,
          type: 'topic',
          targetType: 'post',
          targetId: saved.id,
          preview: snippet,
        });
      }
    }

    const row = await this.posts.findOne({ where: { id: saved.id } });
    return { post: await this.serializePost(row!, user.id) };
  }

  // ---- POST /api/posts/:id/grab —— 抢红包(先到先得, 随机拆分) ----
  async grab(postId: number, user: User) {
    const rp = await this.redPackets.findOne({ where: { post_id: postId } });
    if (!rp) throw new NotFoundException('该动态没有红包');
    if (rp.user_id === user.id)
      throw new BadRequestException('不能抢自己发的红包');
    const existing = await this.redPacketGrabs.findOne({
      where: { packet_id: rp.id, user_id: user.id },
    });
    if (existing)
      throw new BadRequestException('你已经抢过这个红包啦');
    if (rp.remaining_count <= 0)
      throw new BadRequestException('红包已被抢光');

    // 微信式随机拆分：每次抢 [1, 2*avg]，封顶保证后面每人 ≥1
    let amount: number;
    if (rp.remaining_count === 1) {
      amount = rp.remaining_points;
    } else {
      const cap = Math.min(
        Math.floor((rp.remaining_points / rp.remaining_count) * 2),
        rp.remaining_points - (rp.remaining_count - 1),
      );
      amount = 1 + Math.floor(Math.random() * Math.max(1, cap));
    }

    await this.dataSource.transaction(async (mgr) => {
      await mgr.insert(RedPacketGrab, {
        packet_id: rp.id,
        user_id: user.id,
        amount,
        created_at: this.helpers.nowSql(),
      });
      await mgr.query(
        'UPDATE red_packets SET remaining_points = remaining_points - ?, remaining_count = remaining_count - 1 WHERE id = ?',
        [amount, rp.id],
      );
      await mgr.query('UPDATE users SET points = points + ? WHERE id = ?', [
        amount,
        user.id,
      ]);
    });
    await this.helpers.notify({
      userId: rp.user_id,
      actorId: user.id,
      type: 'redpacket',
      targetType: 'post',
      targetId: postId,
      preview: `抢到了你的 ${amount} 积分红包`,
    });
    return {
      amount,
      redPacket: await this.buildRedPacket(postId, user.id),
      user: await this.helpers.publicUser(
        await this.helpers.getUser(user.id),
        user.id,
      ),
    };
  }

  // ---- POST /api/posts/:id/vote ----
  async vote(id: number, user: User, dto: VoteDto) {
    const poll = await this.polls.findOne({ where: { post_id: id } });
    if (!poll) throw new NotFoundException('该动态没有投票');
    if (poll.deadline && poll.deadline <= this.helpers.nowSql())
      throw new BadRequestException('投票已结束');
    const already = await this.pollVotes.findOne({
      where: { poll_id: poll.id, user_id: user.id },
    });
    if (already) throw new BadRequestException('你已经投过票了');

    const validOptions = await this.pollOptions.find({
      where: { poll_id: poll.id },
    });
    const valid = new Set(validOptions.map((o) => o.id));
    let ids = Array.isArray(dto.optionIds) ? dto.optionIds : [dto.optionId];
    ids = [...new Set(ids.map(Number).filter((x) => valid.has(x)))];
    if (!poll.multi) ids = ids.slice(0, 1);
    if (!ids.length) throw new BadRequestException('请选择一个选项');

    await this.dataSource.transaction(async (mgr) => {
      for (const oid of ids) {
        await mgr.query(
          'INSERT IGNORE INTO poll_votes (poll_id, option_id, user_id) VALUES (?,?,?)',
          [poll.id, oid, user.id],
        ).catch(async () => {
          // postgres fallback (no INSERT IGNORE)
          await mgr.query(
            'INSERT INTO poll_votes (poll_id, option_id, user_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
            [poll.id, oid, user.id],
          );
        });
        await mgr.query('UPDATE poll_options SET votes = votes + 1 WHERE id = ?', [oid])
          .catch(() => mgr.query('UPDATE poll_options SET votes = votes + 1 WHERE id = $1', [oid]));
      }
      await mgr.query('UPDATE polls SET total_votes = total_votes + 1 WHERE id = ?', [poll.id])
        .catch(() => mgr.query('UPDATE polls SET total_votes = total_votes + 1 WHERE id = $1', [poll.id]));
    });
    await this.helpers.award(user.id, { exp: 1, points: 1 });
    return { poll: await this.buildPoll(id, user.id) };
  }

  // ---- POST /api/posts/:id/share ----
  async share(id: number, user: User, dto: ShareDto) {
    const src = await this.posts.findOne({ where: { id } });
    if (!src) throw new NotFoundException('动态不存在');
    const content = (dto.content || '').trim();
    const saved = await this.posts.save(
      this.posts.create({
        user_id: user.id,
        content,
        share_of: src.id,
        media_type: 'text',
        created_at: this.helpers.nowSql(),
      }),
    );
    await this.posts.increment({ id: src.id }, 'share_count', 1);
    await this.helpers.notify({
      userId: src.user_id,
      actorId: user.id,
      type: 'share',
      targetType: 'post',
      targetId: src.id,
    });
    await this.helpers.award(user.id, { exp: 2, points: 1 });
    const row = await this.posts.findOne({ where: { id: saved.id } });
    return { post: await this.serializePost(row!, user.id) };
  }

  // ---- POST /api/posts/:id/like ----
  async like(id: number, user: User) {
    const row = await this.posts.findOne({ where: { id } });
    if (!row) throw new NotFoundException('动态不存在');
    const liked = await this.likes.findOne({
      where: { user_id: user.id, target_type: 'post', target_id: row.id },
    });
    if (liked) {
      await this.likes.delete({
        user_id: user.id,
        target_type: 'post',
        target_id: row.id,
      });
      await this.posts.query(
        'UPDATE posts SET like_count = GREATEST(0, like_count - 1) WHERE id = ?',
        [row.id],
      ).catch(() =>
        this.posts.query(
          'UPDATE posts SET like_count = GREATEST(0, like_count - 1) WHERE id = $1',
          [row.id],
        ),
      );
      return { liked: false, likeCount: row.like_count - 1 };
    }
    await this.likes.insert({
      user_id: user.id,
      target_type: 'post',
      target_id: row.id,
      created_at: this.helpers.nowSql(),
    });
    await this.posts.increment({ id: row.id }, 'like_count', 1);
    await this.helpers.notify({
      userId: row.user_id,
      actorId: user.id,
      type: 'like',
      targetType: 'post',
      targetId: row.id,
      preview: (row.content || '').slice(0, 40),
    });
    await this.helpers.award(row.user_id, { exp: 1, points: 1 });
    return { liked: true, likeCount: row.like_count + 1 };
  }

  // ---- POST /api/posts/:id/react —— 表情回应：设置/切换/再点取消 ----
  async react(id: number, user: User, reactionRaw: string) {
    const row = await this.posts.findOne({ where: { id } });
    if (!row) throw new NotFoundException('动态不存在');
    const VALID = new Set(['like', 'love', 'haha', 'wow', 'support']);
    const reaction = VALID.has(reactionRaw) ? reactionRaw : 'like';
    const existing = await this.likes.findOne({
      where: { user_id: user.id, target_type: 'post', target_id: row.id },
    });
    if (existing) {
      if ((existing.reaction || 'like') === reaction) {
        // 同一回应再次点击 → 取消
        await this.likes.delete({ user_id: user.id, target_type: 'post', target_id: row.id });
        await this.posts.query('UPDATE posts SET like_count = GREATEST(0, like_count - 1) WHERE id = ?', [row.id]);
        return { myReaction: null, likeCount: Math.max(0, row.like_count - 1), reactions: await this.reactionCountsFor('post', row.id) };
      }
      // 切换回应 → 总数不变
      await this.likes.update({ user_id: user.id, target_type: 'post', target_id: row.id }, { reaction });
      return { myReaction: reaction, likeCount: row.like_count, reactions: await this.reactionCountsFor('post', row.id) };
    }
    // 新增回应
    await this.likes.insert({ user_id: user.id, target_type: 'post', target_id: row.id, reaction, created_at: this.helpers.nowSql() });
    await this.posts.increment({ id: row.id }, 'like_count', 1);
    await this.helpers.notify({ userId: row.user_id, actorId: user.id, type: 'like', targetType: 'post', targetId: row.id, preview: (row.content || '').slice(0, 40) });
    await this.helpers.award(row.user_id, { exp: 1, points: 1 });
    return { myReaction: reaction, likeCount: row.like_count + 1, reactions: await this.reactionCountsFor('post', row.id) };
  }

  // ---- GET /api/posts/:id/reactions —— 谁回应了(分组) ----
  async reactions(id: number, viewer: User | null) {
    const rows = await this.likes.find({
      where: { target_type: 'post', target_id: id },
      order: { created_at: 'DESC' },
      take: 100,
    });
    const reactors: any[] = [];
    for (const r of rows)
      reactors.push({
        user: await this.helpers.publicUser(await this.helpers.getUser(r.user_id), viewer?.id || null),
        reaction: r.reaction || 'like',
      });
    return { counts: (await this.reactionCountsFor('post', id)) || {}, reactors };
  }

  // ---- POST /api/posts/:id/unlock ----
  async unlock(id: number, user: User, password?: string) {
    const row = await this.posts.findOne({ where: { id } });
    if (!row) throw new NotFoundException('动态不存在');
    if (row.visibility === 'password') {
      if ((password || '') !== row.password)
        throw new ForbiddenException('密码错误');
      return {
        post: await this.serializePost({ ...row } as Post, user.id, {}),
        bypass: true,
        content: row.content,
        media: JSON.parse(row.media || '[]'),
      };
    }
    if (row.visibility !== 'paid')
      throw new BadRequestException('无需解锁');
    const already = await this.purchases.findOne({
      where: { user_id: user.id, post_id: row.id },
    });
    if (already) return { post: await this.serializePost(row, user.id) };
    if (user.points < row.price)
      throw new HttpException('积分不足，先去签到赚积分吧', 402);
    await this.users.decrement({ id: user.id }, 'points', row.price);
    await this.users.increment({ id: row.user_id }, 'points', row.price);
    await this.purchases.insert({
      user_id: user.id,
      post_id: row.id,
      created_at: this.helpers.nowSql(),
    });
    await this.helpers.notify({
      userId: row.user_id,
      actorId: user.id,
      type: 'reward',
      targetType: 'post',
      targetId: row.id,
      preview: `购买了你的付费内容 +${row.price}积分`,
    });
    return { post: await this.serializePost(row, user.id) };
  }

  // ---- POST /api/posts/:id/reward ----
  async reward(id: number, user: User, rawAmount?: any) {
    const row = await this.posts.findOne({ where: { id } });
    if (!row) throw new NotFoundException('动态不存在');
    const amount = Math.max(1, Math.min(9999, Number(rawAmount) || 0));
    if (user.points < amount) throw new HttpException('积分不足', 402);
    if (row.user_id === user.id)
      throw new BadRequestException('不能打赏自己');
    await this.users.decrement({ id: user.id }, 'points', amount);
    await this.users.increment({ id: row.user_id }, 'points', amount);
    await this.rewards.insert({
      from_id: user.id,
      to_id: row.user_id,
      post_id: row.id,
      amount,
      created_at: this.helpers.nowSql(),
    });
    await this.helpers.notify({
      userId: row.user_id,
      actorId: user.id,
      type: 'reward',
      targetType: 'post',
      targetId: row.id,
      preview: `打赏了你 ${amount} 积分 🎁`,
    });
    return { ok: true };
  }

  // ---- PUT /api/posts/:id ----
  async update(id: number, user: User, dto: UpdatePostDto) {
    const row = await this.posts.findOne({ where: { id } });
    if (!row) throw new NotFoundException('动态不存在');
    if (row.user_id !== user.id) throw new ForbiddenException('无权编辑');
    if (checkSensitive(dto.content))
      throw new BadRequestException('内容包含敏感信息，请修改后重试');
    const patch: Partial<Post> = { edited: 1 };
    if (dto.content != null) patch.content = dto.content;
    if (dto.media != null) patch.media = JSON.stringify(dto.media);
    if (dto.visibility != null) patch.visibility = dto.visibility;
    if (dto.price !== undefined) patch.price = Number(dto.price) || 0;
    await this.posts.update({ id: row.id }, patch);
    const fresh = await this.posts.findOne({ where: { id: row.id } });
    return { post: await this.serializePost(fresh!, user.id) };
  }

  // ---- POST /api/posts/:id/pin ----
  async pin(id: number, user: User) {
    const row = await this.posts.findOne({ where: { id } });
    if (!row) throw new NotFoundException('动态不存在');
    if (row.user_id !== user.id) throw new ForbiddenException('无权操作');
    if (row.pinned) {
      await this.posts.update({ id: row.id }, { pinned: 0 });
      return { pinned: false };
    }
    await this.posts.update({ user_id: user.id }, { pinned: 0 });
    await this.posts.update({ id: row.id }, { pinned: 1 });
    return { pinned: true };
  }

  // ---- POST /api/posts/:id/global-pin ----
  async globalPin(id: number, user: User) {
    const row = await this.posts.findOne({ where: { id } });
    if (!row) throw new NotFoundException('动态不存在');
    if (row.user_id !== user.id)
      throw new ForbiddenException('只能置顶自己的动态');
    const now = this.helpers.nowSql();
    if (row.global_pin_until && row.global_pin_until > now) {
      await this.posts.update({ id: row.id }, { global_pin_until: '' });
      return { globalPinned: false };
    }
    const card = await this.orders
      .createQueryBuilder('o')
      .innerJoin(Product, 'p', 'p.id = o.product_id')
      .where("o.user_id = :uid AND p.payload = 'pin' AND o.used = 0", {
        uid: user.id,
      })
      .orderBy('o.created_at', 'ASC')
      .getOne();
    if (!card)
      throw new ForbiddenException(
        '需要一张「全站置顶卡」，请先到积分商城兑换',
      );
    const until = new Date(Date.now() + 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 19)
      .replace('T', ' ');
    await this.orders.update({ id: card.id }, { used: 1 });
    await this.posts.update({ id: row.id }, { global_pin_until: until });
    return { globalPinned: true, until };
  }

  // ---- POST /api/posts/:id/bookmark ----
  async bookmark(id: number, user: User) {
    const row = await this.posts.findOne({
      where: { id },
      select: ['id'],
    });
    if (!row) throw new NotFoundException('动态不存在');
    const has = await this.bookmarks.findOne({
      where: { user_id: user.id, post_id: row.id },
    });
    if (has) {
      await this.bookmarks.delete({ user_id: user.id, post_id: row.id });
      return { bookmarked: false };
    }
    await this.bookmarks.insert({
      user_id: user.id,
      post_id: row.id,
      created_at: this.helpers.nowSql(),
    });
    return { bookmarked: true };
  }

  // ---- DELETE /api/posts/:id ----
  async remove(id: number, user: User) {
    const row = await this.posts.findOne({ where: { id } });
    if (!row) throw new NotFoundException('动态不存在');
    if (row.user_id !== user.id && user.role !== 'admin')
      throw new ForbiddenException('无权删除');
    await this.posts.delete({ id: row.id });
    return { ok: true };
  }

  private async findUserByHandle(name: string): Promise<User | null> {
    return (
      (await this.users.findOne({ where: { username: name } })) ||
      (await this.users.findOne({ where: { nickname: name } }))
    );
  }

  // ---- GET /api/posts/user/:username ----
  async byUser(username: string, viewer: User | null, rawLimit?: any, rawOffset?: any) {
    const u = await this.findUserByHandle(username);
    if (!u) throw new NotFoundException('用户不存在');
    const limit = Math.min(30, Math.max(1, Number(rawLimit) || 20));
    const offset = Math.max(0, Number(rawOffset) || 0);
    // 多取一条判断是否还有下一页（个人主页帖子分页）
    const rows = await this.posts.find({
      where: { user_id: u.id },
      order: { pinned: 'DESC', created_at: 'DESC' },
      take: limit + 1,
      skip: offset,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { posts: await this.serializeMany(page, viewer?.id || null), hasMore };
  }

  // ---- GET /api/posts/liked/:username ----
  async likedByUser(username: string, viewer: User | null, rawLimit?: any, rawOffset?: any) {
    const u = await this.findUserByHandle(username);
    if (!u) throw new NotFoundException('用户不存在');
    const limit = Math.min(30, Math.max(1, Number(rawLimit) || 20));
    const offset = Math.max(0, Number(rawOffset) || 0);
    const rows: Post[] = await this.posts
      .createQueryBuilder('p')
      .innerJoin(
        Like,
        'l',
        "l.target_id = p.id AND l.target_type = 'post'",
      )
      .where('l.user_id = :uid', { uid: u.id })
      .andWhere("p.visibility NOT IN ('private','anonymous')")
      .orderBy('l.created_at', 'DESC')
      .limit(limit + 1)
      .offset(offset)
      .getMany();
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { posts: await this.serializeMany(page, viewer?.id || null), hasMore };
  }

  // ---- used by users module (GET /api/users/me/bookmarks) ----
  async bookmarkedPosts(user: User, rawLimit?: any, rawOffset?: any) {
    const limit = Math.min(30, Math.max(1, Number(rawLimit) || 20));
    const offset = Math.max(0, Number(rawOffset) || 0);
    const rows: Post[] = await this.posts
      .createQueryBuilder('p')
      .innerJoin(Bookmark, 'b', 'b.post_id = p.id')
      .where('b.user_id = :uid', { uid: user.id })
      .orderBy('b.created_at', 'DESC')
      .limit(limit + 1)
      .offset(offset)
      .getMany();
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { posts: await this.serializeMany(page, user.id), hasMore };
  }
}
