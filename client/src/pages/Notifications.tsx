import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Shell from '../components/Shell';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { Loading, Empty, RowSkeleton, LoadError } from '../components/States';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { timeAgo } from '../lib/format';

const ICONS: Record<string, string> = { like: 'heart', follow: 'user', comment: 'comment', reply: 'comment', mention: 'at', reward: 'gift', share: 'share', answer: 'help', accept: 'check', redpacket: 'redpacket', event: 'ticket', topic: 'fire', thread: 'forum', system: 'bell' };
const NCOLOR: Record<string, string> = { like: 'var(--like)', follow: 'var(--brand)', comment: 'var(--good)', reply: 'var(--good)', mention: 'var(--ink-2)', reward: 'var(--gold-deep)', share: 'var(--ink-2)', answer: 'var(--brand)', accept: 'var(--good)', redpacket: 'var(--gold-deep)', event: 'var(--brand)', topic: 'var(--brand)', thread: 'var(--good)', system: 'var(--ink-2)' };
const VERB: Record<string, string> = {
  like: '赞了你', follow: '关注了你', comment: '评论了你的动态', reply: '回复了你',
  mention: '提到了你', reward: '打赏了你', share: '转发了你的动态',
  answer: '回答了你的提问', accept: '采纳了你的回答',
  redpacket: '抢了你的红包', event: '报名了你的活动', topic: '在你关注的话题发了新动态',
  thread: '回复了你订阅的帖子', system: '',
};
// aggregated verbs (N 人 …) read better with the target spelled out
const VERB_AGG: Record<string, string> = {
  like: '赞了你的动态', follow: '关注了你', comment: '评论了你的动态', reply: '回复了你',
  mention: '提到了你', reward: '打赏了你', share: '转发了你的动态',
  answer: '回答了你的提问', accept: '采纳了你的回答', redpacket: '抢了你的红包', event: '报名了你的活动',
  topic: '在你关注的话题发了新动态', thread: '回复了你订阅的帖子',
};

function linkFor(n: any) {
  if (n.targetType === 'post') return `/post/${n.targetId}`;
  if (n.targetType === 'thread') return `/thread/${n.targetId}`;
  if (n.targetType === 'question') return `/qa/${n.targetId}`;
  if (n.targetType === 'article') return `/article/${n.targetId}`;
  if (n.targetType === 'event') return `/event/${n.targetId}`;
  if (n.targetType === 'user' && n.actor) return `/u/${n.actor.username}`;
  return null;
}

// Roll up notifications sharing (type + target) into one card: "张三、李四 等 5 人 赞了你的动态".
// System notices are never merged. Input is time-desc; the group keeps the latest time + actor order.
function aggregate(items: any[]) {
  const out: any[] = [];
  const idx = new Map<string, number>();
  for (const n of items) {
    const key = n.type !== 'system' ? `${n.type}:${n.targetType}:${n.targetId}` : null;
    if (key && idx.has(key)) {
      const g = out[idx.get(key)!];
      if (n.actor && !g.actorIds.has(n.actor.id)) { g.actors.push(n.actor); g.actorIds.add(n.actor.id); }
      g.ids.push(n.id);
      if (!n.read) g.read = false;
    } else {
      const g = { ...n, actors: n.actor ? [n.actor] : [], actorIds: new Set(n.actor ? [n.actor.id] : []), ids: [n.id], read: n.read };
      out.push(g);
      if (key) idx.set(key, out.length - 1);
    }
  }
  return out;
}

