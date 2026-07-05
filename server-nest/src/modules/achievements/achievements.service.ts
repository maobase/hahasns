import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Answer,
  Circle,
  Comment,
  Follow,
  Like,
  PollVote,
  Post,
  TaskClaim,
  User,
  UserBadge,
} from '../../database/entities';
import { HelpersService } from '../../common/helpers.service';

interface TaskDef {
  key: string;
  title: string;
  desc: string;
  icon: string;
  points: number;
  target: number;
  daily: boolean;
  progress: (uid: number) => Promise<number>;
}

interface BadgeDef {
  key: string;
  name: string;
  desc: string;
  icon: string;
  tier: string;
  check: (s: any) => boolean;
}

/**
 * Ported from server/src/routes/achievements.js. Daily/growth tasks (progress
 * derived live), achievement badges (unlock derived from cumulative stats,
 * persisted once), and claim. Response shapes match the Express version.
 * `created_at >= today` comparisons use a JS-computed date string so they are
 * portable across MySQL/Postgres (timestamps are stored as sortable strings).
 */
@Injectable()
export class AchievementsService {
  private readonly tasks: TaskDef[];
  private readonly badges: BadgeDef[];

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Post) private readonly posts: Repository<Post>,
    @InjectRepository(Comment) private readonly comments: Repository<Comment>,
    @InjectRepository(Like) private readonly likes: Repository<Like>,
    @InjectRepository(PollVote)
    private readonly pollVotes: Repository<PollVote>,
    @InjectRepository(Follow) private readonly follows: Repository<Follow>,
    @InjectRepository(Answer) private readonly answers: Repository<Answer>,
    @InjectRepository(Circle) private readonly circles: Repository<Circle>,
    @InjectRepository(UserBadge)
    private readonly userBadges: Repository<UserBadge>,
    @InjectRepository(TaskClaim)
    private readonly taskClaims: Repository<TaskClaim>,
    private readonly helpers: HelpersService,
  ) {
    const today = () => this.helpers.today();
    const since = today; // 'YYYY-MM-DD' — string-comparable against created_at

    this.tasks = [
      {
        key: 'checkin',
        title: '每日签到',
        desc: '完成今天的签到',
        icon: 'checkin',
        points: 5,
        target: 1,
        daily: true,
        progress: async (uid) => {
          const u = await this.helpers.getUser(uid);
          return u?.last_checkin === today() ? 1 : 0;
        },
      },
      {
        key: 'post',
        title: '发布动态',
        desc: '发布 1 条动态',
        icon: 'edit',
        points: 10,
        target: 1,
        daily: true,
        progress: (uid) =>
          this.posts
            .createQueryBuilder('p')
            .where('p.user_id = :uid AND p.created_at >= :d', {
              uid,
              d: since(),
            })
            .getCount(),
      },
      {
        key: 'comment',
        title: '评论互动',
        desc: '评论 3 次',
        icon: 'comment',
        points: 6,
        target: 3,
        daily: true,
        progress: (uid) =>
          this.comments
            .createQueryBuilder('c')
            .where('c.user_id = :uid AND c.created_at >= :d', {
              uid,
              d: since(),
            })
            .getCount(),
      },
      {
        key: 'like',
        title: '点赞他人',
        desc: '点赞 5 次',
        icon: 'heart',
        points: 4,
        target: 5,
        daily: true,
        progress: (uid) =>
          this.likes
            .createQueryBuilder('l')
            .where('l.user_id = :uid AND l.created_at >= :d', {
              uid,
              d: since(),
            })
            .getCount(),
      },
      {
        key: 'vote',
        title: '参与投票',
        desc: '参与 1 次投票',
        icon: 'poll',
        points: 3,
        target: 1,
        daily: true,
        progress: (uid) =>
          this.pollVotes
            .createQueryBuilder('v')
            .where('v.user_id = :uid AND v.created_at >= :d', {
              uid,
              d: since(),
            })
            .getCount(),
      },
      {
        key: 'profile',
        title: '完善资料',
        desc: '设置头像和个人简介',
        icon: 'user',
        points: 20,
        target: 1,
        daily: false,
        progress: async (uid) => {
          const u = await this.helpers.getUser(uid);
          return u &&
            u.bio &&
            u.bio.trim() &&
            !u.bio.startsWith('emoji:') &&
            u.avatar
            ? 1
            : 0;
        },
      },
    ];

    this.badges = [
      { key: 'newcomer', name: '初来乍到', desc: '发布第一条动态', icon: 'edit', tier: 'bronze', check: (s) => s.posts >= 1 },
      { key: 'writer', name: '笔耕不辍', desc: '累计发布 20 条动态', icon: 'edit', tier: 'silver', check: (s) => s.posts >= 20 },
      { key: 'voter', name: '热心参与', desc: '累计参与 10 次投票', icon: 'poll', tier: 'bronze', check: (s) => s.votes >= 10 },
      { key: 'checkin7', name: '签到坚持', desc: '连续签到满 7 天', icon: 'checkin', tier: 'silver', check: (s) => s.streak >= 7 },
      { key: 'social', name: '社交达人', desc: '粉丝数达到 50', icon: 'users', tier: 'silver', check: (s) => s.followers >= 50 },
      { key: 'popular', name: '人气作者', desc: '累计获得 200 个赞', icon: 'heart', tier: 'gold', check: (s) => s.likesRecv >= 200 },
      { key: 'helper', name: '乐于助人', desc: '有回答被采纳', icon: 'check', tier: 'gold', check: (s) => s.accepted >= 1 },
      { key: 'founder', name: '圈子主理人', desc: '创建过一个圈子', icon: 'users', tier: 'gold', check: (s) => s.circlesOwned >= 1 },
      { key: 'vip', name: '尊享会员', desc: '开通 VIP 会员', icon: 'shield', tier: 'gold', check: (s) => s.vip },
    ];
  }

  private async userStats(uid: number) {
    const u = await this.helpers.getUser(uid);
    const posts = await this.posts
      .createQueryBuilder('p')
      .where('p.user_id = :uid AND p.share_of IS NULL', { uid })
      .getCount();
    const likesRecvRaw = await this.posts
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.like_count), 0)', 'c')
      .where('p.user_id = :uid', { uid })
      .getRawOne();
    const followers = await this.follows.count({
      where: { following_id: uid },
    });
    const accepted = await this.answers.count({
      where: { user_id: uid, accepted: 1 },
    });
    const circlesOwned = await this.circles.count({
      where: { owner_id: uid },
    });
    const votes = await this.pollVotes.count({ where: { user_id: uid } });
    return {
      posts,
      likesRecv: Number(likesRecvRaw?.c || 0),
      followers,
      streak: u?.checkin_streak || 0,
      accepted,
      circlesOwned,
      votes,
      vip: !!u?.vip,
    };
  }

  private async evalTasks(uid: number) {
    const day = this.helpers.today();
    const out: any[] = [];
    for (const t of this.tasks) {
      const prog = Math.min(await t.progress(uid), t.target);
      const slot = t.daily ? day : 'once';
      const claimed = !!(await this.taskClaims.findOne({
        where: { user_id: uid, task_key: t.key, ymd: slot },
      }));
      const done = prog >= t.target;
      const points = await this.helpers.configNum('task_' + t.key + '_points', t.points);
      out.push({
        key: t.key,
        title: t.title,
        desc: t.desc,
        icon: t.icon,
        points,
        target: t.target,
        daily: !!t.daily,
        progress: prog,
        done,
        claimed,
        claimable: done && !claimed,
      });
    }
    return out;
  }

  private async evalBadges(uid: number, { persist = false } = {}) {
    const stats = await this.userStats(uid);
    const ownedRows = await this.userBadges.find({ where: { user_id: uid } });
    const owned = new Map(
      ownedRows.map((r) => [r.badge_key, r.unlocked_at]),
    );
    const out: any[] = [];
    for (const b of this.badges) {
      const unlocked = b.check(stats);
      if (unlocked && persist && !owned.has(b.key)) {
        await this.userBadges
          .createQueryBuilder()
          .insert()
          .into(UserBadge)
          .values({
            user_id: uid,
            badge_key: b.key,
            unlocked_at: this.helpers.nowSql(),
          })
          .orIgnore()
          .execute();
        owned.set(b.key, 'new');
      }
      out.push({
        key: b.key,
        name: b.name,
        desc: b.desc,
        icon: b.icon,
        tier: b.tier,
        unlocked: unlocked || owned.has(b.key),
        unlockedAt: owned.get(b.key) || null,
      });
    }
    return { badges: out, stats };
  }

  // ---- GET /api/achievements ----
  async overview(user: User) {
    const tasks = await this.evalTasks(user.id);
    const { badges, stats } = await this.evalBadges(user.id, { persist: true });
    return {
      tasks,
      badges,
      stats,
      claimablePoints: tasks
        .filter((t) => t.claimable)
        .reduce((a, t) => a + t.points, 0),
      unlockedCount: badges.filter((b) => b.unlocked).length,
    };
  }

  // ---- GET /api/achievements/user/:id/badges ----
  async userBadgeWall(id: number, viewer: User | null) {
    const u = await this.helpers.getUser(id);
    if (!u) throw new NotFoundException('用户不存在');
    const { badges } = await this.evalBadges(u.id, { persist: false });
    return {
      badges,
      user: await this.helpers.publicUser(u, viewer?.id || null),
    };
  }

  // ---- POST /api/achievements/claim/:key ----
  async claim(key: string, user: User) {
    const t = this.tasks.find((x) => x.key === key);
    if (!t) throw new NotFoundException('任务不存在');
    const slot = t.daily ? this.helpers.today() : 'once';
    const claimed = await this.taskClaims.findOne({
      where: { user_id: user.id, task_key: t.key, ymd: slot },
    });
    if (claimed) throw new BadRequestException('该奖励已领取');
    if ((await t.progress(user.id)) < t.target)
      throw new BadRequestException('任务尚未完成');
    await this.taskClaims.insert({
      user_id: user.id,
      task_key: t.key,
      ymd: slot,
      claimed_at: this.helpers.nowSql(),
    });
    const points = await this.helpers.configNum('task_' + t.key + '_points', t.points);
    await this.helpers.award(user.id, { points });
    return {
      ok: true,
      points,
      user: await this.helpers.publicUser(
        await this.helpers.getUser(user.id),
        user.id,
      ),
    };
  }
}
