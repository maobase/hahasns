import type { CSSProperties, ReactNode } from 'react';
import Icon from './Icon';

export function Loading({ label = '加载中…' }: { label?: string } = {}) {
  void label;
  return <div className="center" style={{ padding: 48 }}><div className="ui-spinner" /></div>;
}

// Map the emoji that call sites pass to a real stroke icon (less "AI" than emoji-as-icon)
const EMOJI_ICON: Record<string, string> = {
  '🍃': 'compass', '👥': 'user', '🔖': 'bookmark', '🔍': 'search', '✍️': 'edit',
  '❤️': 'heart', '🔔': 'bell', '💬': 'comment', '🔒': 'lock', '📋': 'forum',
  '🛍️': 'shop', '🛒': 'shop', '👀': 'eye', '🛋️': 'comment', '📦': 'shop', '🎁': 'gift',
  '📅': 'calendar', '📝': 'edit', '🎫': 'ticket', '🧭': 'compass',
  '🕓': 'clock', '💡': 'spark', '✅': 'check', '👤': 'user',
};

// 列表到底的尾标（无限滚动加载完时显示），统一一处避免各页复制粘贴（spec 01 §1.5）。
export function ListEnd({ text = '· 没有更多了 ·' }: { text?: string } = {}) {
  return <div className="empty" style={{ padding: '24px 0', fontSize: 13 }}>{text}</div>;
}

export function Empty({ icon = '🍃', text = '这里空空如也', children }: { icon?: ReactNode; text?: ReactNode; children?: ReactNode }) {
  const mapped = typeof icon === 'string' ? EMOJI_ICON[icon] : undefined;
  return (
    <div className="empty">
      <div className="e-ico">{mapped ? <Icon name={mapped} size={34} /> : icon}</div>
      <div className="e-text">{text}</div>
      {children && <div className="e-action">{children}</div>}
    </div>
  );
}

// 加载失败态：区别于「空态」——初始请求出错时展示，避免把「加载失败」误显示成「暂无内容」，并提供重试。
export function LoadError({ onRetry, text = '加载失败' }: { onRetry?: () => void; text?: ReactNode }) {
  return (
    <div className="empty">
      <div className="e-ico">📡</div>
      <div className="e-text">{text}</div>
      <div className="faint" style={{ fontSize: 13, marginTop: 2 }}>网络或服务器开小差了，稍后再试</div>
      {onRetry && <div className="e-action"><button className="btn btn-primary btn-sm" onClick={onRetry}>重试</button></div>}
    </div>
  );
}

const sk = (w: number | string, h: number | string, extra: CSSProperties = {}) =>
  <div className="skeleton" style={{ width: w, height: h, ...extra }} />;

export function PostSkeleton() {
  return (
    <div className="ui-card post">
      <div className="row gap-12">
        {sk(46, 46, { borderRadius: '30%' })}
        <div className="grow">{sk(120, 14, { marginBottom: 8 })}{sk(80, 11)}</div>
      </div>
      {sk('100%', 14, { margin: '16px 0 8px' })}
      {sk('70%', 14)}
    </div>
  );
}

// Content-detail skeleton (post / thread / article / qa / event detail pages):
// author header → title → a few body lines → a media block. Far less jarring than a spinner.
export function DetailSkeleton({ media = true }: { media?: boolean } = {}) {
  return (
    <div className="ui-card" style={{ padding: 18 }}>
      <div className="row gap-12">
        {sk(46, 46, { borderRadius: '30%' })}
        <div className="grow">{sk(130, 14, { marginBottom: 8 })}{sk(86, 11)}</div>
        {sk(64, 30, { borderRadius: 999, flex: 'none' })}
      </div>
      {sk('78%', 19, { margin: '18px 0 14px' })}
      {sk('100%', 13, { marginBottom: 9 })}
      {sk('96%', 13, { marginBottom: 9 })}
      {sk('90%', 13, { marginBottom: 9 })}
      {sk('58%', 13, { marginBottom: media ? 16 : 4 })}
      {media && sk('100%', 180, { borderRadius: 'var(--r-sm)' })}
    </div>
  );
}

