import { useState, useEffect } from 'react';
import Icon from '../../components/Icon';
import { Empty, RowSkeleton } from '../../components/States';
import { Button } from '../../components/heroui';
import api from '../../api/client';
import { timeAgo } from '../../lib/format';
import { downloadCSV } from './ui';

const AUDIT_ICON: Record<string, string> = {
  'user.update': 'user', 'content.delete': 'trash', 'report.resolve': 'flag',
  'board.create': 'forum', 'board.update': 'forum', 'board.delete': 'trash', 'board.moderator': 'shield',
  'topic.create': 'fire', 'topic.delete': 'trash', 'product.create': 'shop', 'product.delete': 'trash',
  'notice.create': 'bell', 'notice.update': 'bell', 'notice.delete': 'trash',
  'config.update': 'shield',
};

const AUDIT_PREFIX_LABEL: Record<string, string> = {
  user: '用户', content: '内容', report: '举报', board: '板块', topic: '话题', product: '商品', notice: '公告', config: '配置',
};

// 管理操作审计日志：按动作前缀筛选 + 导出当前筛选为 CSV。
// 第 10 刀自 Admin.tsx 整体抽离：AUDIT_ICON / AUDIT_PREFIX_LABEL 随迁，组件自取自存、无外部 props，实现逐字不变。
export default function LogsPanel() {
  const [logs, setLogs] = useState<any[] | null>(null);
  const [filter, setFilter] = useState('all');
  useEffect(() => { api.get('/admin/audit').then(({ data }) => setLogs(data.logs)).catch(() => setLogs([])); }, []);
  if (logs === null) return <RowSkeleton rows={8} />;
  if (!logs.length) return <div className="ui-card"><Empty icon="📋" text="还没有管理操作记录" /></div>;
  const present = [...new Set(logs.map((l) => l.action.split('.')[0]))].filter((p) => AUDIT_PREFIX_LABEL[p]);
  const chips: [string, string][] = [['all', '全部'], ...present.map((p) => [p, AUDIT_PREFIX_LABEL[p]] as [string, string])];
  const shown = filter === 'all' ? logs : logs.filter((l) => l.action.split('.')[0] === filter);
  return (
    <div className="flex flex-col gap-4">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        {chips.length > 2 ? (
          <div className="audit-filters">
            {chips.map(([k, label]) => (
              <button key={k} className={`audit-chip${filter === k ? ' active' : ''}`} onClick={() => setFilter(k)}>
                {label}{k !== 'all' ? <span className="audit-chip-n"> {logs.filter((l) => l.action.split('.')[0] === k).length}</span> : <span className="audit-chip-n"> {logs.length}</span>}
              </button>
            ))}
          </div>
        ) : <span />}
        <Button size="sm" variant="flat" className="haha-btn-app" isDisabled={!shown.length} title="导出当前筛选的操作日志为 CSV" onClick={() => downloadCSV(`管理日志_${filter}.csv`, [
          { label: '时间', get: (l: any) => l.createdAt },
          { label: '管理员', get: (l: any) => l.admin?.nickname || '管理员' },
          { label: '操作', get: (l: any) => l.actionLabel },
          { label: '动作类型', get: (l: any) => l.action },
          { label: '详情', get: (l: any) => l.detail || '' },
        ], shown)}>导出 CSV</Button>
      </div>
      <div className="ui-card" style={{ overflow: 'hidden' }}>
        {shown.length === 0 ? <Empty text="该类型暂无记录" /> : shown.map((l, i) => (
          <div key={l.id}>{i > 0 && <div className="divider" />}
            <div className="row gap-12" style={{ padding: '12px 16px', alignItems: 'flex-start' }}>
              <span className={`audit-ico${l.action.endsWith('.delete') ? ' danger' : ''}`}><Icon name={AUDIT_ICON[l.action] || 'shield'} size={16} /></span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5 }}><b>{l.admin?.nickname || '管理员'}</b><span style={{ color: 'var(--ink-3)' }}> {l.actionLabel}</span></div>
                {l.detail && <div className="faint" style={{ fontSize: 12.5, marginTop: 2, wordBreak: 'break-word' }}>{l.detail}</div>}
              </div>
              <span className="faint nowrap" style={{ fontSize: 11.5, flex: 'none' }}>{timeAgo(l.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
