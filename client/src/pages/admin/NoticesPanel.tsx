import { useState, useEffect } from 'react';
import Icon from '../../components/Icon';
import { Empty } from '../../components/States';
import { Input, Textarea, Button } from '../../components/heroui';
import { useToast } from '../../context/ToastContext';
import api from '../../api/client';
import { timeAgo } from '../../lib/format';
import { confirmDialog } from '../../components/confirm';
import { SaveBtn } from './ui';

const NOTICE_LEVELS = [
  { k: 'info', l: '信息' }, { k: 'success', l: '成功' }, { k: 'warning', l: '提醒' }, { k: 'event', l: '活动' },
];

// 公告编辑（行内展开）：改 标题/补充说明/级别/跳转链接/按钮文字。后端 PUT /notices/:id（上线/置顶仍走行内快捷按钮）。
function NoticeEditForm({ item, onSaved, onCancel }: { item: any; onSaved: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ title: item.title || '', body: item.body || '', level: item.level || 'info', link: item.link || '', linkLabel: item.linkLabel || '' });
  const save = async () => {
    if (!f.title.trim()) return toast.err('公告标题必填');
    try { await api.put(`/notices/${item.id}`, { title: f.title, body: f.body, level: f.level, link: f.link, linkLabel: f.linkLabel }); toast.ok('公告已更新'); onSaved(); }
    catch (e: any) { toast.err(e.message); }
  };
  return (
    <div style={{ padding: '0 16px 16px', background: 'var(--surface-2)' }}>
      <div className="sec-grid" style={{ paddingTop: 14 }}>
        <label className="sec-field" style={{ gridColumn: '1 / -1' }}><span className="sec-label">标题 <i className="sec-req">*</i></span><Input className="haha-inp" maxLength={120} value={f.title} onChange={(e: any) => setF((s) => ({ ...s, title: e.target.value }))} /></label>
        <label className="sec-field" style={{ gridColumn: '1 / -1' }}><span className="sec-label">补充说明</span><Textarea className="haha-inp" minRows={2} maxLength={500} value={f.body} onChange={(e: any) => setF((s) => ({ ...s, body: e.target.value }))} /></label>
        <label className="sec-field"><span className="sec-label">级别</span><select className="haha-inp" value={f.level} onChange={(e) => setF((s) => ({ ...s, level: e.target.value }))}>{NOTICE_LEVELS.map((l) => <option key={l.k} value={l.k}>{l.l}</option>)}</select></label>
        <label className="sec-field"><span className="sec-label">跳转链接</span><Input className="haha-inp" maxLength={300} value={f.link} onChange={(e: any) => setF((s) => ({ ...s, link: e.target.value }))} placeholder="如 /events" /></label>
        <label className="sec-field"><span className="sec-label">按钮文字</span><Input className="haha-inp" maxLength={30} value={f.linkLabel} onChange={(e: any) => setF((s) => ({ ...s, linkLabel: e.target.value }))} placeholder="如 查看详情" /></label>
      </div>
      <div className="row gap-4" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        <Button size="sm" variant="flat" className="haha-btn-app" onClick={onCancel}>取消</Button>
        <SaveBtn onSave={save} />
      </div>
    </div>
  );
}

