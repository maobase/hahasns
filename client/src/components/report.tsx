import { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import { Textarea } from './heroui';
import { useSite } from '../context/SiteContext';

/**
 * 结构化举报——替代原生 window.prompt('举报原因')。预设理由单选 + 可选补充说明，
 * 既统一交互又提升举报数据质量。模块级单例桥（同 confirm.tsx 模式）：reportDialog()
 * 调 <ReportHost/> 注册的处理器，未挂载时安全回退原生 prompt。用法：
 *   const reason = await reportDialog();  // null = 用户取消；否则为拼好的理由字符串
 * <ReportHost/> 全站只挂一个（App 根）。
 */
const REASONS = ['垃圾广告或营销', '色情低俗内容', '人身攻击或辱骂', '虚假信息或诈骗', '违法违规', '侵权（抄袭 / 盗图）', '其他'];
// 后台 report_reasons（换行/逗号分隔）覆盖，空则用上面默认
function parseReasons(raw: string): string[] {
  const r = (raw || '').split(/[\n,，]/).map((x) => x.trim()).filter(Boolean);
  return r.length ? r.slice(0, 20) : REASONS;
}

let _reportFn: (() => Promise<string | null>) | null = null;

export function reportDialog(): Promise<string | null> {
  return _reportFn ? _reportFn() : Promise.resolve(window.prompt('举报原因（选填）：'));
}

export function ReportHost() {
  const reasons = parseReasons(useSite().reportReasons);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const resolver = useRef<((v: string | null) => void) | null>(null);
  useEffect(() => {
    _reportFn = () => {
      setReason(''); setNote(''); setOpen(true);
      return new Promise<string | null>((res) => { resolver.current = res; });
    };
    return () => { _reportFn = null; };
  }, []);
  const finish = (v: string | null) => { setOpen(false); resolver.current?.(v); resolver.current = null; };
  const submit = () => {
    const n = note.trim();
    const r = reason === '其他' ? (n || '其他') : (n ? `${reason}（${n}）` : reason);
    finish(r);
  };
  return (
    <Modal open={open} onClose={() => finish(null)} bare>
      <div className="modal-head"><div className="modal-title">举报</div></div>
      <div className="modal-body">
        <div className="report-reasons">
          {reasons.map((r) => (
            <label key={r} className={`report-reason${reason === r ? ' on' : ''}`}>
              <input type="radio" name="report-reason" checked={reason === r} onChange={() => setReason(r)} />
              <span>{r}</span>
            </label>
          ))}
        </div>
        <Textarea
          className="haha-inp"
          style={{ width: '100%', minHeight: 62, resize: 'vertical', marginTop: 12, fontSize: 14, lineHeight: 1.6, padding: '9px 11px' }}
          placeholder={reason === '其他' ? '请描述举报原因' : '补充说明（选填）'}
          value={note}
          onChange={(e: any) => setNote(e.target.value)}
          maxLength={200}
        />
        <div className="row gap-8" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={() => finish(null)}>取消</button>
          <button className="btn btn-primary" disabled={!reason || (reason === '其他' && !note.trim())} onClick={submit}>提交举报</button>
        </div>
      </div>
    </Modal>
  );
}
