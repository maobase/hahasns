import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Board,
  BoardFollow,
  BoardPurchase,
  Like,
  Moderator,
  Thread,
  ThreadSub,
  User,
} from '../../database/entities';
import { HelpersService } from '../../common/helpers.service';
import { RateLimitService } from '../../common/rate-limit.service';
import { checkSensitive } from '../../common/sensitive';
import {
  CreateThreadDto,
  ModerateThreadDto,
  UpdateThreadDto,
} from './dto/forum.dto';

/**
 * Ported from server/src/routes/forum.js. Boards (nested), threads, likes,
 * board follows, moderators and moderation. Response shapes match the Express
 * version (serializeBoard recurses, serializeThread embeds board + author).
 */
@Injectable()
export class ForumService {
  constructor(
    @InjectRepository(Board) private readonly boards: Repository<Board>,
    @InjectRepository(BoardFollow)
    private readonly boardFollows: Repository<BoardFollow>,
    @InjectRepository(Moderator)
    private readonly moderators: Repository<Moderator>,
    @InjectRepository(Thread) private readonly threads: Repository<Thread>,
    @InjectRepository(Like) private readonly likes: Repository<Like>,
    @InjectRepository(ThreadSub)
    private readonly threadSubs: Repository<ThreadSub>,
    @InjectRepository(BoardPurchase)
    private readonly boardPurchases: Repository<BoardPurchase>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly helpers: HelpersService,
    private readonly rateLimit: RateLimitService,
  ) {}

  private async isModerator(
    boardId: number,
    userId: number | null,
  ): Promise<boolean> {
    if (!userId) return false;
    const u = await this.helpers.getUser(userId);
    if (u?.role === 'admin') return true;
    return !!(await this.moderators.findOne({
      where: { board_id: boardId, user_id: userId },
    }));
  }

  /** 付费板块对非买家/非版主/非管理员锁定。Mirrors Express boardLockedFor. */
  private async boardLockedFor(
    board: Board | null,
    viewerId: number | null,
  ): Promise<boolean> {
    if (!board || !board.is_paid || board.price <= 0) return false;
    if (await this.isModerator(board.id, viewerId)) return false; // 版主+管理员放行
    if (!viewerId) return true;
    return !(await this.boardPurchases.findOne({
      where: { user_id: viewerId, board_id: board.id },
    }));
  }

  private async serializeBoard(
    b: Board,
    viewerId: number | null = null,
  ): Promise<any> {
    const mods: User[] = await this.users
      .createQueryBuilder('u')
      .innerJoin(Moderator, 'm', 'm.user_id = u.id')
      .where('m.board_id = :bid', { bid: b.id })
      .getMany();
    const children = await this.boards.find({
      where: { parent_id: b.id },
      order: { sort: 'ASC', id: 'ASC' },
    });
    const followers = await this.boardFollows.count({
      where: { board_id: b.id },
    });
    const isFollowing = viewerId
      ? !!(await this.boardFollows.findOne({
          where: { user_id: viewerId, board_id: b.id },
        }))
      : false;
    const kids: any[] = [];
    for (const c of children)
      kids.push(await this.serializeBoard(c, viewerId));
    const threadCount =
      b.thread_count + kids.reduce((s, c) => s + (c.threadCount || 0), 0);
    const modPublic: any[] = [];
    for (const m of mods) modPublic.push(await this.helpers.publicUser(m));
    // 付费板块门禁：买家/版主/管理员之外锁定
    const purchased = viewerId
      ? !!(await this.boardPurchases.findOne({
          where: { user_id: viewerId, board_id: b.id },
        }))
      : false;
    const locked = await this.boardLockedFor(b, viewerId);
    return {
      id: b.id,
      name: b.name,
      slug: b.slug,
      description: b.description,
      cover: b.cover,
      icon: b.icon,
      announcement: b.announcement,
      isPaid: !!b.is_paid,
      price: b.price,
      purchased,
      locked,
      threadCount,
      parentId: b.parent_id,
      followers,
      isFollowing,
      moderators: modPublic,
      children: kids,
    };
  }

