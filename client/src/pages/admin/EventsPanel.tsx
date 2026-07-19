import { useState, useEffect } from 'react';
import Icon from '../../components/Icon';
import { Empty, RowSkeleton } from '../../components/States';
import { Button } from '../../components/heroui';
import { useToast } from '../../context/ToastContext';
import api from '../../api/client';
import { confirmDialog } from '../../components/confirm';
import { ListHead, AdminSearch } from './ui';

// 社区活动后台：查看 + 删除（活动由用户发起，管理员可下架）。
// 第 10 刀自 Admin.tsx 整体抽离：组件自取自存、无外部 props，共享件沿用 ./ui，实现逐字不变。
export default function EventsPanel() {
  const toast = useToast();
  const [list, setList] = useState<any[] | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [q, setQ] = useState('');
  const load = (query = q) => api.get('/events', { params: { q: query || undefined } }).then(({ data }) => setList(data.events)).catch(() => setList([]));
  useEffect(() => { load(); api.get('/events/admin/stats').then(({ data }) => setStats(data)).catch(() => {}); }, []);
  const del = async (e: any) => {
    if (!(await confirmDialog('删除这个活动？'))) return;
    try { await api.delete(`/events/${e.id}`); toast.ok('已删除'); load(); } catch (err: any) { toast.err(err.message); }
  };
  if (list === null) return <RowSkeleton rows={6} />;
  const STAT_CARDS: [string, any][] = stats ? [
    ['活动总数', (stats.total ?? 0).toLocaleString()], ['未结束', (stats.active ?? 0).toLocaleString()],
    ['已结束', (stats.ended ?? 0).toLocaleString()], ['总报名', (stats.totalSignups ?? 0).toLocaleString()],
  ] : [];
  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          {STAT_CARDS.map(([k, v]) => (
            <div className="ui-card stat-card" key={k} style={{ padding: 16 }}>
              <span className="muted" style={{ fontSize: 12.5 }}>{k}</span>
              <div className="num" style={{ fontWeight: 700, marginTop: 8, fontSize: 22 }}>{v}</div>
            </div>
          ))}
        </div>
      )}
      <div className="ui-card" style={{ padding: 14 }}>
        <div className="row gap-8">
          <AdminSearch value={q} onChange={setQ} onSearch={() => load(q)} placeholder="搜索活动标题（含已结束）…" />
        </div>
      </div>
      <div className="ui-card" style={{ padding: 0, overflow: 'hidden' }}>
      <ListHead title="社区活动" count={list.length} />
      {list.length === 0 ? <Empty text={q.trim() ? '没有匹配的活动' : '还没有活动'} /> : list.map((e, i) => (
        <div key={e.id}>
          {i > 0 && <div className="divider" />}
          <div className="row gap-12" style={{ padding: '12px 18px', alignItems: 'flex-start' }}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row gap-6" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="ui-badge">{e.category}</span>
                {e.online ? <span className="ui-badge" style={{ background: 'var(--brand-soft)', color: 'var(--brand-strong)' }}>线上</span> : null}
                <span style={{ fontWeight: 600, fontSize: 14 }}>{e.title}</span>
              </div>
              <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>{e.organizer?.nickname} · {(e.startAt || '').slice(0, 16)} · 报名 {e.signupCount}{e.capacity > 0 ? `/${e.capacity}` : ''}</div>
            </div>
            <Button size="sm" variant="flat" className="haha-btn-app danger" onClick={() => del(e)}><Icon name="trash" size={14} style={{ width: 14, height: 14 }} /> 删除</Button>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}
