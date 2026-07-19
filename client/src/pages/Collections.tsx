import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Shell from '../components/Shell';
import Icon from '../components/Icon';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';
import { Empty, CardGridSkeleton } from '../components/States';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLayout } from '../context/SiteContext';
import { Tabs, Tab, Input, Textarea, Button } from '../components/heroui';
import api from '../api/client';
import { fmtNum } from '../lib/format';

interface Collection {
  id: number; title: string; cover: string; description: string;
  itemCount: number; owner: any; isOwner: boolean;
}

export default function Collections() {
  const { user, setAuthOpen } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [list, setList] = useState<Collection[] | null>(null);
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', cover: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setList(null);
    api.get<{ collections: Collection[] }>(tab === 'mine' ? '/collections/mine' : '/collections')
      .then(({ data }) => setList(data.collections)).catch(() => setList([]));
  }, [tab]);

  const create = async () => {
    if (form.title.trim().length < 2) return toast.err('标题至少 2 个字');
    setBusy(true);
    try {
      const { data } = await api.post('/collections', form);
      setCreateOpen(false); setForm({ title: '', description: '', cover: '' });
      toast.ok('专题已创建');
      nav(`/collection/${data.collection.id}`);
    } catch (e: any) { toast.err(e.message); } finally { setBusy(false); }
  };

  const layout = useLayout('collections', 'wide');
  return (
    <Shell layout={layout}>
      <div className="ui-card page-title">
        <span><Icon name="grid" size={20} /> 专题合集</span>
        <Button size="sm" color="primary" className="haha-btn-app" onClick={() => (user ? setCreateOpen(true) : setAuthOpen(true))}>
          {/* 内联尺寸：v3 .button 会强制内部 svg 16px，基线此图标为 15px，钉住保持像素一致 */}
          <Icon name="plus" size={15} style={{ width: 15, height: 15 }} /> 创建专题
        </Button>
      </div>

      {user && (
        <Tabs aria-label="专题筛选" className="ui-card haha-feed-tabs"
          selectedKey={tab} onSelectionChange={(k: any) => setTab(k)}>
          <Tab key="all" title="全部专题" />
          <Tab key="mine" title="我的专题" />
        </Tabs>
      )}

      {list === null ? <CardGridSkeleton count={6} minWidth={220} /> : list.length === 0 ? (
        <div className="ui-card"><Empty icon="📚" text={tab === 'mine' ? '你还没有创建专题，点右上角「创建专题」开始策展吧' : '还没有专题，创建第一个吧'} /></div>
      ) : (
        <div className="coll-grid">
          {list.map((c) => (
            <Link to={`/collection/${c.id}`} key={c.id} className="ui-card coll-card">
              <div className="coll-cover" style={c.cover ? { backgroundImage: `url(${c.cover})` } : {}}>
                {!c.cover && <Icon name="grid" size={28} />}
                <span className="coll-count">{fmtNum(c.itemCount)} 篇</span>
              </div>
              <div className="coll-body">
                <div className="coll-title nowrap">{c.title}</div>
                {c.description && <div className="coll-desc">{c.description}</div>}
                <div className="coll-owner">
                  <Avatar user={c.owner} size={20} noLink /> <span className="nowrap">{c.owner?.nickname}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)}>
        <div className="modal-body">
          <h3 style={{ margin: '0 0 16px' }}>创建专题</h3>
          <div className="field">
            <label>标题</label>
            <Input className="haha-inp" value={form.title} onChange={(e: any) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="给专题起个名字" maxLength={80} autoFocus />
          </div>
          <div className="field">
            <label>简介（可选）</label>
            <Textarea className="haha-inp" value={form.description} onChange={(e: any) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="这个专题收录什么？" maxLength={300} />
          </div>
          <div className="field">
            <label>封面图链接（可选）</label>
            <Input className="haha-inp" value={form.cover} onChange={(e: any) => setForm((f) => ({ ...f, cover: e.target.value }))} placeholder="留空则用首个收录内容的图" maxLength={500} />
          </div>
          <Button size="lg" color="primary" fullWidth className="haha-btn-app" isDisabled={busy} onClick={create}>{busy ? '创建中…' : '创建'}</Button>
        </div>
      </Modal>
    </Shell>
  );
}
