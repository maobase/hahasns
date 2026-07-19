import { useState, useEffect, useRef } from 'react';
import { Button } from '../../components/heroui';

// 管理后台共享小组件。Toggle 此前是 Admin.tsx 私有组件（其余面板 15+ 处在用），
// 第 2 刀时 PagesPanel 曾内联自带一份；本刀（第 3 刀）上提到此处统一共享，实现逐字不变。
export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} className={`ui-toggle${on ? ' on' : ''}`}
      style={disabled ? { opacity: 0.45, cursor: 'not-allowed' } : undefined} onClick={() => onChange(!on)}>
      <span className="ui-toggle-dot" />
    </button>
  );
}

// 通用 CSV 导出（前缀 BOM 以便 Excel 正确识别 UTF-8 中文）。cols: {label, get}[]。
// 第 5 刀自 Admin.tsx 上提：用户 / 充值订单 / 兑换记录 / 抽奖 / 审计多处共用，实现逐字不变。
export function downloadCSV(filename: string, cols: { label: string; get: (r: any) => any }[], rows: any[]) {
  const esc = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const lines = [cols.map((c) => esc(c.label)).join(','), ...rows.map((r) => cols.map((c) => esc(c.get(r))).join(','))];
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// 后台列表卡统一表头（Arco 表格风）：标题 + 数量胶囊 + 下边框分隔，行从表头下方开始。
// 第 5 刀自 Admin.tsx 上提：商城 / 支付 / 抽奖 / 文章 / 活动 / 圈子 / 问答 / 签到多处共用，实现逐字不变。
export function ListHead({ title, count, action }: { title: string; count?: number; action?: React.ReactNode }) {
  return (
    <div className="admin-list-head">
      <span className="alh-title">{title}</span>
      {count != null && <span className="alh-count">{count}</span>}
      {action && <span className="alh-action">{action}</span>}
    </div>
  );
}

// 带忙碌态的保存按钮：点击后禁用 + 显示「保存中…」，避免重复提交；卸载安全（行内编辑保存成功会收起表单）。
// 第 6 刀自 Admin.tsx 上提：用户 / 板块 / 快报 / 导航 / 抽奖多处共用，实现逐字不变。
export function SaveBtn({ onSave, label = '保存' }: { onSave: () => Promise<any> | void; label?: string }) {
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  return (
    <Button size="sm" color="primary" className="haha-btn-app" isDisabled={busy} onClick={async () => {
      if (busy) return;
      setBusy(true);
      try { await onSave(); } finally { if (mounted.current) setBusy(false); }
    }}>{busy ? '保存中…' : label}</Button>
  );
}
