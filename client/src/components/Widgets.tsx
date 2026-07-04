import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { APP_VERSION } from '../version';
import Avatar from './Avatar';
import Icon from './Icon';
import FollowButton from './FollowButton';
import { Badges } from './Identity';
import { useAuth } from '../context/AuthContext';
import { useSite } from '../context/SiteContext';
import api from '../api/client';
import { fmtNum } from '../lib/format';

export function HotTopics() {
  const [topics, setTopics] = useState<any[]>([]);
  useEffect(() => { api.get('/topics').then(({ data }) => setTopics(data.topics)).catch(() => {}); }, []);
  if (!topics.length) return null;
  return (
    <div className="ui-card widget">
      <div className="widget-head">
        <div className="widget-title"><Icon name="fire" size={17} className="tk" /> 热门话题</div>
        <Link to="/discover" className="widget-more">更多</Link>
      </div>
      {topics.slice(0, 8).map((t, i) => (
        <Link to={`/topic/${encodeURIComponent(t.name)}`} className="topic-row" key={t.id}>
          <span className={`topic-rank${i < 3 ? ' hot' : ''}`}>{i + 1}</span>
          <div className="grow">
            <div className="tn">{t.name}</div>
            <div className="tc">{fmtNum(t.postCount || t.post_count || 0)} 条动态 · {fmtNum(t.hot)} 热度</div>
          </div>
          {i < 3 && <Icon name="fire" size={14} style={{ color: 'var(--like)' }} />}
        </Link>
      ))}
    </div>
  );
}

export function CheckinRank() {
  const [users, setUsers] = useState<any[]>([]);
  useEffect(() => { api.get('/users/ranking/checkin').then(({ data }) => setUsers(data.users)).catch(() => {}); }, []);
  if (!users.length) return null;
  const medal = ['🥇', '🥈', '🥉'];
  return (
    <div className="ui-card widget">
      <div className="widget-head">
        <div className="widget-title"><Icon name="checkin" size={16} className="tk" /> 签到排行榜</div>
      </div>
      {users.slice(0, 6).map((u, i) => (
        <div className="rank-row" key={u.id}>
          <span className="rank-no">{medal[i] || i + 1}</span>
          <Avatar user={u} size={32} showV />
          <div className="grow nowrap">
            <Link to={`/u/${u.username}`} className="uname" style={{ fontSize: 14 }}>{u.nickname}</Link>
          </div>
          <span className="rank-streak">连签 <b>{u.checkinStreak}</b> 天</span>
        </div>
      ))}
    </div>
  );
}

export function WhoToFollow() {
  const { user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  useEffect(() => { api.get('/users/suggestions').then(({ data }) => setUsers(data.users)).catch(() => {}); }, [user?.id]);
  if (!users.length) return null;
  return (
    <div className="ui-card widget">
      <div className="widget-head"><div className="widget-title"><Icon name="user" size={16} className="tk" /> 推荐关注</div></div>
      {users.slice(0, 4).map((u) => (
        <div className="user-row" key={u.id}>
          <Avatar user={u} size={40} showV />
          <div className="meta nowrap">
            <Link to={`/u/${u.username}`} className="nm uname" style={{ display: 'inline-flex' }}>{u.nickname} <Badges user={u} showLevel={false} /></Link>
            <div className="sub nowrap">{!u.bio || u.bio.startsWith('emoji:') ? `${fmtNum(u.followers)} 粉丝` : u.bio}</div>
          </div>
          <FollowButton user={u} />
        </div>
      ))}
    </div>
  );
}

export function TrendingSearch() {
  const [keywords, setKeywords] = useState<any[]>([]);
  useEffect(() => { api.get('/search/trending').then(({ data }) => setKeywords(data.keywords)).catch(() => {}); }, []);
  if (!keywords.length) return null;
  return (
    <div className="ui-card widget">
      <div className="widget-head"><div className="widget-title"><Icon name="search" size={15} className="tk" /> 热搜榜</div></div>
      <div className="kw-list">
        {keywords.map((k) => <Link to={`/search?q=${encodeURIComponent(k)}`} className="kw" key={k}>{k}</Link>)}
      </div>
    </div>
  );
}

export function FlashWidget() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api.get('/flash', { params: { limit: 5 } }).then(({ data }) => setItems(data.flash)).catch(() => {}); }, []);
  if (!items.length) return null;
  return (
    <div className="ui-card widget">
      <div className="widget-head">
        <div className="widget-title"><Icon name="bell" size={16} className="tk" /> 社区快报</div>
        <Link to="/flash" className="widget-more">更多</Link>
      </div>
      {items.map((f) => (
        <Link to="/flash" className="flash-widget-item" key={f.id}>
          <span className="fw-dot" />
          <span className="fw-title">{f.title}</span>
        </Link>
      ))}
    </div>
  );
}

