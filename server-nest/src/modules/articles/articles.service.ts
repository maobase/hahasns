import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Article, Comment, Like, User } from '../../database/entities';
import { HelpersService } from '../../common/helpers.service';
import { checkSensitive } from '../../common/sensitive';

export const CATEGORIES = ['综合', '技术', '设计', '产品', '生活', '观点'];
const readMins = (content: string) => Math.max(1, Math.round((content || '').length / 400));

/** Ported from server/src/routes/articles.js — 专栏文章. */
@Injectable()
export class ArticlesService {
  constructor(
    @InjectRepository(Article) private readonly articles: Repository<Article>,
    @InjectRepository(Like) private readonly likes: Repository<Like>,
    @InjectRepository(Comment) private readonly comments: Repository<Comment>,
    private readonly helpers: HelpersService,
  ) {}

  private async serialize(a: Article, viewerId?: number, opts: { full?: boolean } = {}) {
    if (!a) return null;
    const liked = viewerId
      ? !!(await this.likes.findOne({ where: { user_id: viewerId, target_type: 'article', target_id: a.id } }))
      : false;
    return {
      id: a.id,
      title: a.title,
      summary: a.summary,
      cover: a.cover,
      category: a.category,
      featured: !!a.featured,
      views: a.views,
      likeCount: a.like_count,
      commentCount: a.comment_count,
      readMins: readMins(a.content),
      createdAt: a.created_at,
      author: await this.helpers.publicUser(await this.helpers.getUser(a.user_id), viewerId),
      liked,
      ...(opts.full ? { content: a.content } : {}),
    };
  }

  // GET /api/articles
  async list(
    viewerId: number | undefined,
    categoryRaw: string | undefined,
    sort: string | undefined,
    offset = 0,
    limit = 12,
    q?: string,
  ) {
    const off = Math.max(0, Number(offset) || 0);
    const lim = Math.min(40, Math.max(1, Number(limit) || 12));
    const category = categoryRaw && CATEGORIES.includes(categoryRaw) ? categoryRaw : null;
    const term = (q || '').trim();
    let qb = this.articles.createQueryBuilder('a');
    if (category) qb = qb.where('a.category = :category', { category });
    if (term) {
      const like = `%${term}%`;
      qb = category ? qb.andWhere('a.title LIKE :like', { like }) : qb.where('a.title LIKE :like', { like });
    }
    qb = sort === 'hot'
      ? qb.orderBy('(a.like_count * 3 + a.comment_count * 2 + a.views)', 'DESC').addOrderBy('a.created_at', 'DESC')
      : qb.orderBy('a.created_at', 'DESC');
    // fetch one extra row to detect whether more pages remain
    const fetched = await qb.offset(off).limit(lim + 1).getMany();
    const hasMore = fetched.length > lim;
    const rows = hasMore ? fetched.slice(0, lim) : fetched;

    let featured: any = null;
    if (off === 0 && !category && sort !== 'hot' && !term) {
      const f =
        (await this.articles.findOne({ where: { featured: 1 }, order: { created_at: 'DESC' } })) ||
        (await this.articles.createQueryBuilder('a').orderBy('(a.like_count*3+a.views)', 'DESC').getOne());
      featured = f ? await this.serialize(f, viewerId) : null;
    }

    const countRows = await this.articles
      .createQueryBuilder('a')
      .select('a.category', 'category')
      .addSelect('COUNT(*)', 'c')
      .groupBy('a.category')
      .getRawMany();
    const counts = Object.fromEntries(countRows.map((r) => [r.category, Number(r.c)]));

    const list = await Promise.all(
      rows.filter((r) => !featured || r.id !== featured.id).map((r) => this.serialize(r, viewerId)),
    );
    return {
      featured,
      articles: list,
      categories: CATEGORIES.map((name) => ({ name, count: counts[name] || 0 })),
      total: await this.articles.count(),
      hasMore,
    };
  }