export default function Notifications() {
  const { user, loading: authLoading, setAuthOpen } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [msgUnread, setMsgUnread] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setAuthOpen(true); setLoading(false); return; }
    load();
    api.get('/messages/unread').then(({ data }) => setMsgUnread(data.unread)).catch(() => {});
  }, [authLoading, user]);
  const [error, setError] = useState(false);
  const load = () => { setLoading(true); setError(false); return api.get('/notifications').then(({ data }) => setItems(data.notifications)).catch(() => setError(true)).finally(() => setLoading(false)); };
  const markAll = async () => { await api.post('/notifications/read'); setItems((xs) => xs.map((x) => ({ ...x, read: true }))); };

  // open a (possibly aggregated) group: mark all its unread notifications read, then jump to the target
  const open = (g: any) => {
    const unreadIds = g.ids.filter((id: number) => items.some((x) => x.id === id && !x.read));
    if (unreadIds.length) {
      Promise.all(unreadIds.map((id: number) => api.post(`/notifications/${id}/read`).catch(() => {})));
      setItems((xs) => xs.map((x) => g.ids.includes(x.id) ? { ...x, read: true } : x));
    }
    const to = linkFor(g);
    if (to) nav(to);
  };

  if (authLoading) return <Shell right={false}><Loading /></Shell>;
  if (!user) return <Shell right={false}><div className="ui-card"><Empty icon="🔒" text="登录后查看通知" /></div></Shell>;

  const FILTERS: { k: string; l: string; types?: string[] }[] = [
    { k: 'all', l: '全部' },
    { k: 'interact', l: '互动', types: ['like', 'comment', 'reply', 'mention', 'share', 'answer', 'accept'] },
    { k: 'follow', l: '关注', types: ['follow'] },
    { k: 'reward', l: '打赏', types: ['reward'] },
    { k: 'system', l: '系统', types: ['system'] },
  ];
  const active = FILTERS.find((f) => f.k === tab)!;
  const filtered = tab === 'all' ? items : items.filter((n) => active.types!.includes(n.type));
  const shown = aggregate(filtered);

  return (
    <Shell right={false}>
      <div className="ui-card section-head">
        <h2 className="row gap-8"><Icon name="bell" size={19} style={{ color: 'var(--brand)' }} /> 通知</h2>
        <button className="btn btn-ghost btn-sm" onClick={markAll}>全部已读</button>
      </div>

      {/* 统一入口：未读私信聚合到通知中心顶部，一处直达 */}
      {msgUnread > 0 && (
        <Link to="/messages" className="ui-card notif-dm-entry">
          <span className="notif-dm-ico"><Icon name="mail" size={18} /></span>
          <div className="notif-dm-main">
            <div className="notif-dm-title">私信</div>
            <div className="notif-dm-sub">你有 {msgUnread} 条未读私信</div>
          </div>
          <span className="notif-dm-badge">{msgUnread > 99 ? '99+' : msgUnread}</span>
          <Icon name="chevron" size={18} className="notif-dm-go" />
        </Link>
      )}

      <div className="ui-card feed-tabs">
        {FILTERS.map((f) => {
          const n = f.k === 'all' ? items.filter((x) => !x.read).length : items.filter((x) => f.types!.includes(x.type) && !x.read).length;
          return (
            <button key={f.k} className={`feed-tab${tab === f.k ? ' active' : ''}`} onClick={() => setTab(f.k)}>
              {f.l}{n > 0 && <span className="tab-badge">{n}</span>}
            </button>
          );
        })}
      </div>
      {loading ? <RowSkeleton rows={6} /> : error ? (
        <div className="ui-card"><LoadError onRetry={load} /></div>
      ) : (
        <div className="ui-card" style={{ overflow: 'hidden' }}>
          {shown.length === 0 ? <Empty icon="🔔" text="这里还没有通知" /> :
          shown.map((g, i) => {
            const to = linkFor(g);
            const many = g.actors.length > 1;
            const body = (
              <div className={`notif-row${g.read ? '' : ' unread'}`} onClick={() => open(g)} style={{ cursor: to ? 'pointer' : 'default' }}
                role={to ? 'button' : undefined} tabIndex={to ? 0 : undefined}
                onKeyDown={to ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(g); } } : undefined}>
                {g.actors.length ? (
                  many ? (
                    <div className="notif-avstack">
                      {g.actors.slice(0, 3).map((a: any, j: number) => <Avatar key={j} user={a} size={34} noLink />)}
                    </div>
                  ) : <Avatar user={g.actors[0]} size={42} showV noLink />
                ) : <span className={`notif-ico ${g.type}`}><Icon name={ICONS[g.type]} size={18} style={{ color: NCOLOR[g.type] }} /></span>}
                <div className="notif-main">
                  <div className="notif-text">
                    {g.actors.length > 0 && (
                      many
                        ? <b>{g.actors[0].nickname} 等 {g.actors.length} 人 </b>
                        : <b>{g.actors[0].nickname} </b>
                    )}
                    {g.type === 'system' ? g.preview : <span className="muted">{many ? (VERB_AGG[g.type] || VERB[g.type]) : VERB[g.type]}</span>}
                  </div>
                  {g.type !== 'system' && g.preview && <div className="notif-preview nowrap">“{g.preview}”</div>}
                  <div className="notif-time">{timeAgo(g.createdAt)}</div>
                </div>
                <span className={`notif-ico ${g.type}`} style={{ width: 30, height: 30 }}><Icon name={ICONS[g.type]} size={15} style={{ color: NCOLOR[g.type] }} /></span>
              </div>
            );
            return <div key={g.id}>{i > 0 && <div className="divider" />}{body}</div>;
          })}
        </div>
      )}
    </Shell>
  );
}
