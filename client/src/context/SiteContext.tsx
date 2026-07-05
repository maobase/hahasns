import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import api from '../api/client';

// 站点外观自定义 (W) —— 站名 / 副标题 / Logo / 全站自定义 CSS。
// 公开接口 /api/site，未登录也能取，所以 Provider 放在最外层，登录页也能用自定义品牌。
export interface SiteConfig {
  name: string;
  slogan: string;
  logo: string;
  favicon: string;   // 浏览器标签图标 URL（走对象存储 / 图床）；留空用 index.html 内置 SVG
  customCss: string;
  footerText: string; // 页脚版权文案；空 = 用内置默认
  icpBeian: string;   // ICP 备案号；空 = 不显示
  rechargeTiers: string; // 充值档位 CSV（分）；空 = 用内置默认
  reportReasons: string; // 举报理由（换行分隔）；空 = 用内置默认
  registrationEnabled: boolean; // 注册开关；默认 true
  inviteRequired: boolean;      // 邀请码必填；默认 false
  uploadMaxImages: number;      // 单次最多上传张数；默认 9
  uploadMaxSizeMb: number;      // 单文件最大 MB；默认 25
  paidPriceMax: number;         // 付费内容价格上限（积分）；默认 100000
  landingTitle: string;         // 落地页主标题；空=内置默认
  landingSubtitle: string;      // 落地页副标题；空=内置默认
  defaultSkin: string;          // 新访客默认皮肤；空=内置默认
  defaultMode: string;          // 新访客默认亮暗（light|dark）；空=跟随系统
  defaultStyle: string;         // 新访客默认视觉风格；空=内置默认
  homeTabs: Record<string, boolean>; // 首页信息流可选 tab 开关；缺省=显示
  modules: Record<string, boolean>; // 模块市场 (C)：模块开关；缺省视为开启
  layouts: Record<string, string>;  // 布局市场：每页布局 default|wide|narrow；缺省=各页内置默认
  payments?: { alipay?: boolean; wechat?: boolean; epay?: boolean }; // 已启用的支付网关（仅布尔，无密钥）
}

const DEFAULTS: SiteConfig = { name: 'HahaSNS', slogan: '轻社交社区', logo: '', favicon: '', customCss: '', footerText: '', icpBeian: '', rechargeTiers: '', reportReasons: '', registrationEnabled: true, inviteRequired: false, uploadMaxImages: 9, uploadMaxSizeMb: 25, paidPriceMax: 100000, landingTitle: '', landingSubtitle: '', defaultSkin: '', defaultMode: '', defaultStyle: '', homeTabs: {}, modules: {}, layouts: {}, payments: {} };

// 模块是否开启：只有显式 false 才隐藏（取不到配置时默认全开，绝不误伤导航）
export function moduleOn(modules: Record<string, boolean> | undefined, key?: string) {
  if (!key) return true;
  return modules?.[key] !== false;
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
      .then(({ data }) => { if (alive && data) setSite({ ...DEFAULTS, ...data }); })
      .catch(() => { /* 取不到就用内置默认，不阻塞首屏 */ });
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
