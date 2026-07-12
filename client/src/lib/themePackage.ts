/**
 * 命名主题包 schema 校验 + 合并内置皮肤。
 * 坏数据回退：返回 { ok:false } / 空数组，调用方不应用。
 */

export const THEME_TOKEN_KEYS = [
  '--brand', '--brand-strong', '--brand-deep', '--brand-soft', '--brand-tint',
  '--page', '--surface', '--surface-2', '--surface-3',
  '--line', '--line-2',
  '--ink', '--ink-2', '--ink-3', '--ink-4',
  '--like', '--success', '--warning', '--danger',
] as const;

export type ThemeTokenKey = (typeof THEME_TOKEN_KEYS)[number];

export interface ThemePackage {
  id: string;
  name: string;
  version: string;
  author?: string;
  tokens: Partial<Record<ThemeTokenKey | string, string>>;
  style?: string;
  mode?: 'light' | 'dark' | 'both';
  customCss?: string;
  color?: string; // 切换器色点
}

export interface ThemeValidateResult {
  ok: boolean;
  error?: string;
  value?: ThemePackage;
}

const ID_RE = /^[a-z][a-z0-9_-]{1,31}$/;
const COLOR_RE = /^(#([0-9a-f]{3,8})|rgb(a)?\([^)]+\)|hsl(a)?\([^)]+\)|[a-z]+)$/i;

function isColorish(v: unknown): boolean {
  if (typeof v !== 'string' || !v.trim()) return false;
  // 允许 CSS 变量引用与简单颜色
  if (v.startsWith('var(') && v.endsWith(')')) return true;
  return COLOR_RE.test(v.trim()) || /^[\w#(),.%\s/-]+$/.test(v.trim());
}

export function validateThemePackage(raw: unknown): ThemeValidateResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: '主题包必须是对象' };
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || !ID_RE.test(o.id)) {
    return { ok: false, error: 'id 须为 2–32 位小写字母数字_-，且以字母开头' };
  }
  if (typeof o.name !== 'string' || !o.name.trim() || o.name.length > 40) {
    return { ok: false, error: 'name 必填且 ≤40 字' };
  }
  if (typeof o.version !== 'string' || !o.version.trim()) {
    return { ok: false, error: 'version 必填' };
  }
  if (!o.tokens || typeof o.tokens !== 'object' || Array.isArray(o.tokens)) {
    return { ok: false, error: 'tokens 必须是对象' };
  }
  const tokens = o.tokens as Record<string, unknown>;
  const keys = Object.keys(tokens);
  if (!keys.length) return { ok: false, error: 'tokens 不能为空' };
  // 至少要有品牌色，防止空壳主题
  if (!tokens['--brand'] && !tokens.brand) {
    return { ok: false, error: 'tokens 至少包含 --brand' };
  }
  for (const [k, v] of Object.entries(tokens)) {
    if (!k.startsWith('--') && k !== 'brand') {
      return { ok: false, error: `非法 token 键：${k}` };
    }
    if (typeof v !== 'string' || !isColorish(v)) {
      return { ok: false, error: `token ${k} 值无效` };
    }
  }
  if (o.mode != null && o.mode !== 'light' && o.mode !== 'dark' && o.mode !== 'both') {
    return { ok: false, error: 'mode 须为 light|dark|both' };
  }
  if (o.customCss != null && typeof o.customCss !== 'string') {
    return { ok: false, error: 'customCss 须为字符串' };
  }
  if (o.customCss && String(o.customCss).length > 20000) {
    return { ok: false, error: 'customCss 过长' };
  }
  // 拒绝 theme CSS 里的表达式注入面（简化）
  if (o.customCss && /expression\s*\(|@import|javascript:/i.test(String(o.customCss))) {
    return { ok: false, error: 'customCss 含不安全内容' };
  }

  const normalizedTokens: Record<string, string> = {};
  for (const [k, v] of Object.entries(tokens)) {
    const key = k === 'brand' ? '--brand' : k;
    normalizedTokens[key] = String(v);
  }

  const value: ThemePackage = {
    id: o.id,
    name: String(o.name).trim(),
    version: String(o.version).trim(),
    author: typeof o.author === 'string' ? o.author : undefined,
    tokens: normalizedTokens,
    style: typeof o.style === 'string' ? o.style : undefined,
    mode: (o.mode as ThemePackage['mode']) || 'both',
    customCss: typeof o.customCss === 'string' ? o.customCss : undefined,
    color: normalizedTokens['--brand'],
  };
  return { ok: true, value };
}

/** 解析 custom_themes 配置：JSON 数组；坏数据 → [] */
export function parseCustomThemes(raw: unknown): ThemePackage[] {
  let arr: unknown;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return [];
    try { arr = JSON.parse(s); } catch { return []; }
  } else {
    arr = raw;
  }
  if (!Array.isArray(arr)) return [];
  const out: ThemePackage[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    const r = validateThemePackage(item);
    if (!r.ok || !r.value) continue;
    if (seen.has(r.value.id)) continue;
    // 不与内置 id 冲突（内置保留）
    if (['default', 'violet', 'emerald', 'sunset', 'rose', 'cyan'].includes(r.value.id)) continue;
    seen.add(r.value.id);
    out.push(r.value);
    if (out.length >= 32) break;
  }
  return out;
}

/** 合并内置皮肤 + 自定义主题为切换器列表项 */
export function mergeSkins<T extends { key: string; label: string; color: string }>(
  builtins: T[],
  customs: ThemePackage[],
): Array<T | { key: string; label: string; color: string; custom: true; package: ThemePackage }> {
  const extra = customs.map((p) => ({
    key: p.id,
    label: p.name,
    color: p.color || p.tokens['--brand'] || '#2b54f0',
    custom: true as const,
    package: p,
  }));
  return [...builtins, ...extra];
}

/** 将主题 token 对象序列化为 CSS 声明块（不含选择器） */
export function tokensToCss(tokens: Record<string, string>): string {
  return Object.entries(tokens)
    .filter(([k, v]) => k.startsWith('--') && typeof v === 'string')
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}
