import { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import { Input } from './heroui';

/**
 * 品牌化单行输入弹窗——替代原生 window.prompt（管理端设密码/设版主等）。模块级单例桥
 * （同 confirm.tsx / report.tsx 模式）：`promptDialog(opts)` 调 <PromptHost/> 注册的处理器，
 * 未挂载时安全回退原生 prompt。返回 string（确定）或 null（取消）。
 *   const pw = await promptDialog({ title: '设置新密码', type: 'password', minLength: 6 });
 * <PromptHost/> 全站只挂一个（App 根）。
 */
export type PromptOpts = {
  title?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  type?: 'text' | 'password';
  minLength?: number;
  confirmText?: string;
};

let _promptFn: ((o: PromptOpts) => Promise<string | null>) | null = null;

export function promptDialog(opts: PromptOpts = {}): Promise<string | null> {
  return _promptFn ? _promptFn(opts) : Promise.resolve(window.prompt(opts.title || ''));
}

export function PromptHost() {
  const [st, setSt] = useState<{ open: boolean } & PromptOpts>({ open: false });
  const [val, setVal] = useState('');
  const resolver = useRef<((v: string | null) => void) | null>(null);
  useEffect(() => {
    _promptFn = (opts) => {
      setSt({ open: true, ...opts });
      setVal(opts.defaultValue || '');
      return new Promise<string | null>((res) => { resolver.current = res; });
    };
    return () => { _promptFn = null; };
  }, []);
  const finish = (v: string | null) => { setSt((s) => ({ ...s, open: false })); resolver.current?.(v); resolver.current = null; };
  const min = st.minLength || 0;
  const trimmed = val.trim();
  const tooShort = min > 0 && val.length > 0 && val.length < min;
  const ok = trimmed.length > 0 && val.length >= min;
  const submit = () => { if (ok) finish(val); };
  return (
    <Modal open={st.open} onClose={() => finish(null)} bare>
      <div className="modal-head"><div className="modal-title">{st.title || '请输入'}</div></div>
      <div className="modal-body">
        {st.label && <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 8 }}>{st.label}</div>}
        <Input
          className="haha-inp"
          type={st.type || 'text'}
          value={val}
          autoFocus
          placeholder={st.placeholder || ''}
          onChange={(e: any) => setVal(e.target.value)}
          onKeyDown={(e: any) => { if (e.key === 'Enter' && ok) submit(); }}
          style={{ width: '100%' }}
        />
        {tooShort && <div className="field-err" style={{ marginTop: 6 }}>至少 {min} 位</div>}
        <div className="row gap-8" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="btn btn-ghost" onClick={() => finish(null)}>取消</button>
          <button className="btn btn-primary" disabled={!ok} onClick={submit}>{st.confirmText || '确定'}</button>
        </div>
      </div>
    </Modal>
  );
}