  private async serializeThread(
    t: Thread,
    viewerId: number | null,
    { full = false }: { full?: boolean } = {},
  ) {
    const fullBoard = await this.boards.findOne({ where: { id: t.board_id } });
    const board = fullBoard
      ? {
          id: fullBoard.id,
          name: fullBoard.name,
          slug: fullBoard.slug,
          icon: fullBoard.icon,
        }
      : null;
    const liked = viewerId
      ? !!(await this.likes.findOne({
          where: { user_id: viewerId, target_type: 'thread', target_id: t.id },
        }))
      : false;
    const isSubscribed =
      full && viewerId
        ? !!(await this.threadSubs.findOne({
            where: { user_id: viewerId, thread_id: t.id },
          }))
        : false;
    return {
      id: t.id,
      title: t.title,
      content: full ? t.content : (t.content || '').slice(0, 120),
      media: full ? JSON.parse(t.media || '[]') : [],
      pinned: !!t.pinned,
      elite: !!t.elite,
      locked: !!t.locked,
      edited: !!t.edited,
      views: t.views,
      likeCount: t.like_count,
      replyCount: t.reply_count,
      liked,
      isSubscribed,
      createdAt: t.created_at,
      lastReplyAt: t.last_reply_at,
      board,
      author: await this.helpers.publicUser(
        await this.helpers.getUser(t.user_id),
        viewerId,
      ),
      canModerate: await this.isModerator(t.board_id, viewerId),
      boardLocked: await this.boardLockedFor(fullBoard, viewerId),
    };
  }

  private async mapThreads(
    rows: Thread[],
    viewerId: number | null,
    opts: { full?: boolean } = {},
  ) {
    const out: any[] = [];
    for (const t of rows)
      out.push(await this.serializeThread(t, viewerId, opts));
    return out;
  }

  // ---- GET /api/forum/boards ----
  async listBoards(viewer: User | null) {
    const tops = await this.boards.find({
      where: { parent_id: null as any },
      order: { sort: 'ASC', id: 'ASC' },
    });
    const boards: any[] = [];
    for (const b of tops)
      boards.push(await this.serializeBoard(b, viewer?.id || null));
    return { boards };
  }

  // ---- GET /api/forum/my-boards ----
  async myBoards(user: User) {
    const rows: Board[] = await this.boards
      .createQueryBuilder('b')
      .innerJoin(BoardFollow, 'f', 'f.board_id = b.id')
      .where('f.user_id = :uid', { uid: user.id })
      .orderBy('f.created_at', 'DESC')
      .getMany();
    const boards: any[] = [];
    for (const b of rows) boards.push(await this.serializeBoard(b, user.id));
    return { boards };
  }

  // ---- POST /api/forum/boards/:id/follow ----
  async followBoard(id: number, user: User) {
    const b = await this.boards.findOne({
      where: { id },
      select: ['id'],
    });
    if (!b) throw new NotFoundException('板块不存在');
    const has = await this.boardFollows.findOne({
      where: { user_id: user.id, board_id: b.id },
    });
    if (has) {
      await this.boardFollows.delete({ user_id: user.id, board_id: b.id });
      return { following: false };
    }
    await this.boardFollows.insert({
      user_id: user.id,
      board_id: b.id,
      created_at: this.helpers.nowSql(),
    });
    return { following: true };
  }

  // ---- GET /api/forum/boards/:slug ----
  async boardDetail(slug: string, sort: string | undefined, viewer: User | null) {
    const b = await this.boards.findOne({ where: { slug } });
    if (!b) throw new NotFoundException('板块不存在');
    const sBoard = await this.serializeBoard(b, viewer?.id || null);
    // 付费板块未解锁 → 不返回帖子列表
    if (sBoard.locked) return { board: sBoard, threads: [] };
    const childIds = (
      await this.boards.find({
        where: { parent_id: b.id },
        select: ['id'],
      })
    ).map((r) => r.id);
    const boardIds = [b.id, ...childIds];
    let qb = this.threads
      .createQueryBuilder('t')
      .where('t.board_id IN (:...ids)', { ids: boardIds })
      .orderBy('t.pinned', 'DESC');
    if (sort === 'hot')
      qb = qb
        .addOrderBy(
          '(t.like_count * 2 + t.reply_count * 3 + t.views * 0.1)',
          'DESC',
        )
        .addOrderBy('t.last_reply_at', 'DESC');
    else if (sort === 'elite')
      qb = qb
        .addOrderBy('t.elite', 'DESC')
        .addOrderBy('t.last_reply_at', 'DESC');
    else qb = qb.addOrderBy('t.last_reply_at', 'DESC');
    const threads = await qb.limit(50).getMany();
    return {
      board: sBoard,
      threads: await this.mapThreads(threads, viewer?.id || null),
    };
  }

