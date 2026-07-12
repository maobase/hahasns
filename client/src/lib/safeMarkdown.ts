/**
 * 轻量安全 markdown → HTML。
 * - 先转义全部 HTML，再把白名单语法换成标签
 * - 禁止裸 HTML / script / 事件处理器执行
 * - 链接仅允许 http(s)/mailto/# 相对锚点
 */

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;
  if (href.startsWith('#') || href.startsWith('/')) return href;
  if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) return href;
  return null;
}

/** 将安全 markdown 转为可渲染 HTML 字符串（已转义危险内容）。 */
export function renderSafeMarkdown(src: string): string {
  if (!src) return '';
  let text = String(src).replace(/\r\n/g, '\n');
  // 先整体转义，杜绝原生 HTML/script
  text = escapeHtml(text);

  // fenced code blocks
  text = text.replace(/```([\s\S]*?)```/g, (_m, code) =>
    `<pre class="md-pre"><code>${code.replace(/^\n/, '')}</code></pre>`);

  // headings
  text = text.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  text = text.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  text = text.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  text = text.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  text = text.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // hr
  text = text.replace(/^(?:---|\*\*\*|___)\s*$/gm, '<hr/>');

  // blockquote
  text = text.replace(/^&gt;\s?(.+)$/gm, '<blockquote>$1</blockquote>');

  // unordered list items
  text = text.replace(/^\s*[-*+]\s+(.+)$/gm, '<li>$1</li>');
  text = text.replace(/(?:<li>.*<\/li>\n?)+/g, (block) => `<ul>${block}</ul>`);

  // ordered list
  text = text.replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>');

  // inline: bold / italic / code / links / images
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  text = text.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');

  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
    const href = safeHref(url);
    if (!href) return escapeHtml(alt || '');
    return `<img src="${href}" alt="${alt}" loading="lazy" />`;
  });
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    const href = safeHref(url);
    if (!href) return label;
    return `<a href="${href}" rel="noopener noreferrer" target="_blank">${label}</a>`;
  });

  // paragraphs: double newlines
  const parts = text.split(/\n{2,}/).map((p) => {
    const t = p.trim();
    if (!t) return '';
    if (/^<(h[1-6]|ul|ol|li|pre|blockquote|hr|p)\b/i.test(t)) return t;
    return `<p>${t.replace(/\n/g, '<br/>')}</p>`;
  });
  return parts.filter(Boolean).join('\n');
}

/** 断言危险载荷被转义（测试用，也可给调用方预检）。只查未转义的真实标签/属性。 */
export function isMarkdownSafe(html: string): boolean {
  return !/<script[\s>]/i.test(html)
    && !/<[^>]*\son\w+\s*=/i.test(html)
    && !/href\s*=\s*["']?\s*javascript:/i.test(html);
}
