import { useState, useEffect } from 'react';
import Icon from '../../components/Icon';
import { Input, Textarea, Button } from '../../components/heroui';
import { useToast } from '../../context/ToastContext';
import api from '../../api/client';
import { fmtNum } from '../../lib/format';
import { confirmDialog } from '../../components/confirm';
import { promptDialog } from '../../components/prompt';
import { Toggle, SaveBtn } from './ui';

// 板块编辑（行内展开）：改 图标/名称/说明/公告 + 付费板块开关与价格。后端 PUT /admin/boards/:id。
function BoardEditForm({ board, onSaved, onCancel }: { board: any; onSaved: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ icon: board.icon || '', name: board.name || '', description: board.description || '', announcement: board.announcement || '', isPaid: !!board.isPaid, price: String(board.price || 0) });
  const save = async () => {
    if (!f.name.trim()) return toast.err('名称必填');
    try {
      await api.put(`/admin/boards/${board.id}`, { name: f.name, icon: f.icon, description: f.description, announcement: f.announcement, isPaid: f.isPaid, price: Math.max(0, Math.round(Number(f.price) || 0)) });
      toast.ok('板块已更新'); onSaved();
    } catch (e: any) { toast.err(e.message); }
  };
  return (
    <div style={{ padding: '0 16px 16px', background: 'var(--surface-2)' }}>
      <div className="row gap-8" style={{ flexWrap: 'wrap', paddingTop: 14 }}>
        <Input className="haha-inp" value={f.icon} onChange={(e: any) => setF((s) => ({ ...s, icon: e.target.value }))} placeholder="图标" style={{ width: 60, textAlign: 'center' }} />
        <Input className="haha-inp" value={f.name} onChange={(e: any) => setF((s) => ({ ...s, name: e.target.value }))} placeholder="板块名称（必填）" style={{ flex: 1, minWidth: 120 }} />
      </div>
      <Input className="haha-inp" value={f.description} onChange={(e: any) => setF((s) => ({ ...s, description: e.target.value }))} placeholder="板块说明（可选）" style={{ width: '100%', marginTop: 8 }} />
      <Textarea className="haha-inp" value={f.announcement} onChange={(e: any) => setF((s) => ({ ...s, announcement: e.target.value }))} placeholder="板块公告（可选）" minRows={2} style={{ width: '100%', marginTop: 8 }} />
      <div className="row gap-12" style={{ marginTop: 10, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}>
        <label className="row gap-8" style={{ fontSize: 13, color: 'var(--ink-2)', alignItems: 'center' }}>
          <Toggle on={f.isPaid} onChange={(v) => setF((s) => ({ ...s, isPaid: v }))} /> 付费板块
          {f.isPaid && <Input className="haha-inp" type="number" min={0} value={f.price} onChange={(e: any) => setF((s) => ({ ...s, price: e.target.value }))} placeholder="积分" style={{ width: 110 }} />}
        </label>
        <div className="row gap-4">
          <Button size="sm" variant="flat" className="haha-btn-app" onClick={onCancel}>取消</Button>
          <SaveBtn onSave={save} />
        </div>
      </div>
    </div>
  );
}

