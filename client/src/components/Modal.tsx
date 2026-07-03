import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

export interface ModalProps {
  open: boolean;
  onClose?: () => void;
  children?: ReactNode;
  large?: boolean;
  bare?: boolean;
}

export default function Modal({ open, onClose, children, large = false, bare = false }: ModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  // 最新 onClose 放进 ref，这样下面的 effect 只依赖 open（父组件每次 render 传新的
  // onClose 箭头函数也不会导致 effect 反复 cleanup/re-run、把焦点保存/归还搞乱）。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null; // 打开前的焦点，关闭时归还
    document.body.style.overflow = 'hidden';

    const focusables = () => Array.from(
      modalRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((el) => el.offsetParent !== null);

    // 打开后把焦点移进弹窗容器（读屏/键盘用户直接落在 dialog 内，而不是停在触发按钮上）
    const t = setTimeout(() => { modalRef.current?.focus?.(); }, 30);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCloseRef.current?.(); return; }
      if (e.key !== 'Tab') return;
      // 焦点陷阱：Tab 不许离开弹窗（否则键盘用户会 Tab 到弹窗背后的隐藏内容）
      const f = focusables();
      if (f.length === 0) { e.preventDefault(); return; }
      const first = f[0];
      const last = f[f.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || active === modalRef.current || !modalRef.current?.contains(active)) { e.preventDefault(); last.focus(); }
      } else if (active === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      clearTimeout(t);
      prevFocus?.focus?.(); // 归还焦点到触发处
    };
  }, [open]);

  if (!open) return null;
  // portal to body so position:fixed isn't trapped by an ancestor's transform/animation containing block
  return createPortal(
    <div className="modal-mask" onMouseDown={onClose}>
      <div ref={modalRef} className={`modal${large ? ' modal-lg' : ''}`} role="dialog" aria-modal="true" tabIndex={-1}
        style={{ position: 'relative' }}
        onMouseDown={(e) => e.stopPropagation()}>
        {!bare && (
          <button className="modal-close" onClick={onClose} aria-label="关闭"><Icon name="close" size={18} /></button>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
