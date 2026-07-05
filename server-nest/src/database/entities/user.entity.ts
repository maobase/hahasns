import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * users — member center. Columns mirror server/src/schema.sql (+ db.js migrations:
 * banned, title, avatar_frame). Booleans stored as smallint 0/1 to stay
 * compatible with the SQLite-era data shape and to match publicUser()'s `!!`.
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  username: string;

  @Column({ type: 'varchar', length: 64 })
  nickname: string;

  // select:false —— 默认查询绝不带出密码哈希（safe-by-construction 防泄露）；
  // 需要比对的登录/改密处用 addSelect('password_hash') 显式取。纯查询层设置，不改表结构。
  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  password_hash: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  email: string | null;

  @Column({ type: 'text', nullable: true })
  avatar: string | null;

  @Column({ type: 'text', nullable: true })
  cover: string | null;

  @Column({ type: 'text', default: '' })
  bio: string;

  @Column({ type: 'varchar', length: 16, default: 'secret' })
  gender: string;

  @Column({ type: 'varchar', length: 64, default: '' })
  location: string;

  @Column({ type: 'smallint', default: 0 })
  verified: number;

  @Column({ name: 'verified_note', type: 'varchar', length: 128, default: '' })
  verified_note: string;

  @Column({ type: 'smallint', default: 0 })
  vip: number;

  @Column({ name: 'vip_level', type: 'smallint', default: 0 })
  vip_level: number;

  @Column({ name: 'invited_by', type: 'int', nullable: true })
  invited_by: number | null;

  @Column({ name: 'vip_expires', type: 'varchar', length: 32, nullable: true })
  vip_expires: string | null;

  @Column({ type: 'varchar', length: 16, default: 'user' })
  role: string;

  @Column({ type: 'smallint', default: 0 })
  banned: number;

  @Column({ type: 'varchar', length: 64, default: '' })
  title: string;

  @Column({ name: 'avatar_frame', type: 'varchar', length: 64, default: '' })
  avatar_frame: string;

  @Column({ type: 'int', default: 0 })
  points: number;

  @Column({ type: 'int', default: 0 })
  experience: number;

  @Column({ type: 'int', default: 0 })
  balance: number;

  @Column({ name: 'checkin_streak', type: 'int', default: 0 })
  checkin_streak: number;

  @Column({ name: 'last_checkin', type: 'varchar', length: 16, nullable: true })
  last_checkin: string | null;

  @Column({ name: 'best_checkin_streak', type: 'int', default: 0 })
  best_checkin_streak: number;

  @Column({ name: 'created_at', type: 'varchar', length: 32, nullable: true })
  created_at: string;

  @Column({ name: 'updated_at', type: 'varchar', length: 32, nullable: true })
  updated_at: string;
}
