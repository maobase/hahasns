import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import Shell from '../components/Shell';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import PostCard from '../components/PostCard';
import FollowButton from '../components/FollowButton';
import { Badges } from '../components/Identity';
import { Loading, Empty, RowSkeleton, LoadError } from '../components/States';
import { useAuth } from '../context/AuthContext';
import { useSite, moduleOn } from '../context/SiteContext';
import { Tabs, Tab, Button } from '../components/heroui';
import api from '../api/client';
import { fmtNum } from '../lib/format';

const TABS = [{ k: 'all', l: '综合' }, { k: 'users', l: '用户' }, { k: 'posts', l: '动态' }, { k: 'threads', l: '帖子' }, { k: 'topics', l: '话题' }];

export default function Search() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { user: me } = useAuth();
  const { modules } = useSite();
  const q = sp.get('q') || '';
  const [input, setInput] = useState(q);
  const [res, setRes] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState('all');
  const [history, setHistory] = useState<any[]>(() => { try { return JSON.parse(localStorage.getItem('haha_search_history') || '[]'); } catch { return []; } });
  const [trending, setTrending] = useState<any[]>([]);
  const [hotTopics, setHotTopics] = useState<any[]>([]);

  useEffect(() => { setInput(q); }, [q]);
  useEffect(() => { api.get('/search/trending').then(({ data }) => setTrending(data.keywords)).catch(() => {}); }, []);
  // 空态发现内容：热门话题，填充无搜索词时的空白区，让搜索页始终有可逛内容。
  // 「话题」属发现模块——站长关闭发现时不拉取、不展示（否则会残留入口并深链到已关闭的 /discover）。
  useEffect(() => {
    if (!moduleOn(modules, 'discover')) { setHotTopics([]); return; }
    api.get('/topics', { params: { limit: 8 } }).then(({ data }) => setHotTopics(data.topics || [])).catch(() => {});
  }, [modules]);
  useEffect(() => {
    if (!q) { setRes(null); setError(false); setLoading(false); return; }
    setLoading(true); setError(false);
    setHistory((h) => { const next = [q, ...h.filter((x) => x !== q)].slice(0, 10); try { localStorage.setItem('haha_search_history', JSON.stringify(next)); } catch {} return next; });
    api.get('/search', { params: { q } }).then(({ data }) => setRes(data)).catch(() => setError(true)).finally(() => setLoading(false));
  }, [q, reloadKey]);

  const has = (k: string) => res && res[k]?.length > 0;
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (input.trim()) nav(`/search?q=${encodeURIComponent(input.trim())}`); };
  const clearHistory = () => { setHistory([]); try { localStorage.removeItem('haha_search_history'); } catch {} };

  return (
    <Shell>
      <form className="search-bar" onSubmit={submit}>
        <Icon name="search" size={18} style={{ color: 'var(--ink-3)', flex: 'none' }} />
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="搜索用户、动态、帖子、话题…" autoFocus={!q && typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches} />
        <Button size="sm" color="primary" className="haha-btn-app" type="submit">搜索</Button>
      </form>
      {q && <div className="muted" style={{ padding: '0 20px', fontSize: 13 }}>“{q}” 的搜索结果</div>}
      {q && (
        <Tabs aria-label="搜索结果分类" className="ui-card haha-feed-tabs"
          selectedKey={tab} onSelectionChange={(k: any) => setTab(k)}>
          {TABS.map((t) => <Tab key={t.k} title={t.l} />)}
        </Tabs>
      )}

      {!q ? (
        <>
          {history.length > 0 && (
            <div className="ui-card widget">
              <div className="widget-head"><div className="widget-title"><Icon name="back" size={14} className="tk" style={{ transform: 'rotate(0deg)' }} /> 最近搜索</div><button className="widget-more" onClick={clearHistory}>清空</button></div>
              <div className="kw-list">{history.map((h: any) => <button className="kw" key={h} onClick={() => nav(`/search?q=${encodeURIComponent(h)}`)}>{h}</button>)}</div>
            </div>
          )}
          {trending.length > 0 && (
            <div className="ui-card widget">
              <div className="widget-head"><div className="widget-title"><Icon name="fire" size={15} className="tk" /> 热搜榜</div></div>
              <div className="kw-list">{trending.map((k: any) => <button className="kw" key={k} onClick={() => nav(`/search?q=${encodeURIComponent(k)}`)}>{k}</button>)}</div>
            </div>
          )}
          {hotTopics.length > 0 && (
            <div className="ui-card widget">
              <div className="widget-head"><div className="widget-title"><Icon name="fire" size={15} className="tk" /> 热门话题</div><Link className="widget-more" to="/discover">发现更多</Link></div>
              <div className="srch-topics">
                {hotTopics.map((t: any) => (
                  <Link className="srch-topic" key={t.id} to={`/topic/${encodeURIComponent(t.name)}`}>
                    <span className="srch-topic-tag">#</span>
                    <span className="srch-topic-main">
                      <span className="srch-topic-name">{t.name}</span>
                      <span className="srch-topic-n">{fmtNum(t.post_count)} 条动态 · 热度 {fmtNum(t.hot)}</span>
                    </span>
                    <Icon name="chevron" size={16} className="srch-topic-go" />
                  </Link>
                ))}
              </div>
            </div>
          )}
          {history.length === 0 && trending.length === 0 && hotTopics.length === 0 && <div className="ui-card"><Empty icon="🔍" text="输入关键词搜索" /></div>}
        </>
      ) : loading ? <RowSkeleton /> : error ? <div className="ui-card"><LoadError onRetry={() => setReloadKey((k) => k + 1)} /></div> : !res ? <div className="ui-card"><Empty text="输入关键词搜索" /></div> : (
        <>
          {(tab === 'all' || tab === 'users') && has('users') && (
            <div className="ui-card" style={{ padding: '8px 18px' }}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 700, padding: '8px 0' }}>用户</div>
              {res.users.map((u: any) => (
                <div className="user-row" key={u.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <Avatar user={u} size={44} showV />
                  <div className="meta nowrap"><Link to={`/u/${u.username}`} className="nm uname">{u.nickname} <Badges user={u} showLevel={false} /></Link><div className="sub nowrap">@{u.username} · {fmtNum(u.followers)} 粉丝</div></div>
                  {me && me.id !== u.id && <Button size="sm" variant="flat" className="haha-btn-app" onClick={() => nav(`/messages/${u.id}`)}><Icon name="mail" size={14} style={{ width: 14, height: 14 }} /></Button>}
                  <FollowButton user={u} />
                </div>
              ))}
            </div>
          )}
          {(tab === 'all' || tab === 'topics') && has('topics') && (
            <div className="ui-card" style={{ padding: '8px 18px' }}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 700, padding: '8px 0' }}>话题</div>
              {res.topics.map((t: any) => (
                <Link to={`/topic/${encodeURIComponent(t.name)}`} key={t.id} className="row gap-8" style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
                  <Icon name="fire" size={16} style={{ color: 'var(--like)' }} /><span style={{ fontWeight: 700 }}>#{t.name}#</span><span className="faint" style={{ fontSize: 12 }}>{fmtNum(t.post_count || 0)} 动态</span>
                </Link>
              ))}
            </div>
          )}
          {(tab === 'all' || tab === 'threads') && has('threads') && (
            <div className="ui-card" style={{ padding: '8px 18px' }}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 700, padding: '8px 0' }}>帖子</div>
              {res.threads.map((t: any) => (
                <Link to={`/thread/${t.id}`} key={t.id} className="row gap-8" style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
                  <Icon name="forum" size={16} style={{ color: 'var(--brand)' }} /><span className="grow" style={{ fontWeight: 600 }}>{t.title}</span><span className="faint" style={{ fontSize: 12 }}>{fmtNum(t.replyCount)} 回复</span>
                </Link>
              ))}
            </div>
          )}
          {(tab === 'all' || tab === 'posts') && has('posts') && (
            <>{res.posts.map((p: any) => <PostCard key={p.id} post={p} />)}</>
          )}
          {res && (tab === 'all'
            ? (!has('users') && !has('posts') && !has('threads') && !has('topics'))
            : !has(tab)
          ) && (
            <div className="ui-card"><Empty icon="🔍" text={tab === 'all' ? '没有找到相关结果' : `没有找到相关的${TABS.find((t) => t.k === tab)?.l || '内容'}`} /></div>
          )}
        </>
      )}
    </Shell>
  );
}
