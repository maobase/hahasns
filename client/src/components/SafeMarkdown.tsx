import { renderSafeMarkdown } from '../lib/safeMarkdown';

/** 安全 markdown 渲染：HTML 已转义，禁止 script/事件执行 */
export default function SafeMarkdown({ source, className }: { source: string; className?: string }) {
  const html = renderSafeMarkdown(source || '');
  if (!html) return null;
  return (
    <div
      className={className ? `safe-md ${className}` : 'safe-md'}
      // 内容经 escapeHtml + 白名单语法替换，无裸 HTML
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
