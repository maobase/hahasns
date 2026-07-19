import { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import { Button } from './heroui';

/**
 * 品牌化二次确认——替代全站原生 window.confirm（无品牌样式、按钮永远「确定/取消」、
 * 移动端体验差、文案不可控）。模块级单例桥：`confirmDialog()` 调用 <ConfirmHost/>
 * 注册的处理器，未挂载时安全回退原生 confirm。用法：
 *   if (!(await confirmDialog('删除后不可恢复', { title: '删除这条动态？', confirmText: '删除' }))) return;
 * danger 默认为 true（破坏性操作红色确认键）；非破坏性动作（如开通会员）传 danger:false 用品牌色。
 * <ConfirmHost/> 全站只挂一个（App 根），所有页面共用，无需给每个组件加 hook。
 */
export type ConfirmOpts = { title?: string; confirmText?: string; danger?: boolean };

let _confirmFn: ((m: string, o?: ConfirmOpts) => Promise<boolean>) | null = null;

export function confirmDialog(message: string, opts?: ConfirmOpts): Promise<boolean> {
  return _confirmFn ? _confirmFn(message, opts) : Promise.resolve(window.confirm(message));
}

export function ConfirmHost() {
  const [st, setSt] = useState<{ open: boolean; message: string; title?: string; confirmText?: string; danger: boolean }>({ open: false, message: '', danger: true });
  const resolver = useRef<((v: boolean) => void) | null>(null);
  useEffect(() => {
    _confirmFn = (message, opts) => {
      setSt({ open: true, message, title: opts?.title, confirmText: opts?.confirmText, danger: opts?.danger !== false });
      return new Promise<boolean>((res) => { resolver.current = res; });
    };
    return () => { _confirmFn = null; };
  }, []);
  const close = (v: boolean) => { setSt((s) => ({ ...s, open: false })); resolver.current?.(v); resolver.current = null; };
  return (
    <Modal open={st.open} onClose={() => close(false)} bare>
      <div className="modal-head"><div className="modal-title">{st.title || '确认操作'}</div></div>
      <div className="modal-body">
        <div style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.65, whiteSpace: 'pre-line' }}>{st.message}</div>
        <div className="row gap-8" style={{ justifyContent: 'flex-end', marginTop: 22 }}>
          <Button variant="flat" className="haha-btn-app" onClick={() => close(false)}>取消</Button>
          <Button color="primary" className="haha-btn-app" style={st.danger ? { background: 'var(--like)' } : undefined} onClick={() => close(true)}>{st.confirmText || '确定'}</Button>
        </div>
      </div>
    </Modal>
  );
}
