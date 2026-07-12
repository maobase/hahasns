import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import api from '../api/client';

// 站点外观自定义 (W) —— 站名 / 副标题 / Logo / 全站自定义 CSS。
// 公开接口 /api/site，未登录也能取，所以 Provider 放在最外层，登录页也能用自定义品牌。
export interface SiteConfig {
  name: string;
  slogan: string;
  logo: string;
  logoOnly: boolean;  // 有 logo 时只显图隐藏站名；默认 false
  logoHeight: number; // LOGO 高度 px，默认 33，范围 [24,64]
  favicon: string;   // 浏览器标签图标 URL（走对象存储 / 图床）；留空用 index.html 内置 SVG
  customCss: string;
  footerText: string; // 页脚版权文案；空 = 用内置默认
  icpBeian: string;   // ICP 备案号；空 = 不显示
  rechargeTiers: string; // 充值档位 CSV（分）；空 = 用内置默认
  reportReasons: string; // 举报理由（换行分隔）；空 = 用内置默认
  registrationEnabled: boolean; // 注册开关；默认 true
  inviteRequired: boolean;      // 邀请码必填；默认 false
  allowGuest: boolean;          // 游客浏览；默认 false
  aboutContent: string;
  roadmapContent: string;
  changelogContent: string;
  pageAboutOn: boolean;
  pageRoadmapOn: boolean;
  pageChangelogOn: boolean;
  feedLayout: string;
  customThemes: string;
  uploadMaxImages: number;      // 单次最多上传张数；默认 9
  uploadMaxSizeMb: number;      // 单文件最大 MB；默认 25
  paidPriceMax: number;         // 付费内容价格上限（积分）；默认 100000
  landingTitle: string;         // 落地页主标题；空=内置默认
  landingSubtitle: string;      // 落地页副标题；空=内置默认
  defaultSkin: string;          // 新访客默认皮肤；空=内置默认
  defaultMode: string;          // 新访客默认亮暗（light|dark）；空=跟随系统
  defaultStyle: string;         // 新访客默认视觉风格；空=内置默认
  homeTabs: Record<string, boolean>; // 首页信息流可选 tab 开关；缺省=显示
  widgets: Record<string, boolean>;  // 右栏挂件开关；缺省=显示
  vipPrices: Record<string, number | null>; // VIP 各档位月价（分）；null=用内置默认
  vipTiers: Record<string, { name: string | null; tagline: string | null; perks: string | null }>; // VIP 档位名称/标语/权益(每行一条)；null=用内置默认
  customNavLinks: { label: string; url: string }[]; // 自定义导航外链（波D）；空数组=无
  navLabels: Record<string, string>; // 导航项改名（波D）：路径→新名称；缺省=用内置标签
  modules: Record<string, boolean>; // 模块市场 (C)：模块开关；缺省视为开启
  layouts: Record<string, string>;  // 布局市场：每页布局 default|wide|narrow；缺省=各页内置默认
  payments?: { alipay?: boolean; wechat?: boolean; epay?: boolean }; // 已启用的支付网关（仅布尔，无密钥）
  loaded: boolean; // /api/site 是否已返回；主题恢复要等它为真，避免把未加载的自定义皮肤误判为非法
}

const DEFAULTS: SiteConfig = {
  name: 'HahaSNS', slogan: '轻社交社区', logo: '', logoOnly: false, logoHeight: 33,
  favicon: '', customCss: '', footerText: '', icpBeian: '', rechargeTiers: '', reportReasons: '',
  registrationEnabled: true, inviteRequired: false, allowGuest: false,
  aboutContent: '', roadmapContent: '', changelogContent: '',
  pageAboutOn: true, pageRoadmapOn: true, pageChangelogOn: true,
  feedLayout: 'list', customThemes: '',
  uploadMaxImages: 9, uploadMaxSizeMb: 25, paidPriceMax: 100000,
  landingTitle: '', landingSubtitle: '', defaultSkin: '', defaultMode: '', defaultStyle: '',
  homeTabs: {}, widgets: {}, vipPrices: {}, vipTiers: {}, customNavLinks: [], navLabels: {},
  modules: {}, layouts: {}, payments: {}, loaded: false,
};

// 模块是否开启：只有显式 false 才隐藏（取不到配置时默认全开，绝不误伤导航）
export function moduleOn(modules: Record<string, boolean> | undefined, key?: string) {
  if (!key) return true;
  return modules?.[key] !== false;
}

// 右栏挂件是否显示：同 moduleOn，只有显式 false 才隐藏（缺省全开）
export function widgetOn(widgets: Record<string, boolean> | undefined, key: string) {
  return widgets?.[key] !== false;
}

// 取某页的后台布局配置；站长未设置则用该页内置默认 fallback（零回归）。
export function pageLayoutOf(layouts: Record<string, string> | undefined, key: string, fallback: string) {
  return layouts?.[key] || fallback;
}

const SiteContext = createContext<SiteConfig>(DEFAULTS);

export function SiteProvider({ children }: { children: ReactNode }) {
  const [site, setSite] = useState<SiteConfig>(DEFAULTS);

  useEffect(() => {
    let alive = true;
    api.get('/site')
      .then(({ data }) => {
        if (!alive) return;
        setSite(data ? { ...DEFAULTS, ...data, loaded: true } : (s) => ({ ...s, loaded: true }));
      })
      .catch(() => { if (alive) setSite((s) => ({ ...s, loaded: true })); }); // 取不到就用内置默认，仍标记已加载，避免主题恢复一直挂起
    return () => { alive = false; };
  }, []);

  // 把自定义 CSS 注入 <head> 的专用 <style>，随配置变化更新；卸载时清理。
  useEffect(() => {
    const id = 'site-custom-css';
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!site.customCss) { if (el) el.textContent = ''; return; }
    if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
    el.textContent = site.customCss;
  }, [site.customCss]);

  // 自定义 favicon：站长设了就把 <link rel=icon> 的 href 换成对象存储 URL；留空则保留 index.html 内置 SVG。
  useEffect(() => {
    if (!site.favicon) return;
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.href = site.favicon;
  }, [site.favicon]);

  return <SiteContext.Provider value={site}>{children}</SiteContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSite() { return useContext(SiteContext); }

// 便捷 hook：读取某页后台布局，未配置则回退到该页内置默认（'default'|'wide'|'narrow'）。
// eslint-disable-next-line react-refresh/only-export-components
export function useLayout(key: string, fallback: string = 'default') {
  return pageLayoutOf(useContext(SiteContext).layouts, key, fallback);
}
