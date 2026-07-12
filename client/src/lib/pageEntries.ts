/**
 * 页面开关 → 入口可见性（与 App.tsx PageGate 一致）。
 * 关页 = 隐藏入口 + 拦截路由；默认全开。
 */

export interface PageFlags {
  pageAboutOn?: boolean;
  pageRoadmapOn?: boolean;
  pageChangelogOn?: boolean;
}

/** 关于页路由/入口是否开放 */
export function pageAboutOpen(flags: PageFlags | null | undefined): boolean {
  return flags?.pageAboutOn !== false;
}

/**
 * /changelog 路由是否开放（更新日志或开发计划任一开启即可；
 * 问题反馈 tab 也挂在该路由下）。
 */
export function pageChangelogRouteOpen(flags: PageFlags | null | undefined): boolean {
  return flags?.pageChangelogOn !== false || flags?.pageRoadmapOn !== false;
}

export type FooterLink = { to: string; label: string };

/** 页脚链接列表：关页不出现入口 */
export function footerLinksOf(flags: PageFlags | null | undefined): FooterLink[] {
  const links: FooterLink[] = [];
  if (flags?.pageChangelogOn !== false) links.push({ to: '/changelog', label: '更新日志' });
  if (flags?.pageRoadmapOn !== false) links.push({ to: '/changelog', label: '开发计划' });
  // 问题反馈挂在 /changelog；路由关时入口也必须消失
  if (pageChangelogRouteOpen(flags)) links.push({ to: '/changelog', label: '问题反馈' });
  if (pageAboutOpen(flags)) links.push({ to: '/about', label: '关于' });
  return links;
}

/** 登录页「了解功能」是否显示 */
export function showAuthAboutLink(flags: PageFlags | null | undefined): boolean {
  return pageAboutOpen(flags);
}