// 公告后台：全站公告横幅的发布 / 行内编辑 / 上下线 / 置顶 / 删除。
// 第 9 刀自 Admin.tsx 整体抽离：NOTICE_LEVELS 与 NoticeEditForm 一并迁出，组件自取自存、无外部 props，实现逐字不变。
export default function NoticesPanel() {
  const toast = useToast();
  const [list, setList] = useState<any[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({ title: '', body: '', level: 'info', link: '', linkLabel: '', pinned: false });
  const load = () => api.get('/notices/all').then(({ data }) => setList(data.notices)).catch(() => {});
  useEffect(() => { load(); }, []);
  const create = async () => {
    if (!form.title.trim()) return toast.err('公告标题必填');
    try { await api.post('/notices', form); toast.ok('公告已发布'); setForm({ title: '', body: '', level: 'info', link: '', linkLabel: '', pinned: false }); load(); }
    catch (e: any) { toast.err(e.message); }
  };
  const patch = async (n: any, p: any) => { try { await api.put(`/notices/${n.id}`, p); load(); } catch (e: any) { toast.err(e.message); } };
  const del = async (n: any) => { if (!(await confirmDialog(`删除公告「${n.title}」？`))) return; try { await api.delete(`/notices/${n.id}`); toast.ok('已删除'); load(); } catch (e: any) { toast.err(e.message); } };
  return (
    <>
      <div className="ui-card" style={{ padding: 16, marginBottom: 'var(--gap)' }}>
        <div className="col gap-8">
          <Input className="haha-inp" value={form.title} onChange={(e: any) => setForm((f: any) => ({ ...f, title: e.target.value }))} placeholder="公告标题（必填）" style={{ width: '100%' }} />
          <Input className="haha-inp" value={form.body} onChange={(e: any) => setForm((f: any) => ({ ...f, body: e.target.value }))} placeholder="补充说明（选填）" style={{ width: '100%' }} />
          <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
            <select className="haha-inp" value={form.level} onChange={(e) => setForm((f: any) => ({ ...f, level: e.target.value }))} style={{ minWidth: 110, width: 'auto' }}>
              {NOTICE_LEVELS.map((l) => <option key={l.k} value={l.k}>{l.l}</option>)}
            </select>
            <Input className="haha-inp" value={form.link} onChange={(e: any) => setForm((f: any) => ({ ...f, link: e.target.value }))} placeholder="跳转链接（选填，如 /events）" style={{ flex: 1, minWidth: 150 }} />
            <Input className="haha-inp" value={form.linkLabel} onChange={(e: any) => setForm((f: any) => ({ ...f, linkLabel: e.target.value }))} placeholder="按钮文字" style={{ width: 110 }} />
          </div>
          <div className="row gap-12" style={{ justifyContent: 'space-between' }}>
            <label className="row gap-6" style={{ fontSize: 13, cursor: 'pointer', color: 'var(--ink-2)' }}>
              <input type="checkbox" checked={form.pinned} onChange={(e) => setForm((f: any) => ({ ...f, pinned: e.target.checked }))} /> 置顶展示
            </label>
            <Button color="primary" className="haha-btn-app" onClick={create} isDisabled={!form.title.trim()}>发布公告</Button>
          </div>
        </div>
      </div>
      <div className="ui-card" style={{ overflow: 'hidden' }}>
        {list.length === 0 ? <Empty icon="📋" text="还没有公告，发布第一条吧" /> : list.map((n, i) => (
          <div key={n.id}>{i > 0 && <div className="divider" />}
            <div className="row gap-12" style={{ padding: '12px 16px', alignItems: 'flex-start' }}>
              <span className={`ui-badge sn-badge sn-badge-${n.level}`}>{(NOTICE_LEVELS.find((l) => l.k === n.level) || { l: n.level }).l}</span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{n.title} {n.pinned ? <Icon name="pin" size={12} style={{ color: 'var(--brand)', verticalAlign: '-1px' }} /> : null}</div>
                {n.body && <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>{n.body}</div>}
                <div className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>{timeAgo(n.createdAt)} · {n.active ? '展示中' : '已下线'}</div>
              </div>
              <div className="row gap-6" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Button size="sm" variant="flat" className="haha-btn-app" onClick={() => setEditId(editId === n.id ? null : n.id)}>{editId === n.id ? '收起' : '编辑'}</Button>
                <Button size="sm" variant="flat" className="haha-btn-app" onClick={() => patch(n, { active: !n.active })}>{n.active ? '下线' : '上线'}</Button>
                <Button size="sm" variant="flat" className="haha-btn-app" onClick={() => patch(n, { pinned: !n.pinned })}>{n.pinned ? '取消置顶' : '置顶'}</Button>
                <Button size="sm" variant="flat" className="haha-btn-app danger" onClick={() => del(n)}><Icon name="trash" size={14} style={{ width: 14, height: 14 }} /> 删除</Button>
              </div>
            </div>
            {editId === n.id && <NoticeEditForm item={n} onSaved={() => { setEditId(null); load(); }} onCancel={() => setEditId(null)} />}
          </div>
        ))}
      </div>
    </>
  );
}
