import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { LotteryDraw, LotteryPrize, User } from '../../database/entities';
import { HelpersService } from '../../common/helpers.service';
import { SiteService } from '../site/site.service';

const COST = 88; // 单次消耗默认值（后台 lottery_cost 覆盖）
const FREE_PER_DAY = 1; // 每日免费次数默认值（后台 lottery_free_daily 覆盖）

/** Ported from server/src/routes/lottery.js — 幸运抽奖(8 格转盘, 加权随机). */
@Injectable()
export class LotteryService {
  constructor(
    @InjectRepository(LotteryPrize) private readonly prizes: Repository<LotteryPrize>,
    @InjectRepository(LotteryDraw) private readonly draws: Repository<LotteryDraw>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly helpers: HelpersService,
    private readonly site: SiteService,
  ) {}

  // 抽奖消耗/免费次数：后台可配，未配置用默认（行为与现状一致）
  private async lotteryCfg() {
    const num = async (k: string, def: number) => {
      const v = await this.site.getConfig(k);
      return v === null || v === '' ? def : Number(v);
    };
    return { cost: await num('lottery_cost', COST), freePerDay: await num('lottery_free_daily', FREE_PER_DAY) };
  }

  private serialize(p: LotteryPrize) {
    return { id: p.id, name: p.name, type: p.type, value: p.value, icon: p.icon, color: p.color, position: p.position };
  }

  private drawsTodayCount(uid: number) {
    return this.draws.count({
      where: { user_id: uid, created_at: MoreThanOrEqual(`${this.helpers.today()} 00:00:00`) },
    });
  }

  // GET /api/lottery — 转盘状态
  async board(user: User | null) {
    const list = await this.prizes.find({ order: { position: 'ASC', id: 'ASC' } });
    const uid = user?.id;
    const drawsToday = uid ? await this.drawsTodayCount(uid) : 0;
    const myRecent = uid
      ? await this.draws.find({
          where: { user_id: uid },
          order: { id: 'DESC' },
          take: 10,
          select: ['id', 'prize_name', 'prize_type', 'created_at'],
        })
      : [];
    const fresh = uid ? await this.helpers.getUser(uid) : null;
    const { cost, freePerDay } = await this.lotteryCfg();
    return {
      prizes: list.map((p) => this.serialize(p)),
      cost,
      freePerDay,
      drawsToday,
      freeLeft: Math.max(0, freePerDay - drawsToday),
      points: fresh ? fresh.points : 0,
      myRecent,
    };
  }

  // ===== 管理员：抽奖奖品配置（含 weight 概率权重，前台不暴露）=====
  async adminList(user: User) {
    if (user.role !== 'admin') throw new ForbiddenException('无权操作');
    const list = await this.prizes.find({ order: { position: 'ASC', id: 'ASC' } });
    return {
      prizes: list.map((p) => ({
        id: p.id, name: p.name, type: p.type, value: p.value,
        icon: p.icon, color: p.color, weight: p.weight, position: p.position,
      })),
    };
  }

  // GET /api/lottery/admin/draws —— 管理员查看抽奖记录(近50) + 按奖品类型汇总
  async adminDraws(user: User) {
    if (user.role !== 'admin') throw new ForbiddenException('无权操作');
    const rows = await this.draws.find({ order: { id: 'DESC' }, take: 50 });
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const us = ids.length ? await this.users.find({ where: { id: In(ids) } }) : [];
    const umap = new Map(us.map((u) => [u.id, u]));
    const grp = await this.draws
      .createQueryBuilder('d')
      .select('d.prize_type', 'type')
      .addSelect('COUNT(*)', 'n')
      .groupBy('d.prize_type')
      .getRawMany();
    const byType: Record<string, number> = {};
    let total = 0;
    for (const g of grp) { const n = Number(g.n) || 0; byType[g.type || ''] = n; total += n; }
    const realWins = total - (byType['thanks'] || 0);
    return {
      stats: { total, realWins, byType },
      draws: rows.map((r) => {
        const u = umap.get(r.user_id);
        return {
          id: r.id,
          prizeName: r.prize_name,
          prizeType: r.prize_type,
          createdAt: r.created_at,
          user: u ? { id: u.id, nickname: u.nickname, username: u.username } : null,
        };
      }),
    };
  }

