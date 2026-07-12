/** 首页信息流布局：非法/缺省 → list（与现状一致） */
export type FeedLayout = 'list' | 'waterfall';

export function normalizeFeedLayout(raw: unknown): FeedLayout {
  const v = String(raw || '').trim().toLowerCase();
  return v === 'waterfall' ? 'waterfall' : 'list';
}
