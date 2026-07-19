import { useState, useEffect } from 'react';
import Icon from '../../components/Icon';
import { Empty } from '../../components/States';
import { Input, Button } from '../../components/heroui';
import { useToast } from '../../context/ToastContext';
import api from '../../api/client';
import { fmtNum } from '../../lib/format';
import { confirmDialog } from '../../components/confirm';
import { SaveBtn, AdminSearch } from './ui';

// 话题编辑（行内展开）：改 描述/封面/热度。热度(hot)决定发现页话题排序，是运营权重。后端 PUT /admin/topics/:id。
function TopicEditForm({ topic, onSaved, onCancel }: { topic: any; onSaved: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ description: topic.description || '', cover: topic.cover || '', hot: String(topic.hot ?? 0) });
  const save = async () => {
    try { await api.put(`/admin/topics/${topic.id}`, { description: f.description, cover: f.cover, hot: Math.max(0, Math.round(Number(f.hot) || 0)) }); toast.ok('话题已更新'); onSaved(); }
    catch (e: any) { toast.err(e.message); }
  };
  return (
    <div style={{ padding: '0 16px 16px', background: 'var(--surface-2)' }}>
      <Input className="haha-inp" value={f.description} onChange={(e: any) => setF((s) => ({ ...s, description: e.target.value }))} placeholder="话题描述" style={{ width: '100%', marginTop: 14 }} />
      <Input className="haha-inp" value={f.cover} onChange={(e: any) => setF((s) => ({ ...s, cover: e.target.value }))} placeholder="封面图 URL（可选，发现页展示）" style={{ width: '100%', marginTop: 8 }} />
      <div className="row gap-12" style={{ marginTop: 8, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="sec-field" style={{ width: 160 }}><span className="sec-label">热度（发现页排序）</span><Input className="haha-inp" type="number" min={0} value={f.hot} onChange={(e: any) => setF((s) => ({ ...s, hot: e.target.value }))} /></label>
        <div className="row gap-4">
          <Button size="sm" variant="flat" className="haha-btn-app" onClick={onCancel}>取消</Button>
          <SaveBtn onSave={save} />
        </div>
      </div>
    </div>
  );
}

// 话题后台：话题 CRUD / 搜索 / 行内编辑热度 + 运营总览（话题数 / 动态数 / 关注数）。
// 第 9 刀自 Admin.tsx 整体抽离：TopicEditForm 一并迁出，组件自取自存、无外部 props，实现逐字不变。
export default function TopicsPanel() {
  const toast = useToast();
  const [topics, setTopics] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', description: '' });
  const [editId, setEditId] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [stats, setStats] = useState<any>(null);
  const load = (query = q) => api.get('/topics', { params: { q: query || undefined, limit: 100 } }).then(({ data }) => setTopics(data.topics));
  useEffect(() => { load(); api.get('/topics/admin/stats').then(({ data }) => setStats(data)).catch(() => {}); }, []);
  const create = async () => { if (!form.name) return toast.err('话题名必填'); try { await api.post('/admin/topics', form); toast.ok('话题已创建'); setForm({ name: '', description: '' }); load(); } catch (e: any) { toast.err(e.message); } };
  const del = async (t: any) => { if (!(await confirmDialog(`删除话题 #${t.name}#?`))) return; try { await api.delete(`/admin/topics/${t.id}`); toast.ok('已删除'); load(); } catch (e: any) { toast.err(e.message); } };
  const STAT_CARDS: [string, any][] = stats ? [
    ['话题总数', (stats.total ?? 0).toLocaleString()], ['话题动态', (stats.totalPosts ?? 0).toLocaleString()], ['关注总数', (stats.totalFollows ?? 0).toLocaleString()],
  ] : [];
  return (
    <>
      {stats && (
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: 'var(--gap)' }}>
          {STAT_CARDS.map(([k, v]) => (
            <div className="ui-card stat-card" key={k} style={{ padding: 16 }}>
              <span className="muted" style={{ fontSize: 12.5 }}>{k}</span>
              <div className="num" style={{ fontWeight: 700, marginTop: 8, fontSize: 22 }}>{v}</div>
            </div>
          ))}
        </div>
      )}
      <div className="ui-card" style={{ padding: 16, marginBottom: 'var(--gap)' }}>
        <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
          <Input className="haha-inp" value={form.name} onChange={(e: any) => setForm((f: any) => ({ ...f, name: e.target.value }))} placeholder="话题名（必填）" style={{ flex: 1, minWidth: 120 }} />
          <Input className="haha-inp" value={form.description} onChange={(e: any) => setForm((f: any) => ({ ...f, description: e.target.value }))} placeholder="描述" style={{ flex: 1, minWidth: 120 }} />
          <Button color="primary" className="haha-btn-app" onClick={create} isDisabled={!form.name.trim()}>创建话题</Button>
        </div>
      </div>
      <div className="ui-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: 14, borderBottom: '1px solid var(--line)' }}>
          <div className="row gap-8"><AdminSearch value={q} onChange={setQ} onSearch={() => load(q)} placeholder="搜索话题名…" /></div>
        </div>
        {topics.length === 0 ? <Empty text={q.trim() ? '没有匹配的话题' : '还没有话题'} /> : topics.map((t, i) => (
          <div key={t.id}>{i > 0 && <div className="divider" />}
            <div className="row gap-12" style={{ padding: '12px 16px' }}>
              <div className="grow" style={{ minWidth: 0 }}><b>#{t.name}#</b> <span className="faint" style={{ fontSize: 12 }}>{fmtNum(t.post_count)}动态 · 热度{fmtNum(t.hot)}{t.cover ? ' · 有封面' : ''}</span></div>
              <Button size="sm" variant="flat" className="haha-btn-app" onClick={() => setEditId(editId === t.id ? null : t.id)}>{editId === t.id ? '收起' : '编辑'}</Button>
              <Button size="sm" variant="flat" className="haha-btn-app danger" onClick={() => del(t)}><Icon name="trash" size={14} style={{ width: 14, height: 14 }} /> 删除</Button>
            </div>
            {editId === t.id && <TopicEditForm topic={t} onSaved={() => { setEditId(null); load(); }} onCancel={() => setEditId(null)} />}
          </div>
        ))}
      </div>
    </>
  );
}
