import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event, EventSignup, User } from '../../database/entities';
import { HelpersService } from '../../common/helpers.service';
import { checkSensitive } from '../../common/sensitive';

export const CATEGORIES = ['聚会', '讲座', '运动', '桌游', '线上', '公益'];

/** Ported from server/src/routes/events.js — 社区活动. */
@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event) private readonly events: Repository<Event>,
    @InjectRepository(EventSignup) private readonly signups: Repository<EventSignup>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly helpers: HelpersService,
  ) {}

  private statusOf(e: Event): string {
    const now = Date.now();
    const start = new Date(e.start_at).getTime();
    const end = e.end_at ? new Date(e.end_at).getTime() : start + 3 * 3600 * 1000;
    if (Number.isNaN(start)) return 'upcoming';
    if (now < start) return 'upcoming';
    if (now <= end) return 'ongoing';
    return 'ended';
  }

  private async serialize(e: Event, viewerId?: number, opts: { full?: boolean } = {}) {
    if (!e) return null;
    const status = this.statusOf(e);
    const isFull = e.capacity > 0 && e.signup_count >= e.capacity;
    const signed = viewerId
      ? !!(await this.signups.findOne({ where: { event_id: e.id, user_id: viewerId } }))
      : false;
    return {
      id: e.id, title: e.title, cover: e.cover, location: e.location, category: e.category,
      startAt: e.start_at, endAt: e.end_at, capacity: e.capacity, fee: e.fee, online: !!e.online,
      signupCount: e.signup_count,
      spotsLeft: e.capacity > 0 ? Math.max(0, e.capacity - e.signup_count) : null,
      status, full: isFull, signed,
      organizer: await this.helpers.publicUser(await this.helpers.getUser(e.user_id), viewerId),
      isOrganizer: viewerId === e.user_id,
      ...(opts.full ? { description: e.description } : {}),
    };
  }

  // GET /api/events
  async list(viewerId: number | undefined, filterRaw: string | undefined, categoryRaw: string | undefined, q?: string) {
    const filter = filterRaw && ['upcoming', 'past', 'mine'].includes(filterRaw) ? filterRaw : 'upcoming';
    const category = categoryRaw && CATEGORIES.includes(categoryRaw) ? categoryRaw : null;
    const term = (q || '').trim().toLowerCase();
    let rows = await this.events.find({ order: { start_at: 'ASC' } });
    if (category) rows = rows.filter((e) => e.category === category);

    if (term) {
      // 搜索模式（后台用）：按标题跨全部活动匹配（不限 upcoming/past），最近开始的在前
      rows = rows
        .filter((e) => (e.title || '').toLowerCase().includes(term))
        .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime());
    } else if (filter === 'mine' && viewerId) {
      const mineRows = await this.signups.find({ where: { user_id: viewerId } });
      const mine = new Set(mineRows.map((r) => r.event_id));
      rows = rows.filter((e) => mine.has(e.id) || e.user_id === viewerId)
        .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime());
    } else if (filter === 'past') {
      rows = rows.filter((e) => this.statusOf(e) === 'ended')
        .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime());
    } else {
      rows = rows.filter((e) => this.statusOf(e) !== 'ended');
    }

    const all = await this.events.find();
    const counts = { upcoming: all.filter((e) => this.statusOf(e) !== 'ended').length };
    const events = await Promise.all(rows.slice(0, 40).map((e) => this.serialize(e, viewerId)));
    return { events, categories: CATEGORIES, counts };
  }

  // ---- GET /api/events/admin/stats （活动模块运营总览, 管理员）----
  async adminStats(user: User) {
    if (user.role !== 'admin') throw new ForbiddenException('无权操作');
    const all = await this.events.find();
    let active = 0;
    let ended = 0;
    for (const e of all) {
      if (this.statusOf(e) === 'ended') ended++;
      else active++; // upcoming + ongoing
    }
    const totalSignups = await this.signups.count();
    return { total: all.length, active, ended, totalSignups };
  }

  // GET /api/events/:id
  async detail(id: number, viewerId?: number) {
    const e = await this.events.findOne({ where: { id } });
    if (!e) throw new NotFoundException('活动不存在或已取消');
    const rows = await this.signups.find({ where: { event_id: e.id }, order: { created_at: 'DESC' }, take: 30 });
    const attendees = (await Promise.all(
      rows.map(async (r) => this.helpers.publicUser(await this.helpers.getUser(r.user_id), viewerId)),
    )).filter(Boolean);
    return { event: await this.serialize(e, viewerId, { full: true }), attendees };
  }

  // POST /api/events
  async create(user: User, b: any) {
    let title = (b?.title || '').trim();
    let description = (b?.description || '').trim();
    let location = (b?.location || '').trim();
    let category = b?.category || '聚会';
    const startAt = b?.startAt || '';
    if (title.length < 2) throw new BadRequestException('活动标题至少 2 个字');
    if (!startAt) throw new BadRequestException('请选择开始时间');
    if (!CATEGORIES.includes(category)) category = '聚会';
    if (checkSensitive(title) || checkSensitive(description) || checkSensitive(location))
      throw new BadRequestException('内容包含敏感信息，请修改后重试');
    const capacity = Math.max(0, Math.min(100000, parseInt(b?.capacity, 10) || 0));
    const fee = Math.max(0, Math.min(100000, parseInt(b?.fee, 10) || 0));
    const saved = await this.events.save(this.events.create({
      user_id: user.id, title, cover: (b?.cover || '').trim(), description, location, category,
      start_at: startAt, end_at: b?.endAt || '', capacity, fee, online: b?.online ? 1 : 0,
      created_at: this.helpers.nowSql(),
    }));
    await this.helpers.award(user.id, { exp: 10 }, 'event');
    return { event: await this.serialize(saved, user.id, { full: true }) };
  }

  // POST /api/events/:id/signup
  async signup(user: User, id: number) {
    const e = await this.events.findOne({ where: { id } });
    if (!e) throw new NotFoundException('活动不存在');
    if (this.statusOf(e) === 'ended') throw new BadRequestException('活动已结束，无法报名');
    if (await this.signups.findOne({ where: { event_id: e.id, user_id: user.id } }))
      throw new BadRequestException('你已经报名啦');
    if (e.capacity > 0 && e.signup_count >= e.capacity) throw new BadRequestException('名额已满');
    const u = (await this.helpers.getUser(user.id))!;
    if (e.fee > 0 && u.points < e.fee) throw new BadRequestException(`积分不足，报名需 ${e.fee} 积分`);

    if (e.fee > 0) await this.users.update({ id: user.id }, { points: u.points - e.fee });
    await this.signups.save(this.signups.create({ event_id: e.id, user_id: user.id, created_at: this.helpers.nowSql() }));
    await this.events.update({ id: e.id }, { signup_count: e.signup_count + 1 });
    if (e.user_id !== user.id) {
      await this.helpers.notify({ userId: e.user_id, actorId: user.id, type: 'event', targetType: 'event', targetId: e.id, preview: e.title.slice(0, 40) });
    }
    const fresh = await this.events.findOne({ where: { id: e.id } });
    return { ok: true, event: await this.serialize(fresh!, user.id, { full: true }), user: await this.helpers.publicUser(await this.helpers.getUser(user.id), user.id) };
  }

  // POST /api/events/:id/cancel —— 退报名 + 退费
  async cancel(user: User, id: number) {
    const e = await this.events.findOne({ where: { id } });
    if (!e) throw new NotFoundException('活动不存在');
    if (!(await this.signups.findOne({ where: { event_id: e.id, user_id: user.id } })))
      throw new BadRequestException('你还没有报名');
    await this.signups.delete({ event_id: e.id, user_id: user.id });
    await this.events.update({ id: e.id }, { signup_count: Math.max(0, e.signup_count - 1) });
    if (e.fee > 0) {
      const u = (await this.helpers.getUser(user.id))!;
      await this.users.update({ id: user.id }, { points: u.points + e.fee });
    }
    const fresh = await this.events.findOne({ where: { id: e.id } });
    return { ok: true, event: await this.serialize(fresh!, user.id, { full: true }), user: await this.helpers.publicUser(await this.helpers.getUser(user.id), user.id) };
  }

  // DELETE /api/events/:id
  async remove(user: User, id: number) {
    const e = await this.events.findOne({ where: { id } });
    if (!e) throw new NotFoundException('活动不存在');
    if (e.user_id !== user.id && user.role !== 'admin') throw new ForbiddenException('无权删除');
    await this.events.delete({ id: e.id });
    await this.signups.delete({ event_id: e.id });
    return { ok: true };
  }
}