// 板块后台：板块 CRUD / 版主任免 / 行内编辑 + 运营总览（板块数 / 帖子总数 / 付费板块数）。
// 第 9 刀自 Admin.tsx 整体抽离：BoardEditForm 一并迁出，组件自取自存、无外部 props，实现逐字不变。
export default function BoardsPanel() {
  const toast = useToast();
  const [boards, setBoards] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', slug: '', icon: '📁', description: '' });
  const [editId, setEditId] = useState<number | null>(null);
  const load = () => api.get('/forum/boards').then(({ data }) => setBoards(data.boards));
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name || !form.slug) return toast.err('名称和 slug 必填');
    try { await api.post('/admin/boards', form); toast.ok('板块已创建'); setForm({ name: '', slug: '', icon: '📁', description: '' }); load(); }
    catch (e: any) { toast.err(e.message); }
  };
  const del = async (b: any) => { if (!(await confirmDialog(`删除板块「${b.name}」及其所有帖子？`))) return; try { await api.delete(`/admin/boards/${b.id}`); toast.ok('已删除'); load(); } catch (e: any) { toast.err(e.message); } };
  const addMod = async (b: any) => { const username = await promptDialog({ title: `「${b.name}」版主`, label: '输入用户名；已是版主则取消其版主身份', placeholder: '用户名', confirmText: '确定' }); if (!username) return; try { const { data } = await api.post(`/admin/boards/${b.id}/moderators`, { username }); toast.ok(data.added ? '已任命版主' : '已移除版主'); load(); } catch (e: any) { toast.err(e.message); } };
  // 板块运营总览（客户端按已载列表聚合：板块数 / 帖子总数 / 付费板块数）
  const boardStats: [string, number][] = [
    ['板块总数', boards.length],
    ['帖子总数', boards.reduce((s, b: any) => s + (Number(b.threadCount) || 0), 0)],
    ['付费板块', boards.filter((b: any) => b.isPaid).length],
  ];

  return (
    <>
      {boards.length > 0 && (
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: 'var(--gap)' }}>
          {boardStats.map(([k, v]) => (
            <div className="ui-card stat-card" key={k} style={{ padding: 16 }}>
              <span className="muted" style={{ fontSize: 12.5 }}>{k}</span>
              <div className="num" style={{ fontWeight: 700, marginTop: 8, fontSize: 22 }}>{v.toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
      <div className="ui-card" style={{ padding: 16, marginBottom: 'var(--gap)' }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>新建板块</div>
        <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
          <Input className="haha-inp" value={form.icon} onChange={(e: any) => setForm((f: any) => ({ ...f, icon: e.target.value }))} placeholder="图标" style={{ width: 60, textAlign: 'center' }} />
          <Input className="haha-inp" value={form.name} onChange={(e: any) => setForm((f: any) => ({ ...f, name: e.target.value }))} placeholder="板块名称（必填）" style={{ flex: 1, minWidth: 120 }} />
          <Input className="haha-inp" value={form.slug} onChange={(e: any) => setForm((f: any) => ({ ...f, slug: e.target.value }))} placeholder="slug（必填，英文）" style={{ width: 130 }} />
          <Button color="primary" className="haha-btn-app" onClick={create} isDisabled={!form.name.trim() || !form.slug.trim()}>创建</Button>
        </div>
        <Input className="haha-inp" value={form.description} onChange={(e: any) => setForm((f: any) => ({ ...f, description: e.target.value }))} placeholder="板块说明 (可选)" style={{ width: '100%', marginTop: 8 }} />
      </div>
      <div className="ui-card" style={{ overflow: 'hidden' }}>
        {boards.map((b, i) => (
          <div key={b.id}>{i > 0 && <div className="divider" />}
            <div className="row gap-12" style={{ padding: '12px 16px' }}>
              <span style={{ fontSize: 22 }}>{b.icon}</span>
              <div className="grow" style={{ minWidth: 0 }}><b>{b.name}</b> <span className="faint" style={{ fontSize: 12 }}>/{b.slug} · {fmtNum(b.threadCount)}帖 · {b.moderators.length}版主{b.isPaid ? ` · 付费${b.price}` : ''}</span></div>
              <Button size="sm" variant="flat" className="haha-btn-app" onClick={() => setEditId(editId === b.id ? null : b.id)}>{editId === b.id ? '收起' : '编辑'}</Button>
              <Button size="sm" variant="flat" className="haha-btn-app" onClick={() => addMod(b)}>版主</Button>
              <Button size="sm" variant="flat" className="haha-btn-app danger" onClick={() => del(b)}><Icon name="trash" size={14} style={{ width: 14, height: 14 }} /> 删除</Button>
            </div>
            {editId === b.id && <BoardEditForm board={b} onSaved={() => { setEditId(null); load(); }} onCancel={() => setEditId(null)} />}
          </div>
        ))}
      </div>
    </>
  );
}
