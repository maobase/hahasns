import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useSite } from './SiteContext';
import { parseCustomThemes, tokensToCss, type ThemePackage } from '../lib/themePackage';

export interface Skin { key: string; label: string; color: string; custom?: boolean; package?: ThemePackage }
export interface VisualStyle { key: string; label: string; desc: string; }

// 视觉风格 (S)：在配色 skin 之上叠加的「质感」维度——圆角/字体/阴影/点缀。
export const STYLES: VisualStyle[] = [
  { key: 'modern', label: '现代', desc: '克制清爽 · 默认' },
  { key: 'refined', label: '高级', desc: '精致细腻 · 收紧圆角' },
  { key: 'cute', label: '可爱', desc: '大圆角 · 柔和俏皮' },
  { key: 'anime', label: '二次元', desc: '鲜亮 · 渐变活泼' },
];
const STYLE_KEYS = STYLES.map((s) => s.key);

export const BUILTIN_SKINS: Skin[] = [
  { key: 'default', label: '经典蓝', color: '#2b54f0' },
  { key: 'violet', label: '锐紫', color: '#7c3aed' },
  { key: 'emerald', label: '翡翠', color: '#059f76' },
  { key: 'sunset', label: '落日橙', color: '#ef6c12' },
  { key: 'rose', label: '玫瑰', color: '#e11d6b' },
  { key: 'cyan', label: '青碧', color: '#0e8fb8' },
];
// 向后兼容导出
export const SKINS = BUILTIN_SKINS;
const BUILTIN_SKIN_KEYS = BUILTIN_SKINS.map((s) => s.key);

type Mode = 'light' | 'dark';

function initMode(): Mode {
  try {
    const q = new URLSearchParams(location.search).get('theme');
    if (q === 'dark' || q === 'light') return q;
    const saved = localStorage.getItem('haha_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch { return 'light'; }
}
function initSkin(): string {
  try {
    // 自定义主题 id 在挂载时（site 未加载）还无法校验，故这里信任已保存的合法格式值，
    // 由 site.loaded 后的校验 effect 兜底把真正非法的皮肤回退到 default。
    const saved = localStorage.getItem('haha_skin');
    return saved && /^[a-z][a-z0-9_-]{0,31}$/.test(saved) ? saved : 'default';
  } catch { return 'default'; }
}
function initStyle(): string {
  try {
    const saved = localStorage.getItem('haha_style');
    return saved && STYLE_KEYS.includes(saved) ? saved : 'modern';
  } catch { return 'modern'; }
}

const HAD_SAVED = (() => {
  try {
    return {
      skin: !!localStorage.getItem('haha_skin'),
      mode: !!localStorage.getItem('haha_theme'),
      style: !!localStorage.getItem('haha_style'),
    };
  } catch { return { skin: true, mode: true, style: true }; }
})();

export interface ThemeValue {
  theme: Mode;
  toggle: () => void;
  isDark: boolean;
  skin: string;
  setSkin: (s: string) => void;
  skins: Skin[];
  style: string;
  setStyle: (s: string) => void;
  styles: VisualStyle[];
  customThemes: ThemePackage[];
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children?: ReactNode }) {
  const site = useSite();
  const customThemes = useMemo(() => parseCustomThemes(site.customThemes), [site.customThemes]);
  const customIds = useMemo(() => customThemes.map((t) => t.id), [customThemes]);
  const skins: Skin[] = useMemo(() => [
    ...BUILTIN_SKINS,
    ...customThemes.map((p) => ({
      key: p.id,
      label: p.name,
      color: p.color || p.tokens['--brand'] || '#2b54f0',
      custom: true,
      package: p,
    })),
  ], [customThemes]);

  const allSkinKeys = useMemo(() => skins.map((s) => s.key), [skins]);
  const [theme, setTheme] = useState<Mode>(initMode);
  const [skin, setSkinState] = useState<string>(() => initSkin());
  const [style, setStyleState] = useState<string>(initStyle);

  // 自定义主题列表变化后，若当前 skin 非法则回退 default。
  // 必须等 site.loaded 为真再判定：否则挂载时 customThemes 尚未拉到，会把待恢复的自定义皮肤误杀成 default。
  useEffect(() => {
    if (!site.loaded) return;
    if (skin && !allSkinKeys.includes(skin) && !BUILTIN_SKIN_KEYS.includes(skin)) {
      setSkinState('default');
    }
  }, [site.loaded, allSkinKeys, skin]);

  useEffect(() => {
    if (!HAD_SAVED.skin && site.defaultSkin && allSkinKeys.includes(site.defaultSkin)) setSkinState(site.defaultSkin);
    if (!HAD_SAVED.style && site.defaultStyle && STYLE_KEYS.includes(site.defaultStyle)) setStyleState(site.defaultStyle);
    if (!HAD_SAVED.mode && (site.defaultMode === 'dark' || site.defaultMode === 'light')) setTheme(site.defaultMode);
  }, [site.defaultSkin, site.defaultStyle, site.defaultMode, allSkinKeys]);

  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = theme;
    // 自定义主题用 data-skin=custom + 内联 token；内置仍用原 skin key
    const isCustom = customIds.includes(skin);
    el.dataset.skin = isCustom ? 'custom' : skin;
    el.dataset.style = style;
    el.classList.forEach((c) => {
      if (/-dark$/.test(c) || BUILTIN_SKIN_KEYS.includes(c) || c === 'custom' || c === 'custom-dark') el.classList.remove(c);
    });
    const heroClass = isCustom
      ? (theme === 'dark' ? 'custom-dark' : 'custom')
      : (theme === 'dark' ? `${skin}-dark` : skin);
    el.classList.add(heroClass);

    // 完整 token 注入（自定义主题）
    const styleId = 'theme-custom-tokens';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    const pkg = customThemes.find((t) => t.id === skin);
    if (pkg) {
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
      }
      const decls = tokensToCss(pkg.tokens as Record<string, string>);
      const extra = pkg.customCss ? `\n${pkg.customCss}` : '';
      styleEl.textContent = `html[data-skin="custom"]{${decls}}${extra}`;
    } else if (styleEl) {
      styleEl.textContent = '';
    }

    try {
      localStorage.setItem('haha_theme', theme);
      // skin 仅在 site 加载后才落盘：避免挂载瞬间用回退值覆写掉尚未恢复的自定义皮肤 id。
      if (site.loaded) localStorage.setItem('haha_skin', skin);
      localStorage.setItem('haha_style', style);
    } catch { /* storage may be unavailable */ }
    const meta = document.querySelector('meta[name="theme-color"]:not([media])')
      || document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0d0f14' : '#ffffff');
  }, [theme, skin, style, customThemes, customIds, site.loaded]);

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  const setSkin = useCallback((s: string) => {
    if (BUILTIN_SKIN_KEYS.includes(s) || customIds.includes(s)) setSkinState(s);
  }, [customIds]);
  const setStyle = useCallback((s: string) => { if (STYLE_KEYS.includes(s)) setStyleState(s); }, []);

  return (
    <ThemeContext.Provider value={{
      theme, toggle, isDark: theme === 'dark', skin, setSkin, skins,
      style, setStyle, styles: STYLES, customThemes,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = (): ThemeValue => useContext(ThemeContext) as ThemeValue;