  async upsertPrize(user: User, dto: any) {
    if (user.role !== 'admin') throw new ForbiddenException('无权操作');
    const name = (dto?.name || '').trim();
    if (!name) throw new BadRequestException('奖品名必填');
    const TYPES = ['points', 'title', 'frame', 'thanks'];
    const patch = {
      name: name.slice(0, 64),
      type: TYPES.includes(dto.type) ? dto.type : 'thanks',
      value: String(dto.value ?? '').slice(0, 128),
      icon: (dto.icon || 'gift').slice(0, 32),
      color: String(dto.color ?? '').slice(0, 32),
      weight: Math.max(0, Math.min(100000, Math.round(Number(dto.weight) || 0))),
      position: Math.max(0, Math.round(Number(dto.position) || 0)),
    };
    if (dto.id) {
      await this.prizes.update({ id: Number(dto.id) }, patch);
      return { ok: true, id: Number(dto.id) };
    }
    const saved = await this.prizes.save(this.prizes.create(patch));
    return { ok: true, id: saved.id };
  }

  async removePrize(user: User, id: number) {
    if (user.role !== 'admin') throw new ForbiddenException('无权操作');
    await this.prizes.delete({ id });
    return { ok: true };
  }

  // GET /api/lottery/winners — 社区中奖滚动(排除谢谢参与)
  async winners() {
    const rows = await this.draws.find({
      where: {},
      order: { id: 'DESC' },
      take: 50,
    });
    const filtered = rows.filter((r) => r.prize_type !== 'thanks').slice(0, 12);
    const out = await Promise.all(
      filtered.map(async (r) => ({
        id: r.id,
        prizeName: r.prize_name,
        createdAt: r.created_at,
        user: await this.helpers.publicUser(await this.helpers.getUser(r.user_id), null),
      })),
    );
    return { winners: out };
  }

  // POST /api/lottery/draw — 抽一次(加权), 每日首抽免费, 其余扣 COST
  async draw(user: User) {
    const list = await this.prizes.find();
    if (!list.length) throw new BadRequestException('奖池未配置');

    const u = (await this.helpers.getUser(user.id))!;
    const { cost, freePerDay } = await this.lotteryCfg();
    const isFree = (await this.drawsTodayCount(user.id)) < freePerDay;
    if (!isFree && u.points < cost) throw new BadRequestException(`积分不足，每次抽奖需 ${cost} 积分`);

    const total = list.reduce((s, p) => s + Math.max(0, p.weight), 0);
    let r = Math.random() * total;
    let picked = list[list.length - 1];
    for (const p of list) { r -= Math.max(0, p.weight); if (r <= 0) { picked = p; break; } }

    // 扣费 + 发奖（顺序执行；演示规模无需强事务）
    let points = u.points - (isFree ? 0 : cost);
    const patch: Partial<User> = {};
    if (picked.type === 'points') points += Number(picked.value) || 0;
    else if (picked.type === 'title') patch.title = picked.value;
    else if (picked.type === 'frame') patch.avatar_frame = picked.value;
    patch.points = points;
    await this.users.update({ id: user.id }, patch);
    await this.draws.save(this.draws.create({
      user_id: user.id,
      prize_id: picked.id,
      prize_name: picked.name,
      prize_type: picked.type,
      created_at: this.helpers.nowSql(),
    }));

    const fresh = await this.helpers.getUser(user.id);
    return {
      prize: this.serialize(picked),
      wasFree: isFree,
      user: await this.helpers.publicUser(fresh, user.id),
      freeLeft: Math.max(0, FREE_PER_DAY - (await this.drawsTodayCount(user.id))),
    };
  }
}
