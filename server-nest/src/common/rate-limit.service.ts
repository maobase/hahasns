import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SiteConfig, User } from '../database/entities';

type Action = 'post' | 'thread' | 'dm';

/**
 * 业务频率限制（防刷屏 / 骚扰 / 灌水）。配置存 site_config，管理员后台可调：
 *   rate_limit_enabled 总开关；rate_post_per_min / rate_post_per_hour / rate_thread_per_min / rate_dm_per_min。
 * 设计要点：
 *  - 管理员豁免；总开关关、或某窗口阈值 ≤ 0 则该项不限。
 *  - 按「用户 + 动作 + 固定时间窗」用 Redis(cache-manager) 计数，超限抛 429（{error} 由全局过滤器规范化）。
 *  - 先查后增（两段式）：被挡的请求不计数，避免把后续窗口越推越满。
 *  - fail-open：读配置或计数出错一律放行，绝不因限流基础设施故障挡正常发帖 / 私信。
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    @InjectRepository(SiteConfig) private readonly cfg: Repository<SiteConfig>,
  ) {}

  private async cfgNum(key: string): Promise<number> {
    const row = await this.cfg.findOne({ where: { key } });
    const n = parseInt(row?.value ?? '', 10);
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * 注册防批量：按客户端 IP 限「每日注册数」与「两次注册最小间隔」，由 anti_bulk_reg_enabled 总开关 +
   * reg_ip_max_per_day / reg_min_interval_sec 控制。无 IP（拿不到）或开关关或阈值≤0 则放行；fail-open。
   * 注：req.ip 默认是直连 socket IP（适合 :5388 直连）；置于反代后请设 TRUST_PROXY 让其读 X-Forwarded-For。
   */
  async enforceRegistration(ip: string | null | undefined): Promise<void> {
    let blocked: string | null = null;
    try {
      if (!ip) return; // 拿不到 IP 不挡
      const on =
        (await this.cfg.findOne({ where: { key: 'anti_bulk_reg_enabled' } }))
          ?.value === '1';
      if (!on) return;
      const minInterval = await this.cfgNum('reg_min_interval_sec');
      const maxPerDay = await this.cfgNum('reg_ip_max_per_day');
      const intKey = `rl:reg:int:${ip}`;
      const dayBucket = Math.floor(Date.now() / 1000 / 86400);
      const dayKey = `rl:reg:day:${ip}:${dayBucket}`;
      // 段一：判定
      if (minInterval > 0 && (await this.cache.get(intKey))) {
        blocked = `注册太频繁了，请 ${minInterval} 秒后再试`;
      }
      let dayCount = 0;
      if (!blocked && maxPerDay > 0) {
        dayCount = Number(await this.cache.get(dayKey)) || 0;
        if (dayCount >= maxPerDay)
          blocked = '该网络今日注册名额已用完，请明天再试';
      }
      // 段二：放行才记账
      if (!blocked) {
        if (minInterval > 0)
          await this.cache.set(intKey, 1, minInterval * 1000);
        if (maxPerDay > 0)
          await this.cache.set(dayKey, dayCount + 1, 86400 * 1000);
      }
    } catch (e: any) {
      this.logger.warn(`reg rate-limit skipped (fail-open): ${e?.message || e}`);
      return;
    }
    if (blocked) throw new HttpException(blocked, HttpStatus.TOO_MANY_REQUESTS);
  }

  // ── 登录防爆破/撞库：只按 IP 计「失败」次数（成功清零、成功不计）；全程 fail-open。
  //    合法用户极少失败→即便 sns 共享隧道 IP 也不误伤；持续失败(爆破)才触发 429。 ──
  async enforceLogin(ip: string | null | undefined): Promise<void> {
    let blocked = false;
    try {
      if (!ip) return;
      const fails = Number(await this.cache.get(`rl:login:fail:${ip}`)) || 0;
      if (fails >= 20) blocked = true;
    } catch (e: any) {
      this.logger.warn(`login rate-limit skipped (fail-open): ${e?.message || e}`);
      return;
    }
    if (blocked)
      throw new HttpException(
        '登录尝试过于频繁，请 15 分钟后再试',
        HttpStatus.TOO_MANY_REQUESTS,
      );
  }

  async noteLoginFailure(ip: string | null | undefined): Promise<void> {
    try {
      if (!ip) return;
      const key = `rl:login:fail:${ip}`;
      const fails = Number(await this.cache.get(key)) || 0;
      await this.cache.set(key, fails + 1, 15 * 60 * 1000);
    } catch {
      /* fail-open：记账失败不影响登录流程 */
    }
  }

  async clearLoginFailures(ip: string | null | undefined): Promise<void> {
    try {
      if (ip) await this.cache.del(`rl:login:fail:${ip}`);
    } catch {
      /* ignore */
    }
  }

  /** 超限抛 429；放行则静默返回。读配置/计数异常一律放行（fail-open）。 */
  async enforce(action: Action, user: User | null | undefined): Promise<void> {
    let blocked = false;
    try {
      if (!user || user.role === 'admin') return; // 管理员不受限
      const enabled =
        (await this.cfg.findOne({ where: { key: 'rate_limit_enabled' } }))
          ?.value === '1';
      if (!enabled) return;

      const windows: { tag: string; sec: number; limit: number }[] = [];
      if (action === 'post') {
        windows.push({ tag: 'p1', sec: 60, limit: await this.cfgNum('rate_post_per_min') });
        windows.push({ tag: 'p60', sec: 3600, limit: await this.cfgNum('rate_post_per_hour') });
      } else if (action === 'thread') {
        windows.push({ tag: 't1', sec: 60, limit: await this.cfgNum('rate_thread_per_min') });
      } else {
        windows.push({ tag: 'd1', sec: 60, limit: await this.cfgNum('rate_dm_per_min') });
      }

      // 段一：只读计数，判断是否超限（被挡则不写计数）
      const toBump: { key: string; next: number; ttlMs: number }[] = [];
      for (const w of windows) {
        if (w.limit <= 0) continue; // ≤0 视为该窗口不限
        const bucket = Math.floor(Date.now() / 1000 / w.sec);
        const key = `rl:${action}:${w.tag}:${user.id}:${bucket}`;
        const count = Number(await this.cache.get(key)) || 0;
        if (count >= w.limit) {
          blocked = true;
          break;
        }
        toBump.push({ key, next: count + 1, ttlMs: w.sec * 1000 });
      }
      // 段二：放行才记一次（ttl 毫秒，cache-manager v5）
      if (!blocked) {
        for (const b of toBump) await this.cache.set(b.key, b.next, b.ttlMs);
      }
    } catch (e: any) {
      this.logger.warn(`rate-limit skipped (fail-open): ${e?.message || e}`);
      return;
    }
    if (blocked)
      throw new HttpException(
        '操作太频繁了，请稍后再试',
        HttpStatus.TOO_MANY_REQUESTS,
      );
  }
}
