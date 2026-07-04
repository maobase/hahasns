/**
 * 复制文本到剪贴板，返回是否成功。
 * 优先用 navigator.clipboard（需 HTTPS 安全上下文）；在 HTTP 部署（如自托管未上 HTTPS、
 * 或 43.226 这类 http:// 实例）下 navigator.clipboard 为 undefined，降级到 execCommand('copy')
 * 的隐藏 textarea 方案，保证「复制链接/邀请码/AI 回复」在任何部署环境都能用。
 * 必须在用户手势（点击）回调里调用，execCommand 才生效。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* 安全上下文下也可能因权限失败 → 落到下面兜底 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