export function CircleWidget() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api.get('/circles/suggestions').then(({ data }) => setItems(data.circles)).catch(() => {}); }, []);
  if (!items.length) return null;
  return (
    <div className="ui-card widget">
      <div className="widget-head">
        <div className="widget-title"><Icon name="users" size={16} className="tk" /> 推荐圈子</div>
        <Link to="/circles" className="widget-more">更多</Link>
      </div>
      {items.map((c) => (
        <Link to={`/circle/${encodeURIComponent(c.slug)}`} className="circle-row" key={c.id}>
          <span className="circle-ico circle-ico-sm" style={{ '--cc': c.color || '#2b54f0' } as CSSProperties}>
            <Icon name={c.icon || 'circle'} size={16} />
          </span>
          <div className="grow nowrap">
            <div className="cr-name">{c.name}</div>
            <div className="cr-sub">{fmtNum(c.memberCount)} 成员 · {fmtNum(c.postCount)} 动态</div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function QAWidget() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api.get('/qa/spotlight').then(({ data }) => setItems(data.questions)).catch(() => {}); }, []);
  if (!items.length) return null;
  return (
    <div className="ui-card widget">
      <div className="widget-head">
        <div className="widget-title"><Icon name="help" size={16} className="tk" /> 悬赏求助</div>
        <Link to="/qa" className="widget-more">更多</Link>
      </div>
      {items.map((q) => (
        <Link to={`/qa/${q.id}`} className="qa-widget-row" key={q.id}>
          <span className="qa-widget-title">{q.title}</span>
          <span className="qa-widget-meta">
            {q.bounty > 0 && <span className="qa-widget-bounty"><Icon name="coin" size={12} /> {q.bounty}</span>}
            <span>{fmtNum(q.answerCount)} 回答</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

export function Footer() {
  const site = useSite();
  return (
    <div style={{ padding: '8px 14px', fontSize: 12, color: 'var(--ink-4)', lineHeight: 1.8 }}>
      <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
        <Link to="/changelog" style={{ color: 'var(--ink-3)' }}>更新日志</Link><span>·</span>
        <Link to="/changelog" style={{ color: 'var(--ink-3)' }}>开发计划</Link><span>·</span>
        <Link to="/changelog" style={{ color: 'var(--ink-3)' }}>问题反馈</Link><span>·</span>
        <Link to="/about" style={{ color: 'var(--ink-3)' }}>关于</Link><span>·</span><span>隐私</span>
      </div>
      <div style={{ marginTop: 6 }}>{site.footerText || '© 2026 HahaSNS · 轻社交 · 轻论坛 · 轻社区'} · <Link to="/changelog" className="num" style={{ color: 'var(--ink-3)' }}>{APP_VERSION}</Link></div>
      {site.icpBeian && <div style={{ marginTop: 4 }}><a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer noopener" style={{ color: 'var(--ink-4)' }}>{site.icpBeian}</a></div>}
    </div>
  );
}