// Rows skeleton for thread / user lists
export function RowSkeleton({ rows = 5 }: { rows?: number } = {}) {
  return (
    <div className="ui-card" style={{ overflow: 'hidden' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="row gap-12" style={{ padding: '15px 18px', borderTop: i ? '1px solid var(--line)' : 'none' }}>
          {sk(42, 42, { borderRadius: '30%' })}
          <div className="grow">{sk('60%', 14, { marginBottom: 8 })}{sk('35%', 11)}</div>
        </div>
      ))}
    </div>
  );
}

// Comment thread skeleton (avatar + name + a couple text lines) — matches .comment layout
export function CommentSkeleton({ rows = 3 }: { rows?: number } = {}) {
  return (
    <div style={{ padding: '4px 0' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="row gap-10" style={{ padding: '12px 0', borderTop: i ? '1px solid var(--line)' : 'none', alignItems: 'flex-start' }}>
          {sk(34, 34, { borderRadius: '30%', flex: 'none' })}
          <div className="grow">{sk('30%', 12, { marginBottom: 8 })}{sk('92%', 13, { marginBottom: 6 })}{sk('55%', 13)}</div>
        </div>
      ))}
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="ui-card" style={{ overflow: 'hidden' }}>
      {sk('100%', 170, { borderRadius: 0 })}
      <div style={{ padding: '0 22px 20px' }}>
        <div style={{ marginTop: -40 }}>{sk(86, 86, { borderRadius: '30%', border: '4px solid var(--surface)' })}</div>
        {sk(160, 20, { marginTop: 12 })}
        {sk(110, 13, { marginTop: 10 })}
        <div className="row gap-16" style={{ marginTop: 18 }}>{sk(60, 30)}{sk(60, 30)}{sk(60, 30)}{sk(60, 30)}</div>
      </div>
    </div>
  );
}

// Article list skeleton (mirrors .art-row: text block + right thumbnail)
export function ArticleListSkeleton({ rows = 4 }: { rows?: number } = {}) {
  return (
    <div className="art-list">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="art-row" style={{ pointerEvents: 'none' }}>
          <div className="art-row-body">
            {sk(54, 20, { borderRadius: 999, marginBottom: 10 })}
            {sk('82%', 17, { marginBottom: 9 })}
            {sk('58%', 13, { marginBottom: 12 })}
            {sk(130, 12)}
          </div>
          {sk(116, 84, { borderRadius: 'var(--r-md)', flex: 'none' })}
        </div>
      ))}
    </div>
  );
}

// Event list skeleton (mirrors .ev-card: cover + body)
export function EventListSkeleton({ rows = 4 }: { rows?: number } = {}) {
  return (
    <div className="ev-list">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="ev-card sk-evcard" style={{ pointerEvents: 'none' }}>
          {sk(168, 'auto', { borderRadius: 0, alignSelf: 'stretch', flex: 'none', minHeight: 132 })}
          <div className="ev-body">
            {sk(64, 20, { borderRadius: 999, marginBottom: 10 })}
            {sk('72%', 16, { marginBottom: 12 })}
            {sk('46%', 12, { marginBottom: 7 })}
            {sk('38%', 12, { marginBottom: 'auto' })}
            {sk('30%', 12, { marginTop: 14 })}
          </div>
        </div>
      ))}
    </div>
  );
}

// Generic card-grid skeleton (mall / collections)
export function CardGridSkeleton({ count = 8, minWidth = 150 }: { count?: number; minWidth?: number } = {}) {
  return (
    <div className="sk-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`, gap: 14 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="ui-card" style={{ padding: 14, pointerEvents: 'none' }}>
          {sk('100%', 96, { borderRadius: 'var(--r-sm)', marginBottom: 12 })}
          {sk('80%', 14, { marginBottom: 8 })}
          {sk('50%', 12, { marginBottom: 12 })}
          {sk('100%', 30, { borderRadius: 999 })}
        </div>
      ))}
    </div>
  );
}

// Badge wall skeleton (mirrors .badge-grid → .badge-cell)
export function BadgeGridSkeleton({ count = 8 }: { count?: number } = {}) {
  return (
    <div className="badge-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="badge-cell" style={{ pointerEvents: 'none' }}>
          {sk(54, 54, { borderRadius: '50%', margin: '0 auto 9px' })}
          {sk('62%', 13, { margin: '0 auto 6px' })}
          {sk('82%', 11, { margin: '0 auto' })}
        </div>
      ))}
    </div>
  );
}

