import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * comments — nested comments on posts or forum threads. Mirrors schema.sql.
 */
@Entity('comments')
@Index('idx_comments_post', ['post_id'])
@Index('idx_comments_thread', ['thread_id'])
export class Comment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'post_id', type: 'int', nullable: true })
  post_id: number | null;

  @Column({ name: 'thread_id', type: 'int', nullable: true })
  thread_id: number | null;

  @Column({ name: 'article_id', type: 'int', nullable: true })
  article_id: number | null;

  @Column({ name: 'user_id', type: 'int' })
  user_id: number;

  @Column({ name: 'parent_id', type: 'int', nullable: true })
  parent_id: number | null;

  @Column({ name: 'reply_to', type: 'int', nullable: true })
  reply_to: number | null;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'like_count', type: 'int', default: 0 })
  like_count: number;

  // 编辑标记：被作者编辑过则置 1，前端显示「· 已编辑」。见迁移 AddCommentEdited。
  @Column({ type: 'smallint', default: 0 })
  edited: number;

  @Column({ name: 'created_at', type: 'varchar', length: 32, nullable: true })
  created_at: string;
}
