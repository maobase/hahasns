import { useState, useEffect } from 'react';
import { Card, CardBody, Spinner, Chip } from '../components/heroui';
import Shell from '../components/Shell';
import Icon from '../components/Icon';
import { Empty } from '../components/States';
import api from '../api/client';
import { fmtNum } from '../lib/format';

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function LinkCard({ link }) {
  const color = link.color || '#2b54f0';
  const onClick = () => { api.post(`/nav/${link.id}/click`).catch(() => {}); };
  return (
    <a href={link.url} target="_blank" rel="noreferrer noopener" className="nav-card" onClick={onClick}>
      <span className="nav-logo" style={{ '--lc': color }}>{(link.title || '?').slice(0, 1).toUpperCase()}</span>
      <span className="nav-card-body">
        <span className="nav-card-title">{link.title}</span>
        <span className="nav-card-desc">{link.description || hostOf(link.url)}</span>
      </span>
      <Icon name="share" size={14} className="nav-card-go" />
    </a>
  );
}

function PopularNav() {
  const [links, setLinks] = useState([]);
  useEffect(() => { api.get('/nav/popular').then(({ data }) => setLinks(data.links)).catch(() => {}); }, []);
  if (!links.length) return null;
  return (
    <div className="card widget">
      <div className="widget-head"><div className="widget-title"><Icon name="fire" size={16} className="tk" /> 热门导航</div></div>
      {links.map((l, i) => (
        <a href={l.url} target="_blank" rel="noreferrer noopener" className="pop-nav-row" key={l.id}
          onClick={() => api.post(`/nav/${l.id}/click`).catch(() => {})}>
          <span className={`pop-nav-rank${i < 3 ? ' hot' : ''}`}>{i + 1}</span>
          <span className="pop-nav-dot" style={{ background: l.color || '#2b54f0' }} />
          <span className="pop-nav-title">{l.title}</span>
          <span className="pop-nav-clicks">{fmtNum(l.clicks)}</span>
        </a>
      ))}
    </div>
  );
}

export default function Nav() {
  const [cats, setCats] = useState(null);

  useEffect(() => {
    api.get('/nav').then(({ data }) => setCats(data.categories)).catch(() => setCats([]));
  }, []);

  const jump = (id) => {
    const el = document.getElementById(`nav-sec-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Shell right={<PopularNav />}>
      <Card shadow="sm" radius="lg" className="mb-4 border border-default-200">
        <CardBody>
          <h1 className="text-xl font-extrabold flex items-center gap-2">
            <Icon name="grid" size={20} style={{ color: 'var(--brand)' }} /> 网址导航
          </h1>
          <p className="text-default-500 text-small mt-1">精选开发者、设计、学习与效率好站，一处直达。</p>
          {cats && cats.length > 0 && (
            <div className="nav-anchors">
              {cats.map((c) => (
                <button key={c.id} className="nav-anchor" onClick={() => jump(c.id)}>
                  <Icon name={c.icon} size={14} /> {c.name}
                </button>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {cats === null ? (
        <div className="flex justify-center py-10"><Spinner color="primary" /></div>
      ) : cats.length === 0 ? (
        <div className="card"><Empty icon="🧭" text="导航还在整理中，敬请期待" /></div>
      ) : (
        cats.map((c) => (
          <section key={c.id} id={`nav-sec-${c.id}`} className="nav-section">
            <div className="nav-sec-head">
              <span className="nav-sec-ico"><Icon name={c.icon} size={17} /></span>
              <h2>{c.name}</h2>
              <span className="nav-sec-count">{c.links.length}</span>
            </div>
            <div className="nav-grid">
              {c.links.map((l) => <LinkCard key={l.id} link={l} />)}
            </div>
          </section>
        ))
      )}
    </Shell>
  );
}
