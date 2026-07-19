import { useState, useEffect } from 'react';
import Icon from '../../components/Icon';
import { Empty, RowSkeleton } from '../../components/States';
import { Input, Button } from '../../components/heroui';
import { useToast } from '../../context/ToastContext';
import api from '../../api/client';
import { confirmDialog } from '../../components/confirm';
import { SaveBtn } from './ui';

// 网址导航后台：分类 + 链接 的增删（前台 /nav 展示）。
// 第 7 刀自 Admin.tsx 整体抽离：分类与链接的新建 / 编辑 / 删除一并迁出，组件自取自存、无外部 props，实现逐字不变。
export default function NavPanel() {
  const toast = useToast();
  const [cats, setCats] = useState<any[] | null>(null);
  const [newCat, setNewCat] = useState({ name: '', icon: 'compass' });
  const [newLink, setNewLink] = useState<Record<number, { title: string; url: string }>>({});
  const load = () => api.get('/nav').then(({ data }) => setCats(data.categories)).catch(() => setCats([]));
  useEffect(() => { load(); }, []);
  const addCat = async () => {
    if (newCat.name.trim().length < 1) return toast.err('请输入分类名');
    try { await api.post('/nav/categories', { name: newCat.name, icon: newCat.icon || 'compass' }); setNewCat({ name: '', icon: 'compass' }); toast.ok('已添加分类'); load(); }
    catch (e: any) { toast.err(e.message); }
  };
  const delCat = async (id: number) => { if (!(await confirmDialog('删除该分类及其下所有链接？'))) return; try { await api.delete(`/nav/categories/${id}`); toast.ok('已删除'); load(); } catch (e: any) { toast.err(e.message); } };
  const setLF = (cid: number, k: string, v: string) => setNewLink((s) => {
    const prev = s[cid] || { title: '', url: '' }; // 缺省保证 title/url 存在，再合并已填值与本次编辑
    return { ...s, [cid]: { ...prev, [k]: v } };
  });
  const addLink = async (cid: number) => {
    const f = newLink[cid] || { title: '', url: '' };
    if (!f.title?.trim() || !f.url?.trim()) return toast.err('网站名和链接必填');
    try { await api.post('/nav/links', { categoryId: cid, title: f.title, url: f.url }); setNewLink((s) => ({ ...s, [cid]: { title: '', url: '' } })); toast.ok('已添加链接'); load(); }
    catch (e: any) { toast.err(e.message); }
  };
  const delLink = async (id: number) => { try { await api.delete(`/nav/links/${id}`); toast.ok('已删除'); load(); } catch (e: any) { toast.err(e.message); } };
  const [editLink, setEditLink] = useState<number | null>(null);
  const [editLinkVals, setEditLinkVals] = useState({ title: '', url: '' });
  const saveLink = async (id: number) => {
    if (!editLinkVals.title.trim() || !editLinkVals.url.trim()) return toast.err('网站名和链接必填');
    try { await api.put(`/nav/links/${id}`, { title: editLinkVals.title, url: editLinkVals.url }); setEditLink(null); toast.ok('链接已更新'); load(); }
    catch (e: any) { toast.err(e.message); }
  };
  const [editCat, setEditCat] = useState<number | null>(null);
  const [editCatVals, setEditCatVals] = useState({ name: '', icon: '' });
  const saveCat = async (id: number) => {
    if (!editCatVals.name.trim()) return toast.err('分类名必填');
    try { await api.put(`/nav/categories/${id}`, { name: editCatVals.name, icon: editCatVals.icon || 'compass' }); setEditCat(null); toast.ok('分类已更新'); load(); }
    catch (e: any) { toast.err(e.message); }
  };
  if (cats === null) return <RowSkeleton rows={6} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 12 }}>新建分类</div>
        <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
          <Input className="haha-inp" style={{ maxWidth: 220 }} maxLength={20} value={newCat.name} onChange={(e: any) => setNewCat((c) => ({ ...c, name: e.target.value }))} placeholder="分类名（如 开发工具）" />
          <Input className="haha-inp" style={{ maxWidth: 150 }} value={newCat.icon} onChange={(e: any) => setNewCat((c) => ({ ...c, icon: e.target.value }))} placeholder="图标 如 compass" />
          <Button color="primary" className="haha-btn-app" onClick={addCat} isDisabled={!newCat.name.trim()}><Icon name="plus" size={15} style={{ width: 15, height: 15 }} /> 添加分类</Button>
        </div>
      </div>
      {cats.length === 0 ? <div className="ui-card"><Empty text="还没有导航分类，先新建一个" /></div> : cats.map((c) => (
        <div className="ui-card" style={{ padding: 18 }} key={c.id}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
            {editCat === c.id ? (
              <span className="row gap-8" style={{ flexWrap: 'wrap' }}>
                <Input className="haha-inp" style={{ maxWidth: 180 }} maxLength={20} value={editCatVals.name} onChange={(e: any) => setEditCatVals((v) => ({ ...v, name: e.target.value }))} placeholder="分类名" />
                <Input className="haha-inp" style={{ maxWidth: 140 }} value={editCatVals.icon} onChange={(e: any) => setEditCatVals((v) => ({ ...v, icon: e.target.value }))} placeholder="图标" />
                <SaveBtn onSave={() => saveCat(c.id)} />
                <Button size="sm" variant="flat" className="haha-btn-app" onClick={() => setEditCat(null)}>取消</Button>
              </span>
            ) : (
              <span className="row gap-8" style={{ fontWeight: 700 }}><Icon name={c.icon || 'compass'} size={16} /> {c.name} <span className="faint" style={{ fontSize: 12 }}>（{c.links.length}）</span></span>
            )}
            {editCat !== c.id && (
              <span className="row gap-4">
                <Button size="sm" variant="flat" className="haha-btn-app" onClick={() => { setEditCat(c.id); setEditCatVals({ name: c.name, icon: c.icon || 'compass' }); }}>编辑</Button>
                <Button size="sm" variant="flat" className="haha-btn-app danger" onClick={() => delCat(c.id)}><Icon name="trash" size={14} style={{ width: 14, height: 14 }} /> 删分类</Button>
              </span>
            )}
          </div>
          {c.links.map((l: any) => (
            editLink === l.id ? (
              <div className="row gap-8" key={l.id} style={{ padding: '7px 0', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
                <Input className="haha-inp" style={{ maxWidth: 160 }} maxLength={40} value={editLinkVals.title} onChange={(e: any) => setEditLinkVals((v) => ({ ...v, title: e.target.value }))} placeholder="网站名" />
                <Input className="haha-inp grow" maxLength={300} value={editLinkVals.url} onChange={(e: any) => setEditLinkVals((v) => ({ ...v, url: e.target.value }))} placeholder="https://…" />
                <SaveBtn onSave={() => saveLink(l.id)} />
                <Button size="sm" variant="flat" className="haha-btn-app" onClick={() => setEditLink(null)}>取消</Button>
              </div>
            ) : (
              <div className="row gap-8" key={l.id} style={{ padding: '7px 0', borderTop: '1px solid var(--line)' }}>
                <span className="grow nowrap" style={{ minWidth: 0, fontSize: 13.5 }}>{l.title} <span className="faint" style={{ fontSize: 12 }}>· {l.url}</span></span>
                <Button size="sm" variant="flat" className="haha-btn-app" onClick={() => { setEditLink(l.id); setEditLinkVals({ title: l.title, url: l.url }); }}>编辑</Button>
                <Button size="sm" variant="flat" className="haha-btn-app danger" onClick={() => delLink(l.id)}><Icon name="trash" size={14} style={{ width: 14, height: 14 }} /> 删除</Button>
              </div>
            )
          ))}
          <div className="row gap-8" style={{ marginTop: 10, flexWrap: 'wrap' }}>
            <Input className="haha-inp" style={{ maxWidth: 160 }} value={newLink[c.id]?.title || ''} onChange={(e: any) => setLF(c.id, 'title', e.target.value)} placeholder="网站名" />
            <Input className="haha-inp grow" value={newLink[c.id]?.url || ''} onChange={(e: any) => setLF(c.id, 'url', e.target.value)} placeholder="https://…" />
            <SaveBtn onSave={() => addLink(c.id)} label="添加链接" />
          </div>
        </div>
      ))}
    </div>
  );
}
