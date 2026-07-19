import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Modal as HModal, ModalContent } from './heroui';
import Icon from './Icon';

export interface ModalProps {
  open: boolean;
  onClose?: () => void;
  children?: ReactNode;
  large?: boolean;
  bare?: boolean;
}

/**
 * 全站通用弹窗 —— HeroUI Modal 的封装（spec01 §1.2 组件双轨收敛）。
 *
 * 对外契约与旧自研实现完全一致：props（open/onClose/large/bare）与渲染出的
 * class（.modal-mask / .modal / .modal-lg / .modal-close）原样保留，全部消费组件
 * 零改动、样式零改动。差异只在底层：portal、点遮罩关闭、焦点陷阱、焦点归还、
 * body 滚动锁定改由 react-aria ModalOverlay/Dialog 提供（与旧手写实现一一对应）。
 * 打开动画沿用 .modal 的 modal-in；关闭与旧实现一样立即卸载
 * （见 components.css 里 .modal-shell / .modal-mask[data-entering|exiting] 的对齐规则）。
 */
export default function Modal({ open, onClose, children, large = false, bare = false }: ModalProps) {
  // document 级 ESC 兜底：RAC 的 ESC 关闭绑定在弹窗子树（焦点需在弹窗内事件才到达）；
  // 旧实现是 document 监听，焦点不在弹窗内（如打开瞬间 autofocus 尚未落位）也能关。
  // 与 RAC 自带的子树内 ESC 并存时 onClose 可能同事件触发两次——所有消费者的
  // onClose 都是 setState(false) 式幂等操作，无实际影响。
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <HModal
      isOpen={open}
      onOpenChange={(o: boolean) => { if (!o) onClose?.(); }}
      classNames={{ backdrop: 'modal-mask', container: 'modal-shell', dialog: `modal${large ? ' modal-lg' : ''}` }}
    >
      <ModalContent>
        {!bare && (
          <button className="modal-close" onClick={onClose} aria-label="关闭"><Icon name="close" size={18} /></button>
        )}
        {children}
      </ModalContent>
    </HModal>
  );
}