  // ---- GET /api/forum/threads ----
  async listThreads(sort: string | undefined, viewer: User | null, offset = 0, limit = 20) {
    const off = Math.max(0, Number(offset) || 0);
    const lim = Math.min(50, Math.max(1, Number(limit) || 20));
    let qb = this.threads.createQueryBuilder('t').orderBy('t.pinned', 'DESC');
    if (sort === 'hot')
      qb = qb
        .addOrderBy(
          '(t.like_count * 2 + t.reply_count * 3 + t.views * 0.1)',
          'DESC',
        )
        .addOrderBy('t.last_reply_at', 'DESC');
    else if (sort === 'elite')
      qb = qb
        .addOrderBy('t.elite', 'DESC')
        .addOrderBy('t.last_reply_at', 'DESC');
    else qb = qb.addOrderBy('t.last_reply_at', 'DESC');
    // fetch one extra row to detect whether more pages remain
    const fetched = await qb.offset(off).limit(lim + 1).getMany();
    const hasMore = fetched.length > lim;
    const rows = hasMore ? fetched.slice(0, lim) : fetched;
    const threads = await this.mapThreads(rows, viewer?.id || null);
    // 不暴露未解锁付费板块的帖子
    return { threads: threads.filter((t) => !t.boardLocked), hasMore };
  }

  // ---- GET /api/forum/threads/user/:username ----
  async threadsByUser(username: string, viewer: User | null) {
    const u =
      (await this.users.findOne({ where: { username } })) ||
      (await this.users.findOne({ where: { nickname: username } }));
    if (!u) throw new NotFoundException('用户不存在');
    const rows = await this.threads.find({
      where: { user_id: u.id },
      order: { created_at: 'DESC' },
      take: 50,
    });
    return { threads: await this.mapThreads(rows, viewer?.id || null) };
  }

  // ---- GET /api/forum/threads/:id ----
  async threadDetail(id: number, viewer: User | null) {
    const t = await this.threads.findOne({ where: { id } });
    if (!t) throw new NotFoundException('帖子不存在');
    // 付费板块未解锁 → 返回付费墙 stub（无正文）
    const board = await this.boards.findOne({ where: { id: t.board_id } });
    if (await this.boardLockedFor(board, viewer?.id || null)) {
      return {
        thread: {
          id: t.id,
          title: t.title,
          paywalled: true,
          content: '',
          board: board
            ? {
                id: board.id,
                name: board.name,
                slug: board.slug,
                icon: board.icon,
                isPaid: !!board.is_paid,
                price: board.price,
              }
            : null,
        },
      };
    }
    await this.threads.increment({ id: t.id }, 'views', 1);
    t.views += 1;
    return {
      thread: await this.serializeThread(t, viewer?.id || null, { full: true }),
    };
  }

  // ---- POST /api/forum/boards/:id/purchase —— 积分解锁付费板块(永久) ----
  async purchaseBoard(id: number, user: User) {
    const b = await this.boards.findOne({ where: { id } });
    if (!b) throw new NotFoundException('板块不存在');
    if (!b.is_paid || b.price <= 0)
      throw new BadRequestException('该板块无需购买');
    if (
      await this.boardPurchases.findOne({
        where: { user_id: user.id, board_id: b.id },
      })
    )
      return { ok: true, alreadyOwned: true };
    const u = (await this.helpers.getUser(user.id))!;
    if ((u.points || 0) < b.price)
      throw new BadRequestException(
        `积分不足，解锁需要 ${b.price} 积分，你当前有 ${u.points || 0}`,
      );
    await this.users.update({ id: u.id }, { points: (u.points || 0) - b.price });
    await this.boardPurchases.save(
      this.boardPurchases.create({
        user_id: u.id,
        board_id: b.id,
        created_at: this.helpers.nowSql(),
      }),
    );
    return { ok: true, points: (u.points || 0) - b.price };
  }

  // ---- POST /api/forum/threads ----
  async createThread(user: User, dto: CreateThreadDto) {
    await this.rateLimit.enforce('thread', user); // 防灌水：超频抛 429（管理员豁免/开关关则放行）
    const { boardId } = dto;
    const title = (dto.title || '').trim();
    const content = (dto.content || '').trim();
    const media = dto.media || [];
    if (!boardId || !title || !content)
      throw new BadRequestException('板块、标题、内容均必填');
    if (checkSensitive(title) || checkSensitive(content))
      throw new BadRequestException('内容包含敏感信息，请修改后重试');
    const board = await this.boards.findOne({ where: { id: boardId } });
    if (!board) throw new NotFoundException('板块不存在');
    const now = this.helpers.nowSql();
    const saved = await this.threads.save(
      this.threads.create({
        board_id: boardId,
        user_id: user.id,
        title,
        content,
        media: JSON.stringify(media),
        last_reply_at: now,
        created_at: now,
      }),
    );
    await this.boards.increment({ id: boardId }, 'thread_count', 1);
    // 楼主自动订阅自己的帖子（有新回复时收到通知）
    await this.threadSubs
      .createQueryBuilder()
      .insert()
      .values({ user_id: user.id, thread_id: saved.id, created_at: now })
      .orIgnore()
      .execute();
    await this.helpers.award(user.id, { exp: 8, points: 5 }, 'thread');
    const t = await this.threads.findOne({ where: { id: saved.id } });
    return {
      thread: await this.serializeThread(t!, user.id, { full: true }),
    };
  }

