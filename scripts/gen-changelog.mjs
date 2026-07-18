#!/usr/bin/env node
/**
 * 从 client/src/pages/Changelog.tsx 的 RELEASES 数据生成仓库根 CHANGELOG.md（spec 03 §3.8）。
 *
 * 站内 /changelog 页在登录墙后面，自部署者升级前无法查「有没有破坏性变更」。此脚本把同一份
 * 版本数据导出成仓库根 CHANGELOG.md，clone 即可查。用法：`npm run changelog:gen`（发版后跑一次）。
 * ⚠️ CHANGELOG.md 是生成物，请勿手动编辑——改内容改 Changelog.tsx 再重跑本脚本。
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'client/src/pages/Changelog.tsx'), 'utf8');

// 定位 `const RELEASES = [` 并字符串感知地平衡匹配到对应的 `]`
// （item 文案里可能有 [图片] / [草稿] 之类方括号，必须跳过字符串内的括号）。
const mi = src.indexOf('const RELEASES');
if (mi === -1) { console.error('✗ 未找到 const RELEASES'); process.exit(1); }
const arrStart = src.indexOf('[', mi);
let i = arrStart, depth = 0, str = null, esc = false;
for (; i < src.length; i++) {
  const c = src[i];
  if (str) {
    if (esc) esc = false;
    else if (c === '\\') esc = true;
    else if (c === str) str = null;
    continue;
  }
  if (c === "'" || c === '"' || c === '`') str = c;
  else if (c === '[') depth++;
  else if (c === ']' && --depth === 0) { i++; break; }
}
const arrText = src.slice(arrStart, i);
// 纯数据字面量（字符串 + 数组 + 对象），用 Function 求值即可
const releases = new Function('return ' + arrText)();

const LABEL = { improve: '改进', fix: '修复', new: '新增', change: '变更', refactor: '重构' };
const out = ['# 更新日志', '',
  '> 本文件由 `npm run changelog:gen` 从 `client/src/pages/Changelog.tsx` 自动生成，请勿手动编辑。',
  ''];
for (const r of releases) {
  out.push(`## ${r.ver} — ${r.date}`, '');
  for (const [type, text] of r.items || []) {
    out.push(`- **[${LABEL[type] || type}]** ${text}`);
  }
  out.push('');
}
writeFileSync(join(root, 'CHANGELOG.md'), out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n');
console.log(`✓ CHANGELOG.md 生成完成：${releases.length} 个版本`);
