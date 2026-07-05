import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { useSite } from './SiteContext';

export interface Skin { key: string; label: string; color: string; }
export interface VisualStyle { key: string; label: string; desc: string; }

// 视觉风格 (S)：在配色 skin 之上叠加的「质感」维度——圆角/字体/阴影/点缀。
// 映射到 [data-style] 的 token 覆盖（见 styles/styles.css）。
export const STYLES: VisualStyle[] = [
  { key: 'modern', label: '现代', desc: '克制清爽 · 默认' },
  { key: 'refined', label: '高级', desc: '精致细腻 · 收紧圆角' },
  { key: 'cute', label: '可爱', desc: '大圆角 · 柔和俏皮' },
  { key: 'anime', label: '二次元', desc: '鲜亮 · 渐变活泼' },
];
const STYLE_KEYS = STYLES.map((s) => s.key);

// HeroUI Pro-style color schemes. Each maps to a [data-skin] CSS ramp + a
// HeroUI tailwind theme (`<skin>` / `<skin>-dark`).
export const SKINS: Skin[] = [
  { key: 'default', label: '经典蓝', color: '#2b54f0' },
  { key: 'violet', label: '锐紫', color: '#7c3aed' },
  { key: 'emerald', label: '翡翠', color: '#059f76' },
  { key: 'sunset', label: '落日橙', color: '#ef6c12' },
  { key: 'rose', label: '玫瑰', color: '#e11d6b' },
  { key: 'cyan', label: '青碧', color: '#0e8fb8' },
];
const SKIN_KEYS = SKINS.map((s) => s.key);

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
    const saved = localStorage.getItem('haha_skin');
    return saved && SKIN_KEYS.includes(saved) ? saved : 'default';
  } catch { return 'default'; }
}
function initStyle(): string {
  try {
    const saved = localStorage.getItem('haha_style');
    return saved && STYLE_KEYS.includes(saved) ? saved : 'modern';
  } catch { return 'modern'; }
}

// 模块加载时（在 ThemeProvider 的持久化副作用把默认值写进 localStorage 之前）捕获「是否已有本地偏好」，
// 用于判断首访——只有首访（无偏好）才应用后台配置的默认皮肤/亮暗/风格，绝不覆盖用户已选。
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
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children?: ReactNode }) {
  const [theme, setTheme] = useState<Mode>(initMode);
  const [skin, setSkinState] = useState<string>(initSkin);
  const [style, setStyleState] = useState<string>(initStyle);
  const site = useSite();

  // 首访（无本地偏好）时应用后台配置的默认皮肤/亮暗/风格；getSite 异步返回后触发一次，
  // 应用后由下方持久化副作用存入 localStorage，下次访问不再闪。有偏好者完全不受影响。
  useEffect(() => {
    if (!HAD_SAVED.skin && site.defaultSkin && SKIN_KEYS.includes(site.defaultSkin)) setSkinState(site.defaultSkin);
    if (!HAD_SAVED.style && site.defaultStyle && STYLE_KEYS.includes(site.defaultStyle)) setStyleState(site.defaultStyle);
    if (!HAD_SAVED.mode && (site.defaultMode === 'dark' || site.defaultMode === 'light')) setTheme(site.defaultMode);
  }, [site.defaultSkin, site.defaultStyle, site.defaultMode]);

  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = theme;
    el.dataset.skin = skin;
    el.dataset.style = style;
    // HeroUI tailwind theme class (used by converted HeroUI components)
    el.classList.forEach((c) => { if (/-dark$/.test(c) || SKIN_KEYS.includes(c)) el.classList.remove(c); });
    el.classList.add(theme === 'dark' ? `${skin}-dark` : skin);
    try {
      localStorage.setItem('haha_theme', theme);
      localStorage.setItem('haha_skin', skin);
      localStorage.setItem('haha_style', style);
    } catch { /* storage may be unavailable */ }
    const meta = document.querySelector('meta[name="theme-color"]:not([media])')
      || document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0d0f14' : '#ffffff');
  }, [theme, skin, style]);

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);
  const setSkin = useCallback((s: string) => { if (SKIN_KEYS.includes(s)) setSkinState(s); }, []);
  const setStyle = useCallback((s: string) => { if (STYLE_KEYS.includes(s)) setStyleState(s); }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle, isDark: theme === 'dark', skin, setSkin, skins: SKINS, style, setStyle, styles: STYLES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = (): ThemeValue => useContext(ThemeContext) as ThemeValue;
