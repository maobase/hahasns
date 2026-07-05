import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Article,
  Comment,
  Like,
  Post,
  Thread,
  ThreadSub,
  User,
} from '../../database/entities';
import { HelpersService } from '../../common/helpers.service';
import { checkSensitive } from '../../common/sensitive';
import { CreateCommentDto } from './dto/comment.dto';

/**
 * Ported from server/src/routes/comments.js. Nested comments on posts and forum
 * threads, comment likes, and deletion — response shapes match the Express
 * version (serializeComment + nested replies tree).
 */
@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment) private readonly comments: Repository<Comment>,
    @InjectRepository(Like) private readonly likes: Repository<Like>,
    @InjectRepository(Post) private readonly posts: Repository<Post>,
    @InjectRepository(Thread) private readonly threads: Repository<Thread>,
    @InjectRepository(ThreadSub)
    private readonly threadSubs: Repository<ThreadSub>,
    @InjectRepository(Article) private readonly articles: Repository<Article>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly helpers: HelpersService,
  ) {}

  private async reactionCounts(id: number): Promise<Record<string, number> | null> {
    const rows = await this.likes.query(
      "SELECT COALESCE(reaction,'like') r, COUNT(*) c FROM likes WHERE target_type='comment' AND target_id=? GROUP BY COALESCE(reaction,'like')",
      [id],
    );
    if (!rows.length) return null;
    const out: Record<string, number> = {};
    for (const row of rows) out[row.r] = Number(row.c);
    return out;
  }

  private async serializeComment(c: Comment, viewerId: number | null) {
    const mine = viewerId
      ? await this.likes.findOne({
          where: { user_id: viewerId, target_type: 'comment', target_id: c.id },
        })
      : null;
    return {
      id: c.id,
      content: c.content,
      createdAt: c.created_at,
      likeCount: c.like_count,
      liked: !!mine,
      myReaction: mine ? mine.reaction || 'like' : null,
      reactions: c.like_count > 0 ? await this.reactionCounts(c.id) : null,
      parentId: c.parent_id,
      replyTo: c.reply_to
        ? await this.helpers.publicUser(
            await this.helpers.getUser(c.reply_to),
            viewerId,
          )
        : null,
      author: await this.helpers.publicUser(
        await this.helpers.getUser(c.user_id),
        viewerId,
      ),
    };
  }

  // ---- GET /api/comments ----
  async list(
    postId: string | undefined,
    threadId: string | undefined,
    articleId: string | undefined,
    sort: string | undefined,
    viewer: User | null,
  ) {
    const viewerId = viewer?.id || null;
    const id = postId || threadId || articleId;
    if (!id) throw new BadRequestException('缺少目标');
    const where = postId
      ? { post_id: Number(postId) }
      : threadId
        ? { thread_id: Number(threadId) }
        : { article_id: Number(articleId) };
    const all = await this.comments.find({
      where,
      order: { created_at: 'ASC' },
    });

    const byId = new Map<number, any>();
    for (const c of all) {
      byId.set(c.id, {
        ...(await this.serializeComment(c, viewerId)),
        replies: [],
      });
    }
    const roots: any[] = [];
    for (const c of all) {
      const node = byId.get(c.id);
      if (c.parent_id && byId.has(c.parent_id))
        byId.get(c.parent_id).replies.push(node);
      else roots.push(node);
    }
    if (sort === 'hot')
      roots.sort(
        (a, b) =>
          b.likeCount - a.likeCount ||
          (b.createdAt || '').localeCompare(a.createdAt || ''),
      );
    else
      roots.sort((a, b) =>
        (b.createdAt || '').localeCompare(a.createdAt || ''),
      );
    return { comments: roots };
  }

  // ---- POST /api/comments ----
  async create(user: User, dto: CreateCommentDto) {
    await this.helpers.enforcePerm('comment', user); // 接口权限门控（默认关；开启后可要求评论需 VIP/等级，管理员豁免）
    const text = (dto.content || '').trim();
    const { postId, threadId, articleId, parentId, replyTo } = dto;
    if (!text) throw new BadRequestException('评论内容不能为空');
    if (!postId && !threadId && !articleId)
      throw new BadRequestException('缺少目标');
    if (checkSensitive(text))
      throw new BadRequestException('评论包含敏感信息，请修改后重试');

    // 通知/跳转指向 post / thread / article
    const tType = postId ? 'post' : threadId ? 'thread' : 'article';
    const tId = postId || threadId || articleId || null;

    const saved = await this.comments.save(
      this.comments.create({
        post_id: postId || null,
        thread_id: threadId || null,
        article_id: articleId || null,
        user_id: user.id,
        parent_id: parentId || null,
        reply_to: replyTo || null,
        content: text,
        created_at: this.helpers.nowSql(),
      }),
    );

    let authorId: number | null = null;
    const notified = new Set<number>([user.id]); // 已通知/无需重复通知（含自己）
    if (postId) {
      await this.posts.increment({ id: postId }, 'comment_count', 1);
      const p = await this.posts.findOne({
        where: { id: postId },
        select: ['user_id'],
      });
      authorId = p?.user_id ?? null;
      await this.helpers.notify({
        userId: authorId!,
        actorId: user.id,
        type: 'comment',
        targetType: 'post',
        targetId: postId,
        preview: text.slice(0, 50),
      });
    }
    if (threadId) {
      await this.threads.update(
        { id: threadId },
        {
          reply_count: () => 'reply_count + 1',
          last_reply_at: this.helpers.nowSql(),
        } as any,
      );
      const t = await this.threads.findOne({
        where: { id: threadId },
        select: ['user_id'],
      });
      authorId = t?.user_id ?? null;
      await this.helpers.notify({
        userId: authorId!,
        actorId: user.id,
        type: 'reply',
        targetType: 'thread',
        targetId: threadId,
        preview: text.slice(0, 50),
      });
      // 回复即订阅该帖（之后有新回复也会收到通知）
      await this.threadSubs
        .createQueryBuilder()
        .insert()
        .values({
          user_id: user.id,
          thread_id: threadId,
          created_at: this.helpers.nowSql(),
        })
        .orIgnore()
        .execute();
    }
    if (articleId) {
      await this.articles.increment({ id: articleId }, 'comment_count', 1);
      const a = await this.articles.findOne({
        where: { id: articleId },
        select: ['user_id'],
      });
      authorId = a?.user_id ?? null;
      await this.helpers.notify({
        userId: authorId!,
        actorId: user.id,
        type: 'comment',
        targetType: 'article',
        targetId: articleId,
        preview: text.slice(0, 50),
      });
    }
    if (authorId) notified.add(authorId);
    if (replyTo && replyTo !== authorId) {
      await this.helpers.notify({
        userId: replyTo,
        actorId: user.id,
        type: 'reply',
        targetType: tType,
        targetId: tId,
        preview: text.slice(0, 50),
      });
      notified.add(replyTo);
    }
    for (const name of this.helpers.parseMentions(text)) {
      const target = await this.users
        .createQueryBuilder('u')
        .where('u.username = :name OR u.nickname = :name', { name })
        .getOne();
      if (target && !notified.has(target.id)) {
        await this.helpers.notify({
          userId: target.id,
          actorId: user.id,
          type: 'mention',
          targetType: tType,
          targetId: tId,
          preview: text.slice(0, 50),
        });
        notified.add(target.id);
      }
    }
    // 帖子订阅者：有新回复时提醒（楼主/被回复者/@到的人已通知，去重；限量避免大扇出）
    if (threadId) {
      const subs = await this.threadSubs.find({
        where: { thread_id: threadId },
        take: 500,
      });
      for (const s of subs) {
        if (notified.has(s.user_id)) continue;
        await this.helpers.notify({
          userId: s.user_id,
          actorId: user.id,
          type: 'thread',
          targetType: 'thread',
          targetId: threadId,
          preview: text.slice(0, 50),
        });
      }
    }
    await this.helpers.award(user.id, { exp: 2, points: 1 }, 'comment');
    const row = await this.comments.findOne({ where: { id: saved.id } });
    return {
      comment: {
        ...(await this.serializeComment(row!, user.id)),
        replies: [],
      },
    };
  }

  // ---- POST /api/comments/:id/like ----
  async like(id: number, user: User) {
    const c = await this.comments.findOne({ where: { id } });
    if (!c) throw new NotFoundException('评论不存在');
    const liked = await this.likes.findOne({
      where: { user_id: user.id, target_type: 'comment', target_id: c.id },
    });
    if (liked) {
      await this.likes.delete({
        user_id: user.id,
        target_type: 'comment',
        target_id: c.id,
      });
      await this.comments
        .query(
          'UPDATE comments SET like_count = GREATEST(0, like_count - 1) WHERE id = ?',
          [c.id],
        )
        .catch(() =>
          this.comments.query(
            'UPDATE comments SET like_count = GREATEST(0, like_count - 1) WHERE id = $1',
            [c.id],
          ),
        );
      return { liked: false, likeCount: c.like_count - 1 };
    }
    await this.likes.insert({
      user_id: user.id,
      target_type: 'comment',
      target_id: c.id,
      created_at: this.helpers.nowSql(),
    });
    await this.comments.increment({ id: c.id }, 'like_count', 1);
    await this.helpers.notify({
      userId: c.user_id,
      actorId: user.id,
      type: 'like',
      targetType: c.post_id ? 'post' : c.thread_id ? 'thread' : 'article',
      targetId: c.post_id || c.thread_id || c.article_id,
      preview: (c.content || '').slice(0, 40),
    });
    return { liked: true, likeCount: c.like_count + 1 };
  }

  // ---- POST /api/comments/:id/react —— 评论表情回应 ----
  async react(id: number, user: User, reactionRaw: string) {
    const c = await this.comments.findOne({ where: { id } });
    if (!c) throw new NotFoundException('评论不存在');
    const VALID = new Set(['like', 'love', 'haha', 'wow', 'support']);
    const reaction = VALID.has(reactionRaw) ? reactionRaw : 'like';
    const existing = await this.likes.findOne({
      where: { user_id: user.id, target_type: 'comment', target_id: c.id },
    });
    if (existing) {
      if ((existing.reaction || 'like') === reaction) {
        await this.likes.delete({ user_id: user.id, target_type: 'comment', target_id: c.id });
        await this.comments.query('UPDATE comments SET like_count = GREATEST(0, like_count - 1) WHERE id = ?', [c.id]);
        return { myReaction: null, likeCount: Math.max(0, c.like_count - 1), reactions: await this.reactionCounts(c.id) };
      }
      await this.likes.update({ user_id: user.id, target_type: 'comment', target_id: c.id }, { reaction });
      return { myReaction: reaction, likeCount: c.like_count, reactions: await this.reactionCounts(c.id) };
    }
    await this.likes.insert({ user_id: user.id, target_type: 'comment', target_id: c.id, reaction, created_at: this.helpers.nowSql() });
    await this.comments.increment({ id: c.id }, 'like_count', 1);
    await this.helpers.notify({
      userId: c.user_id,
      actorId: user.id,
      type: 'like',
      targetType: c.post_id ? 'post' : c.thread_id ? 'thread' : 'article',
      targetId: c.post_id || c.thread_id || c.article_id,
      preview: (c.content || '').slice(0, 40),
    });
    return { myReaction: reaction, likeCount: c.like_count + 1, reactions: await this.reactionCounts(c.id) };
  }

  // ---- GET /api/comments/:id/reactions —— 谁回应了 ----
  async reactions(id: number, viewer: User | null) {
    const rows = await this.likes.find({
      where: { target_type: 'comment', target_id: id },
      order: { created_at: 'DESC' },
      take: 100,
    });
    const reactors: any[] = [];
    for (const r of rows)
      reactors.push({
        user: await this.helpers.publicUser(await this.helpers.getUser(r.user_id), viewer?.id || null),
        reaction: r.reaction || 'like',
      });
    return { counts: (await this.reactionCounts(id)) || {}, reactors };
  }

  // ---- DELETE /api/comments/:id ----
  // 编辑评论：仅作者或管理员；同 create 的空值 + 敏感词校验。（前端 Comments.tsx editComment 依赖此路由）
  async update(user: User, id: number, content: string) {
    const text = (content || '').trim();
    if (!text) throw new BadRequestException('评论内容不能为空');
    if (checkSensitive(text))
      throw new BadRequestException('评论包含敏感信息，请修改后重试');
    const c = await this.comments.findOne({ where: { id } });
    if (!c) throw new NotFoundException('评论不存在');
    if (c.user_id !== user.id && user.role !== 'admin')
      throw new ForbiddenException('无权编辑');
    c.content = text;
    await this.comments.save(c);
    return { comment: { id: c.id, content: c.content } };
  }

  async remove(id: number, user: User) {
    const c = await this.comments.findOne({ where: { id } });
    if (!c) throw new NotFoundException('评论不存在');
    if (c.user_id !== user.id && user.role !== 'admin')
      throw new ForbiddenException('无权删除');
    await this.comments.delete({ id: c.id });
    if (c.post_id)
      await this.posts
        .query(
          'UPDATE posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = ?',
          [c.post_id],
        )
        .catch(() =>
          this.posts.query(
            'UPDATE posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = $1',
            [c.post_id],
          ),
        );
    if (c.thread_id)
      await this.threads
        .query(
          'UPDATE threads SET reply_count = GREATEST(0, reply_count - 1) WHERE id = ?',
          [c.thread_id],
        )
        .catch(() =>
          this.threads.query(
            'UPDATE threads SET reply_count = GREATEST(0, reply_count - 1) WHERE id = $1',
            [c.thread_id],
          ),
        );
    if (c.article_id)
      await this.articles
        .query(
          'UPDATE articles SET comment_count = GREATEST(0, comment_count - 1) WHERE id = ?',
          [c.article_id],
        )
        .catch(() =>
          this.articles.query(
            'UPDATE articles SET comment_count = GREATEST(0, comment_count - 1) WHERE id = $1',
            [c.article_id],
          ),
        );
    return { ok: true };
  }
}
