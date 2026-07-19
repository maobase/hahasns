import { useState, useEffect } from 'react';
import { Card, CardBody, Spinner, Chip, Input } from '../components/heroui';
import Shell from '../components/Shell';
import Icon from '../components/Icon';
import { Empty } from '../components/States';
import { useLayout } from '../context/SiteContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api/client';
import { fmtNum } from '../lib/format';

function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function LinkCard({ link }: { link: any }) {
  const color = link.color || '#2b54f0';
  const onClick = () => { api.post(`/nav/${link.id}/click`).catch(() => {}); };
  return (
    <a href={link.url} target="_blank" rel="noreferrer noopener" className="nav-card" onClick={onClick}>
      <span className="nav-logo" style={{ '--lc': color } as React.CSSProperties}>{(link.title || '?').slice(0, 1).toUpperCase()}</span>
      <span className="nav-card-body">
        <span className="nav-card-title">{link.title}</span>
        <span className="nav-card-desc">{link.description || hostOf(link.url)}</span>
      </span>
      <Icon name="share" size={14} className="nav-card-go" />
    </a>
  );
}

// 热门导航：宽屏布局下作为顶部横向条展示（取代原右栏竖排小组件）
function PopularNav() {
  const [links, setLinks] = useState<any[]>([]);
  useEffect(() => { api.get('/nav/popular').then(({ data }) => setLinks(data.links)).catch(() => {}); }, []);
  if (!links.length) return null;
  return (
    <div className="ui-card nav-pop">
      <div className="nav-pop-head"><Icon name="fire" size={16} className="tk" /> 热门导航</div>
      <div className="nav-pop-strip">
        {links.map((l, i) => (
          <a href={l.url} target="_blank" rel="noreferrer noopener" className="nav-pop-pill" key={l.id}
            onClick={() => api.post(`/nav/${l.id}/click`).catch(() => {})}>
            <span className={`nav-pop-rank${i < 3 ? ' hot' : ''}`}>{i + 1}</span>
            <span className="nav-pop-dot" style={{ background: l.color || '#2b54f0' }} />
            <span className="nav-pop-title nowrap">{l.title}</span>
            <span className="nav-pop-clicks">{fmtNum(l.clicks)}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

// 个人收藏夹卡片：点击打开网址，hover 出现删除按钮
function MyLinkCard({ link, onDelete }: { link: any; onDelete: () => void }) {
  return (
    <a href={link.url} target="_blank" rel="noreferrer noopener" className="nav-card"
      onClick={() => api.post(`/nav/${link.id}/click`).catch(() => {})}>
      <span className="nav-logo" style={{ '--lc': '#7c5cff' } as React.CSSProperties}>{(link.title || '?').slice(0, 1).toUpperCase()}</span>
      <span className="nav-card-body">
        <span className="nav-card-title">{link.title}</span>
        <span className="nav-card-desc">{link.description || hostOf(link.url)}</span>
      </span>
      <button className="nav-card-del" title="移除收藏" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}><Icon name="close" size={13} /></button>
    </a>
  );
}

// 我的收藏夹：用户自己的常用网址（登录可见可加），与下方管理员维护的「站点推荐」并列。
function MyBookmarks() {
  const { user, setAuthOpen } = useAuth();
  const toast = useToast();
  const [links, setLinks] = useState<any[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', url: '' });
  const load = () => api.get('/nav/mine').then(({ data }) => setLinks(data.links)).catch(() => setLinks([]));
  useEffect(() => { if (user) load(); else setLinks([]); }, [user]);
  const add = async () => {
    if (!form.title.trim() || !form.url.trim()) return toast.err('网站名和链接必填');
    try { await api.post('/nav/mine', form); setForm({ title: '', url: '' }); setAdding(false); toast.ok('已加入收藏夹'); load(); }
    catch (e: any) { toast.err(e.message); }
  };
  const del = async (id: number) => {
    try { await api.delete(`/nav/mine/${id}`); setLinks((l) => (l || []).filter((x) => x.id !== id)); }
    catch (e: any) { toast.err(e.message); }
  };
  return (
    <section className="nav-section">
      <div className="nav-sec-head">
        <span className="nav-sec-ico" style={{ '--cc': '#7c5cff' } as React.CSSProperties}><Icon name="bookmark" size={17} /></span>
        <h2>我的收藏夹</h2>
        {user && <button className="nav-anchor" style={{ marginLeft: 'auto' }} onClick={() => setAdding((a) => !a)}><Icon name="plus" size={14} /> 添加</button>}
      </div>
      {!user ? (
        <div className="ui-card"><div className="faint row gap-8" style={{ padding: '14px 16px', fontSize: 13.5, flexWrap: 'wrap' }}>登录后即可把常用网址收藏到这里，打造你的专属导航。<button className="btn btn-primary btn-sm" onClick={() => setAuthOpen(true)}>登录</button></div></div>
      ) : (
        <>
          {adding && (
            <div className="ui-card" style={{ padding: 14, marginBottom: 10 }}>
              <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
                <Input className="haha-inp" style={{ maxWidth: 160 }} maxLength={40} value={form.title} onChange={(e: any) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="网站名" />
                <Input className="haha-inp grow" maxLength={300} value={form.url} onChange={(e: any) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://… 或直接粘贴网址" onKeyDown={(e: any) => { if (e.key === 'Enter') add(); }} />
                <button className="btn btn-primary btn-sm" onClick={add}>收藏</button>
              </div>
            </div>
          )}
          {links === null ? <div className="flex justify-center py-6"><Spinner color="primary" size="sm" /></div>
            : links.length === 0 ? <div className="ui-card"><div className="faint" style={{ padding: '12px 16px', fontSize: 13 }}>还没有收藏，点右上「添加」把常用网址存进来吧。</div></div>
            : <div className="nav-grid">{links.map((l) => <MyLinkCard key={l.id} link={l} onDelete={() => del(l.id)} />)}</div>}
        </>
      )}
    </section>
  );
}

export default function Nav() {
  const [cats, setCats] = useState<any>(null);

  useEffect(() => {
    api.get('/nav').then(({ data }) => setCats(data.categories)).catch(() => setCats([]));
  }, []);

  const jump = (id: any) => {
    const el = document.getElementById(`nav-sec-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const layout = useLayout('nav', 'wide');
  return (
    <Shell layout={layout}>
      <Card shadow="sm" radius="lg" className="mb-4 border border-default-200">
        <CardBody>
          <h1 className="text-xl font-extrabold flex items-center gap-2">
            <Icon name="grid" size={20} style={{ color: 'var(--brand)' }} /> 网址导航
          </h1>
          <p className="text-default-500 text-small mt-1">精选开发者、设计、学习与效率好站，一处直达。</p>
          {cats && cats.length > 0 && (
            <div className="nav-anchors">
              {cats.map((c: any) => (
                <button key={c.id} className="nav-anchor" onClick={() => jump(c.id)}>
                  <Icon name={c.icon} size={14} /> {c.name}
                </button>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <MyBookmarks />

      <PopularNav />

      {cats === null ? (
        <div className="flex justify-center py-10"><Spinner color="primary" /></div>
      ) : cats.length === 0 ? null : (
        <>
        <div className="nav-sec-head" style={{ marginTop: 4 }}>
          <span className="nav-sec-ico"><Icon name="compass" size={17} /></span>
          <h2>站点推荐</h2>
        </div>
        {cats.map((c: any) => (
          <section key={c.id} id={`nav-sec-${c.id}`} className="nav-section">
            <div className="nav-sec-head">
              <span className="nav-sec-ico"><Icon name={c.icon} size={17} /></span>
              <h2>{c.name}</h2>
              <span className="nav-sec-count">{c.links.length}</span>
            </div>
            <div className="nav-grid">
              {c.links.map((l: any) => <LinkCard key={l.id} link={l} />)}
            </div>
          </section>
        ))}
        </>
      )}
    </Shell>
  );
}