// Task-list skeleton (mirrors .task-row: icon + body + reward)
export function TaskListSkeleton({ rows = 3 }: { rows?: number } = {}) {
  return (
    <div className="ui-card" style={{ overflow: 'hidden' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="task-row" style={{ pointerEvents: 'none' }}>
          {sk(40, 40, { borderRadius: 12, flex: 'none' })}
          <div className="task-main grow">
            {sk('48%', 14, { marginBottom: 9 })}
            {sk('74%', 11, { marginBottom: 13 })}
            {sk('100%', 8, { borderRadius: 999 })}
          </div>
          {sk(60, 30, { borderRadius: 999, flex: 'none' })}
        </div>
      ))}
    </div>
  );
}

// Whole 任务中心 page skeleton (hero + tasks + badge wall)
export function AchievementsSkeleton() {
  return (
    <>
      <div className="ui-card" style={{ padding: 20, marginBottom: 16 }}>
        {sk(132, 22, { marginBottom: 12 })}
        {sk('56%', 12, { marginBottom: 18 })}
        <div className="row gap-16">{sk(60, 40)}{sk(60, 40)}{sk(60, 40)}</div>
      </div>
      {sk(88, 15, { marginBottom: 12 })}
      <TaskListSkeleton rows={3} />
      <div style={{ height: 16 }} />
      {sk(120, 15, { marginBottom: 12 })}
      <div className="ui-card" style={{ padding: 18 }}><BadgeGridSkeleton count={8} /></div>
    </>
  );
}

// Circle grid skeleton (mirrors .circle-grid → circle card)
export function CircleGridSkeleton({ count = 6 }: { count?: number } = {}) {
  return (
    <div className="circle-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="ui-card" style={{ padding: 16, pointerEvents: 'none' }}>
          <div className="row gap-12" style={{ alignItems: 'flex-start' }}>
            {sk(44, 44, { borderRadius: 12, flex: 'none' })}
            <div className="grow">{sk('68%', 15, { marginBottom: 9 })}{sk('46%', 12)}</div>
            {sk(56, 30, { borderRadius: 999, flex: 'none' })}
          </div>
          {sk('100%', 12, { marginTop: 15 })}
          {sk('78%', 12, { marginTop: 8 })}
        </div>
      ))}
    </div>
  );
}

// Leaderboard skeleton (mirrors .lb-row inside a card)
export function LeaderboardSkeleton({ rows = 8 }: { rows?: number } = {}) {
  return (
    <div className="ui-card" style={{ overflow: 'hidden' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="lb-row" style={{ pointerEvents: 'none' }}>
          {sk(26, 26, { borderRadius: 8, flex: 'none' })}
          {sk(40, 40, { borderRadius: '30%', flex: 'none' })}
          <div className="grow">{sk('42%', 14, { marginBottom: 7 })}{sk('28%', 11)}</div>
          {sk(44, 16, { flex: 'none' })}
        </div>
      ))}
    </div>
  );
}

// Q&A list skeleton (mirrors .qa-row inside a card)
export function QaListSkeleton({ rows = 6 }: { rows?: number } = {}) {
  return (
    <div className="ui-card" style={{ overflow: 'hidden' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="qa-row" style={{ pointerEvents: 'none' }}>
          {sk(42, 36, { borderRadius: 8, flex: 'none' })}
          <div className="grow">
            {sk('70%', 15, { marginBottom: 10 })}
            {sk('90%', 12, { marginBottom: 7 })}
            {sk('38%', 12)}
          </div>
        </div>
      ))}
    </div>
  );
}

// Chat conversation-list skeleton (AI sidebar)
export function ChatListSkeleton({ rows = 5 }: { rows?: number } = {}) {
  return (
    <div style={{ padding: '6px 0' }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="row gap-12" style={{ padding: '12px 16px', alignItems: 'center' }}>
          {sk(28, 28, { borderRadius: 8, flex: 'none' })}
          <div className="grow">{sk('70%', 13, { marginBottom: 7 })}{sk('40%', 10)}</div>
        </div>
      ))}
    </div>
  );
}
