import { useState, useEffect } from 'react';
import Icon from '../../components/Icon';
import { Empty, RowSkeleton } from '../../components/States';
import { Input, Textarea, Button } from '../../components/heroui';
import { useToast } from '../../context/ToastContext';
import api from '../../api/client';
import { confirmDialog } from '../../components/confirm';
import { Toggle, ListHead, SaveBtn, AdminSearch } from './ui';

// 资讯快报后台：发布 / 置顶 / 删除快报（前台 /flash 展示）。
// 第 7 刀自 Admin.tsx 整体抽离：发布表单 / 搜索列表 / 行内编辑一并迁出，组件自取自存、无外部 props，实现逐字不变。
const FLASH_CATS = ['公告', '功能', '活动', '精选', '教程', '动态'];
function FlashEditForm({ item, onSaved, onCancel }: { item: any; onSaved: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ title: item.title || '', summary: item.summary || '', category: item.category || '公告', url: item.url || '', pinned: !!item.pinned });
  const save = async () => {
    if (f.title.trim().length < 2) return toast.err('标题至少 2 个字');
    try { await api.put(`/flash/${item.id}`, { title: f.title, summary: f.summary, category: f.category, url: f.url, pinned: f.pinned }); toast.ok('快报已更新'); onSaved(); }
    catch (e: any) { toast.err(e.message); }
  };
  return (
    <div style={{ padding: '0 18px 16px', background: 'var(--surface-2)' }}>
      <div className="sec-grid" style={{ paddingTop: 14 }}>
        <label className="sec-field" style={{ gridColumn: '1 / -1' }}><span className="sec-label">标题 <i className="sec-req">*</i></span><Input className="haha-inp" maxLength={120} value={f.title} onChange={(e: any) => setF((s) => ({ ...s, title: e.target.value }))} /></label>
        <label className="sec-field" style={{ gridColumn: '1 / -1' }}><span className="sec-label">摘要</span><Textarea className="haha-inp" minRows={2} maxLength={300} value={f.summary} onChange={(e: any) => setF((s) => ({ ...s, summary: e.target.value }))} /></label>
        <label className="sec-field"><span className="sec-label">分类</span><select className="haha-inp" value={f.category} onChange={(e) => setF((s) => ({ ...s, category: e.target.value }))}>{FLASH_CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <label className="sec-field"><span className="sec-label">链接</span><Input className="haha-inp" maxLength={300} value={f.url} onChange={(e: any) => setF((s) => ({ ...s, url: e.target.value }))} placeholder="https://…" /></label>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
        <label className="row gap-8" style={{ fontSize: 13.5 }}><Toggle on={f.pinned} onChange={(v) => setF((s) => ({ ...s, pinned: v }))} /> 置顶</label>
        <div className="row gap-4">
          <Button size="sm" variant="flat" className="haha-btn-app" onClick={onCancel}>取消</Button>
          <SaveBtn onSave={save} />
        </div>
      </div>
    </div>
  );
}

export default function FlashPanel() {
  const toast = useToast();
  const [list, setList] = useState<any[] | null>(null);
  const [form, setForm] = useState({ title: '', summary: '', category: '公告', url: '', pinned: false });
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const load = (query = q) => api.get('/flash', { params: { limit: 50, q: query || undefined } }).then(({ data }) => setList(data.flash)).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const publish = async () => {
    if (form.title.trim().length < 2) return toast.err('标题至少 2 个字');
    setSaving(true);
    try { await api.post('/flash', form); toast.ok('快报已发布'); setForm({ title: '', summary: '', category: form.category, url: '', pinned: false }); load(); }
    catch (e: any) { toast.err(e.message); } finally { setSaving(false); }
  };
  const remove = async (id: number) => {
    if (!(await confirmDialog('删除这条快报？'))) return;
    try { await api.delete(`/flash/${id}`); setList((l) => (l || []).filter((x) => x.id !== id)); toast.ok('已删除'); }
    catch (e: any) { toast.err(e.message); }
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 12 }}>发布快报</div>
        <div className="sec-grid">
          <label className="sec-field" style={{ gridColumn: '1 / -1' }}><span className="sec-label">标题 <i className="sec-req">*</i></span><Input className="haha-inp" maxLength={120} value={form.title} onChange={(e: any) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="一句话快报标题" /></label>
          <label className="sec-field" style={{ gridColumn: '1 / -1' }}><span className="sec-label">摘要（可选）</span><Textarea className="haha-inp" minRows={2} maxLength={300} value={form.summary} onChange={(e: any) => setForm((f) => ({ ...f, summary: e.target.value }))} placeholder="补充说明…" /></label>
          <label className="sec-field"><span className="sec-label">分类</span><select className="haha-inp" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>{FLASH_CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
          <label className="sec-field"><span className="sec-label">链接（可选）</span><Input className="haha-inp" maxLength={300} value={form.url} onChange={(e: any) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://…" /></label>
        </div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 14 }}>
          <label className="row gap-8" style={{ fontSize: 13.5 }}><Toggle on={form.pinned} onChange={(v) => setForm((f) => ({ ...f, pinned: v }))} /> 置顶</label>
          <Button color="primary" className="haha-btn-app" onClick={publish} isDisabled={saving}>{saving ? '发布中…' : '发布快报'}</Button>
        </div>
      </div>
      <div className="ui-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 14, borderBottom: '1px solid var(--line)' }}>
          <div className="row gap-8"><AdminSearch value={q} onChange={setQ} onSearch={() => load(q)} placeholder="搜索快报标题…" /></div>
        </div>
        <ListHead title="已发布" count={list?.length ?? 0} />
        {list === null ? <RowSkeleton rows={5} /> : list.length === 0 ? <Empty text={q.trim() ? '没有匹配的快报' : '还没有快报，发布第一条吧'} /> : list.map((f, i) => (
          <div key={f.id}>
            {i > 0 && <div className="divider" />}
            <div className="row gap-12" style={{ padding: '12px 18px', alignItems: 'flex-start' }}>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row gap-6" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                  {f.pinned ? <span className="ui-badge" style={{ background: 'var(--brand-soft)', color: 'var(--brand-strong)' }}>置顶</span> : null}
                  <span className="ui-badge">{f.category}</span>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{f.title}</span>
                </div>
                {f.summary && <div className="faint" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>{f.summary}</div>}
              </div>
              <Button size="sm" variant="flat" className="haha-btn-app" onClick={() => setEditId(editId === f.id ? null : f.id)}>{editId === f.id ? '收起' : '编辑'}</Button>
              <Button size="sm" variant="flat" className="haha-btn-app danger" onClick={() => remove(f.id)}><Icon name="trash" size={14} style={{ width: 14, height: 14 }} /> 删除</Button>
            </div>
            {editId === f.id && <FlashEditForm item={f} onSaved={() => { setEditId(null); load(); }} onCancel={() => setEditId(null)} />}
          </div>
        ))}
      </div>
    </div>
  );
}