  // ---- POST /api/forum/threads/:id/subscribe —— 订阅/取消订阅（toggle）----
  async subscribe(id: number, user: User) {
    const t = await this.threads.findOne({ where: { id } });
    if (!t) throw new NotFoundException('帖子不存在');
    const has = await this.threadSubs.findOne({
      where: { user_id: user.id, thread_id: t.id },
    });
    if (has) {
      await this.threadSubs.delete({ user_id: user.id, thread_id: t.id });
      return { subscribed: false };
    }
    await this.threadSubs.save(
      this.threadSubs.create({
        user_id: user.id,
        thread_id: t.id,
        created_at: this.helpers.nowSql(),
      }),
    );
    return { subscribed: true };
  }

  // ---- POST /api/forum/threads/:id/like ----
  async likeThread(id: number, user: User) {
    const t = await this.threads.findOne({ where: { id } });
    if (!t) throw new NotFoundException('帖子不存在');
    const liked = await this.likes.findOne({
      where: { user_id: user.id, target_type: 'thread', target_id: t.id },
    });
    if (liked) {
      await this.likes.delete({
        user_id: user.id,
        target_type: 'thread',
        target_id: t.id,
      });
      await this.threads
        .query(
          'UPDATE threads SET like_count = GREATEST(0, like_count - 1) WHERE id = ?',
          [t.id],
        )
        .catch(() =>
          this.threads.query(
            'UPDATE threads SET like_count = GREATEST(0, like_count - 1) WHERE id = $1',
            [t.id],
          ),
        );
      return { liked: false, likeCount: t.like_count - 1 };
    }
    await this.likes.insert({
      user_id: user.id,
      target_type: 'thread',
      target_id: t.id,
      created_at: this.helpers.nowSql(),
    });
    await this.threads.increment({ id: t.id }, 'like_count', 1);
    await this.helpers.notify({
      userId: t.user_id,
      actorId: user.id,
      type: 'like',
      targetType: 'thread',
      targetId: t.id,
      preview: (t.title || '').slice(0, 40),
    });
    return { liked: true, likeCount: t.like_count + 1 };
  }

  // ---- PUT /api/forum/threads/:id ----
  async updateThread(id: number, user: User, dto: UpdateThreadDto) {
    const t = await this.threads.findOne({ where: { id } });
    if (!t) throw new NotFoundException('帖子不存在');
    if (t.user_id !== user.id) throw new ForbiddenException('无权编辑');
    if (checkSensitive(dto.title) || checkSensitive(dto.content))
      throw new BadRequestException('内容包含敏感信息，请修改后重试');
    const patch: Partial<Thread> = { edited: 1 };
    if (dto.title != null) patch.title = dto.title;
    if (dto.content != null) patch.content = dto.content;
    await this.threads.update({ id: t.id }, patch);
    const fresh = await this.threads.findOne({ where: { id: t.id } });
    return {
      thread: await this.serializeThread(fresh!, user.id, { full: true }),
    };
  }

  // ---- POST /api/forum/threads/:id/moderate ----
  async moderate(id: number, user: User, dto: ModerateThreadDto) {
    const t = await this.threads.findOne({ where: { id } });
    if (!t) throw new NotFoundException('帖子不存在');
    const action = dto.action;
    const mod = await this.isModerator(t.board_id, user.id);
    const owner = t.user_id === user.id;
    if (action === 'delete') {
      if (!mod && !owner) throw new ForbiddenException('无权删除');
      await this.threads.delete({ id: t.id });
      await this.boards
        .query(
          'UPDATE boards SET thread_count = GREATEST(0, thread_count - 1) WHERE id = ?',
          [t.board_id],
        )
        .catch(() =>
          this.boards.query(
            'UPDATE boards SET thread_count = GREATEST(0, thread_count - 1) WHERE id = $1',
            [t.board_id],
          ),
        );
      return { ok: true, deleted: true };
    }
    if (!mod) throw new ForbiddenException('需要版主权限');
    const map: Record<string, 'pinned' | 'elite' | 'locked'> = {
      pin: 'pinned',
      elite: 'elite',
      lock: 'locked',
    };
    const col = map[action || ''];
    if (!col) throw new BadRequestException('未知操作');
    const next = t[col] ? 0 : 1;
    await this.threads.update({ id: t.id }, { [col]: next } as any);
    return { ok: true, [col]: !!next };
  }
}
