import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminLog, Follow, Notification, Post, SiteConfig, User, ViewHistory } from '../database/entities';

/**
 * 解析后台配置的奖励数值（经验/积分）。空/非法回退到内置默认；**允许 0**
 * （站长可把某项奖励设为 0），故用 Number.isFinite + >=0 判定而非 `Number(x) || def`
 * （后者会把合法的 0 误判成 falsy 回退到默认）。
 */
export function rewardNum(raw: string | null | undefined, fallback: number): number {
  // 未配置（null/undefined/空串）→ 用默认。注意 Number(null)、Number('') 都等于 0，
  // 若不先挡掉，未配置的站点会被误判成「奖励 0」而非默认值——必须显式 return fallback。
  if (raw === null || raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * VIP 等级积分加成倍率。vipN_bonus_pct 为百分比（默认 VIP1=20 / VIP2=50 / VIP3=100，
 * 即 ×1.2 / ×1.5 / ×2）；非 VIP（0）无加成。负百分比按 0 处理，保证倍率 >= 1。
 */
export function vipMultiplier(vipLevel: number, v1pct: number, v2pct: number, v3pct: number): number {
  const pct = vipLevel >= 3 ? v3pct : vipLevel === 2 ? v2pct : vipLevel === 1 ? v1pct : 0;
  return 1 + Math.max(0, pct) / 100;
}

/** 升到某等级所需累计经验：base * (level-1)^1.7。base 后台可配（默认 30）。 */
export function expForLevelPure(base: number, level: number): number {
  return Math.round(base * Math.pow(level - 1, 1.7));
}

/**
 * Ported from server/src/helpers.js. Centralizes the level curve, the public
 * user shape (never leaks password_hash), notifications, exp/points awards,
 * and the @mention / #topic# parsers. Response shapes are byte-for-byte
 * compatible with the Express version so the client works unchanged.
 */
@Injectable()
export class HelpersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Follow) private readonly follows: Repository<Follow>,
    @InjectRepository(Post) private readonly posts: Repository<Post>,
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
    @InjectRepository(ViewHistory)
    private readonly viewHistory: Repository<ViewHistory>,
    @InjectRepository(AdminLog)
    private readonly adminLog: Repository<AdminLog>,
    @InjectRepository(SiteConfig)
    private readonly siteConfig: Repository<SiteConfig>,
  ) {}

  /** 读取站点配置原始字符串（未配置→null）。common.module 已注册 SiteConfig repo，无需依赖 SiteModule。 */
  private async cfg(key: string): Promise<string | null> {
    const row = await this.siteConfig.findOne({ where: { key } });
    return row ? row.value : null;
  }

  /** 记录管理操作日志（admin_audit_log）。非关键路径，出错静默吞掉。Mirrors helpers.js logAdmin. */
  async logAdmin(
    adminId: number | null | undefined,
    action: string,
    {
      targetType = '',
      targetId = null,
      detail = '',
    }: { targetType?: string; targetId?: number | null; detail?: string } = {},
  ): Promise<void> {
    if (!adminId) return;
    try {
      await this.adminLog.save(
        this.adminLog.create({
          admin_id: adminId,
          action,
          target_type: targetType,
          target_id: targetId == null ? null : Number(targetId),
          detail: String(detail).slice(0, 300),
          created_at: this.nowSql(),
        }),
      );
    } catch {
      /* audit 非关键，忽略 */
    }
  }

  /** 记录浏览足迹（每用户每内容一行，重复浏览刷新 viewed_at）。未登录则跳过。 */
  async recordView(userId: number | undefined | null, targetType: string, targetId: number) {
    if (!userId) return;
    await this.viewHistory.save(
      this.viewHistory.create({ user_id: userId, target_type: targetType, target_id: targetId, viewed_at: this.nowSql() }),
    );
  }

  // 等级曲线参数缓存（后台可配 level_base/level_max）。expForLevel 在 publicUser 热路径高频调用，
  // 故用 stale-while-revalidate：读内存字段（同步、零查询），过期(60s)时触发一次后台异步刷新、不阻塞。
  // 未配置时 = 内置默认 30/60，行为与硬编码完全一致（零回归）。
  private levelBase = 30;
  private levelMax = 60;
  private levelCfgAt = 0;

  private maybeRefreshLevel(): void {
    const now = Date.now();
    if (now - this.levelCfgAt < 60000) return;
    this.levelCfgAt = now; // 先占位，防同一窗口并发重复刷新
    this.cfg('level_base').then((v) => { this.levelBase = Math.max(1, rewardNum(v, 30)); }).catch(() => {});
    this.cfg('level_max').then((v) => { this.levelMax = Math.max(1, rewardNum(v, 60)); }).catch(() => {});
  }

  // ---- Level curve (experience needed for level L is base * (L-1)^1.7；base/max 后台可配) ----
  expForLevel(level: number): number {
    return expForLevelPure(this.levelBase, level);
  }

  levelFromExp(exp: number): number {
    this.maybeRefreshLevel();
    let lvl = 1;
    while (lvl < this.levelMax && exp >= this.expForLevel(lvl + 1)) lvl++;
    return lvl;
  }

  levelProgress(exp: number) {
    const lvl = this.levelFromExp(exp);
    const cur = this.expForLevel(lvl);
    const next = this.expForLevel(lvl + 1);
    const pct =
      next > cur
        ? Math.min(100, Math.round(((exp - cur) / (next - cur)) * 100))
        : 100;
    return { level: lvl, exp, curLevelExp: cur, nextLevelExp: next, percent: pct };
  }

  /**
   * Award experience + points (no-op when both zero). 传入 key 时按后台配置
   * reward_<key>_exp / reward_<key>_points 覆盖（未配置→用传入默认，允许 0 关闭）。
   * key 仅用于非热路径的内容创建奖励（发帖/评论/发帖子/文章/问答等）；点赞等热路径不传 key，零额外查询。
   */
  async award(
    userId: number,
    { exp = 0, points = 0 }: { exp?: number; points?: number } = {},
    key?: string,
  ): Promise<void> {
    if (key) {
      exp = rewardNum(await this.cfg(`reward_${key}_exp`), exp);
      points = rewardNum(await this.cfg(`reward_${key}_points`), points);
    }
    if (!exp && !points) return;
    await this.users.increment({ id: userId }, 'experience', exp);
    await this.users.increment({ id: userId }, 'points', points);
  }

  getUser(id: number): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  /**
   * Public shape of a user. `viewerId` toggles `isFollowing`.
   * Returns null for a null input (matches helpers.js).
   */
  async publicUser(
    u: User | null,
    viewerId: number | null = null,
  ): Promise<any> {
    if (!u) return null;
    const lp = this.levelProgress(u.experience ?? 0);

    const followers = await this.follows.count({
      where: { following_id: u.id },
    });
    const following = await this.follows.count({
      where: { follower_id: u.id },
    });
    const postCount = await this.posts.count({ where: { user_id: u.id } });

    let isFollowing = false;
    if (viewerId && viewerId !== u.id) {
      isFollowing = !!(await this.follows.findOne({
        where: { follower_id: viewerId, following_id: u.id },
      }));
    }

    return {
      id: u.id,
      username: u.username,
      nickname: u.nickname,
      avatar: u.avatar,
      cover: u.cover,
      bio: u.bio,
      gender: u.gender,
      location: u.location,
      verified: !!u.verified,
      verifiedNote: u.verified_note,
      vip: !!u.vip,
      vipLevel: u.vip_level || (u.vip ? 1 : 0),
      role: u.role,
      banned: !!u.banned,
      title: u.title || '',
      avatarFrame: u.avatar_frame || '',
      points: u.points,
      experience: u.experience,
      balance: u.balance,
      level: lp.level,
      levelProgress: lp,
      checkinStreak: u.checkin_streak,
      lastCheckin: u.last_checkin,
      createdAt: u.created_at,
      followers,
      following,
      postCount,
      isFollowing,
    };
  }

  /** Create a notification (skips self-notifications). */
  async notify({
    userId,
    actorId,
    type,
    targetType = null,
    targetId = null,
    preview = '',
  }: {
    userId: number;
    actorId?: number | null;
    type: string;
    targetType?: string | null;
    targetId?: number | null;
    preview?: string;
  }): Promise<void> {
    if (!userId || userId === actorId) return;
    await this.notifications.insert({
      user_id: userId,
      actor_id: actorId ?? null,
      type,
      target_type: targetType,
      target_id: targetId,
      preview,
    });
  }

  today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Current UTC time as 'YYYY-MM-DD HH:MM:SS' (matches the SQLite datetime('now')). */
  nowSql(): string {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }

  parseMentions(text: string): string[] {
    const names = [...(text || '').matchAll(/@([一-龥A-Za-z0-9_]{1,20})/g)].map(
      (m) => m[1],
    );
    return [...new Set(names)];
  }

  parseTopics(text: string): string[] {
    const topics = [...(text || '').matchAll(/#([^#\n]{1,30})#/g)].map((m) =>
      m[1].trim(),
    );
    return [...new Set(topics)];
  }
}