  // GET /api/articles/trending
  async trending() {
    const rows = await this.articles
      .createQueryBuilder('a')
      .orderBy('(a.like_count*3+a.comment_count*2+a.views)', 'DESC')
      .addOrderBy('a.created_at', 'DESC')
      .limit(6)
      .getMany();
    return { articles: rows.map((r) => ({ id: r.id, title: r.title, category: r.category, views: r.views, likeCount: r.like_count })) };
  }

  // GET /api/articles/:id
  async detail(id: number, viewerId?: number) {
    const a = await this.articles.findOne({ where: { id } });
    if (!a) throw new NotFoundException('文章不存在或已删除');
    await this.articles.increment({ id: a.id }, 'views', 1);
    a.views += 1;
    await this.helpers.recordView(viewerId, 'article', a.id);
    const relatedRows = await this.articles.find({
      where: { category: a.category },
      order: { created_at: 'DESC' },
      take: 5,
    });
    const related = await Promise.all(
      relatedRows.filter((r) => r.id !== a.id).slice(0, 4).map((r) => this.serialize(r, viewerId)),
    );
    return { article: await this.serialize(a, viewerId, { full: true }), related };
  }

  // POST /api/articles
  async create(user: User, b: any) {
    let title = (b?.title || '').trim();
    let summary = (b?.summary || '').trim();
    let content = (b?.content || '').trim();
    let category = b?.category || '综合';
    if (title.length < 2) throw new BadRequestException('标题至少 2 个字');
    if (content.length < 10) throw new BadRequestException('正文太短了，再写几句吧');
    if (!CATEGORIES.includes(category)) category = '综合';
    if (checkSensitive(title) || checkSensitive(content) || checkSensitive(summary))
      throw new BadRequestException('内容包含敏感信息，请修改后重试');
    if (!summary) summary = content.replace(/\s+/g, ' ').slice(0, 80);
    const saved = await this.articles.save(this.articles.create({
      user_id: user.id, title, summary, cover: b?.cover || '', content, category,
      created_at: this.helpers.nowSql(),
    }));
    await this.helpers.award(user.id, { exp: 12 }, 'article');
    return { article: await this.serialize(saved, user.id, { full: true }) };
  }

  // POST /api/articles/:id/like
  async like(user: User, id: number) {
    const a = await this.articles.findOne({ where: { id } });
    if (!a) throw new NotFoundException('文章不存在');
    const existing = await this.likes.findOne({ where: { user_id: user.id, target_type: 'article', target_id: a.id } });
    if (existing) {
      await this.likes.delete({ user_id: user.id, target_type: 'article', target_id: a.id });
      await this.articles.update({ id: a.id }, { like_count: Math.max(0, a.like_count - 1) });
      return { liked: false, likeCount: Math.max(0, a.like_count - 1) };
    }
    await this.likes.save(this.likes.create({ user_id: user.id, target_type: 'article', target_id: a.id }));
    await this.articles.update({ id: a.id }, { like_count: a.like_count + 1 });
    await this.helpers.notify({ userId: a.user_id, actorId: user.id, type: 'like', targetType: 'article', targetId: a.id, preview: a.title.slice(0, 40) });
    return { liked: true, likeCount: a.like_count + 1 };
  }

  // DELETE /api/articles/:id
  async remove(user: User, id: number) {
    const a = await this.articles.findOne({ where: { id } });
    if (!a) throw new NotFoundException('文章不存在');
    if (a.user_id !== user.id && user.role !== 'admin') throw new ForbiddenException('无权删除');
    await this.articles.delete({ id: a.id });
    await this.likes.delete({ target_type: 'article', target_id: a.id });
    await this.comments.delete({ article_id: a.id });
    return { ok: true };
  }

  // POST /api/articles/:id/feature —— 管理员设/取消精选（首页编辑精选位）
  async setFeatured(user: User, id: number, on: boolean) {
    if (user.role !== 'admin') throw new ForbiddenException('无权操作');
    const a = await this.articles.findOne({ where: { id } });
    if (!a) throw new NotFoundException('文章不存在');
    await this.articles.update({ id }, { featured: on ? 1 : 0 });
    return { ok: true, featured: on };
  }
}
