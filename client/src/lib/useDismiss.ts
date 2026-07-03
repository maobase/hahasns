import { useEffect } from 'react';
import type { RefObject } from 'react';

/**
 * 弹出层（⋯菜单 / popover）通用「点外部或按 Esc 关闭」。
 * 补齐历史上只用 onMouseLeave 关闭的缺口：触摸端没有 mouseLeave（点别处菜单会卡着不关），
 * 键盘用户也无法关闭。传入弹层的容器 ref（须同时包住触发按钮与弹层本体，
 * 这样点触发按钮做 toggle 不会被判为「外部」）。
 */
export function useDismiss(open: boolean, onClose: () => void, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // 延到下一 tick 再挂，避免「打开菜单的那次 pointer 事件」立刻把它判成外部点击关掉。
    const id = setTimeout(() => {
      document.addEventListener('pointerdown', onDown);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, ref]);
}
