import { useState, useEffect } from 'react';
import Icon from '../../components/Icon';
import { Empty, RowSkeleton } from '../../components/States';
import { Button } from '../../components/heroui';
import { useToast } from '../../context/ToastContext';
import api from '../../api/client';
import { fmtNum } from '../../lib/format';
import { confirmDialog } from '../../components/confirm';
import { ListHead, AdminSearch } from './ui';

// 圈子后台：查看 + 解散（圈子由用户创建，管理员可解散；解散删成员/聊天，圈内动态保留）。
// 第 10 刀自 Admin.tsx 整体抽离：组件自取自存、无外部 props，共享件沿用 ./ui，实现逐字不变。
export default function CirclesPanel() {
  const toast = useToast();
  const [list, setList] = useState<any[] | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [q, setQ] = useState('');
  const load = (query = q) => api.get('/circles', { params: { q: query || undefined } }).then(({ data }) => setList(data.circles)).catch(() => setList([]));
  useEffect(() => { load(); api.get('/circles/admin/stats').then(({ data }) => setStats(data)).catch(() => {}); }, []);
  const del = async (c: any) => {
    if (!(await confirmDialog(`解散圈子「${c.name}」？成员与聊天记录会一并删除，圈内动态保留。`))) return;
    try { await api.delete(`/circles/${c.id}`); toast.ok('已解散'); load(); } catch (e: any) { toast.err(e.message); }
  };
  if (list === null) return <RowSkeleton rows={6} />;
  const STAT_CARDS: [string, any][] = stats ? [
    ['圈子总数', (stats.totalCircles ?? 0).toLocaleString()], ['成员总数', (stats.totalMembers ?? 0).toLocaleString()], ['圈内动态', (stats.totalPosts ?? 0).toLocaleString()],
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
          <AdminSearch value={q} onChange={setQ} onSearch={() => load(q)} placeholder="搜索圈子名称…" />
        </div>
      </div>
      <div className="ui-card" style={{ padding: 0, overflow: 'hidden' }}>
      <ListHead title="圈子" count={list.length} />
      {list.length === 0 ? <Empty text={q.trim() ? '没有匹配的圈子' : '还没有圈子'} /> : list.map((c, i) => (
        <div key={c.id}>
          {i > 0 && <div className="divider" />}
          <div className="row gap-12" style={{ padding: '12px 18px', alignItems: 'flex-start' }}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row gap-6" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="ui-badge">{c.category}</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</span>
              </div>
              <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>{c.owner?.nickname} · {fmtNum(c.memberCount)} 成员 · {fmtNum(c.postCount)} 动态</div>
            </div>
            <Button size="sm" variant="flat" className="haha-btn-app danger" onClick={() => del(c)}><Icon name="trash" size={14} style={{ width: 14, height: 14 }} /> 解散</Button>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}
