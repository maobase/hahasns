import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import { Spinner } from './heroui';
import Avatar from './Avatar';
import Modal from './Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api/client';
import { fmtNum } from '../lib/format';
import type { PublicUser } from '../types';

interface Reactor { user: PublicUser; reaction: string; }

export interface ReactionDef { key: string; label: string; icon: string; color: string; }

// Restrained SVG reaction set (no emoji) — LinkedIn-style, on-brand
export const REACTIONS: ReactionDef[] = [
  { key: 'like', label: '赞', icon: 'thumbsup', color: '#2b6fff' },
  { key: 'love', label: '爱了', icon: 'heart', color: '#e0245e' },
  { key: 'haha', label: '哈哈', icon: 'smile', color: '#e6a019' },
  { key: 'wow', label: '哇', icon: 'spark', color: '#8b5cf6' },
  { key: 'support', label: '加油', icon: 'fire', color: '#f5703a' },
];
const byKey = (k: string | null | undefined) => REACTIONS.find((r) => r.key === k);

export default function Reactions({ id, target = 'post', initialReaction, initialCount, initialReactions, simple = false }: { id: number; target?: 'post' | 'comment'; initialReaction: string | null; initialCount: number; initialReactions?: Record<string, number> | null; simple?: boolean }) {
  const base = `/${target}s/${id}`;
  const { user, setAuthOpen } = useAuth();
  const toast = useToast();
  const [mine, setMine] = useState<string | null>(initialReaction);
  const [count, setCount] = useState<number>(initialCount);
  const [counts, setCounts] = useState<Record<string, number> | null>(initialReactions ?? null);
  const [open, setOpen] = useState(false);
  const hoverT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pressT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const longPressed = useRef(false);
  const busy = useRef(false); // in-flight 标记：忽略请求未完成前的重复点击（防连点竞态）
  const [whoOpen, setWhoOpen] = useState(false);
  const [reactors, setReactors] = useState<Reactor[] | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const cur = byKey(mine);

  // open the "who reacted" list (clicking the reaction stack)
  const openWho = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setWhoOpen(true); setReactors(null); setFilter('all');
    try {
      const { data } = await api.get<{ reactors: Reactor[] }>(`${base}/reactions`);
      setReactors(data.reactors);
    } catch { setReactors([]); }
  };

  const react = async (key: string) => {
    if (!user) return setAuthOpen(true);
    setOpen(false);
    if (busy.current) return; // in-flight：忽略请求未完成前的重复点击（防连点竞态）
    busy.current = true;
    const prevMine = mine, prevCount = count;
    // optimistic
    if (mine === key) { setMine(null); setCount((c) => Math.max(0, c - 1)); }
    else if (mine) { setMine(key); }
    else { setMine(key); setCount((c) => c + 1); }
    try {
      const { data } = await api.post<{ myReaction: string | null; likeCount: number; reactions?: Record<string, number> | null }>(`${base}/react`, { reaction: key });
      setMine(data.myReaction); setCount(data.likeCount); if (data.reactions !== undefined) setCounts(data.reactions);
    } catch (e) { setMine(prevMine); setCount(prevCount); toast.err((e as Error).message); }
    finally { busy.current = false; }
  };

  // reaction types present, by count desc
  const allReactions = counts
    ? (Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k]) => byKey(k)).filter(Boolean) as ReactionDef[])
    : [];
  const topReactions = allReactions.slice(0, 3); // at-a-glance stack
  const topAllReactions = allReactions;          // modal tabs

  const quick = () => {
    if (longPressed.current) { longPressed.current = false; return; } // ignore the click that ends a long-press
    if (!user) return setAuthOpen(true);
    react(mine || 'like');
  };

  // desktop hover-to-open
  const onEnter = () => { clearTimeout(hoverT.current); hoverT.current = setTimeout(() => setOpen(true), 280); };
  const onLeave = () => { clearTimeout(hoverT.current); hoverT.current = setTimeout(() => setOpen(false), 200); };
  // mobile long-press-to-open
  const onTouchStart = () => { longPressed.current = false; pressT.current = setTimeout(() => { longPressed.current = true; setOpen(true); }, 360); };
  const onTouchEnd = () => { clearTimeout(pressT.current); };

  return (
    <div className="react-wrap" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {open && (
        <div className="react-picker" onMouseEnter={() => clearTimeout(hoverT.current)} onMouseLeave={onLeave}>
          {REACTIONS.map((r, i) => (
            <button key={r.key} className={`react-opt${mine === r.key ? ' on' : ''}`} title={r.label}
              style={{ '--rc': r.color, animationDelay: `${i * 28}ms` } as React.CSSProperties}
              onClick={() => react(r.key)}>
              <Icon name={r.icon} size={23} fill />
              <span className="react-opt-label">{r.label}</span>
            </button>
          ))}
        </div>
      )}
      <button className={`${simple ? 'clike' : 'act like'}${mine ? ' on' : ''}`} onClick={quick}
        onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
        style={cur ? { color: cur.color } : undefined}>
        {!simple && count > 0 && topReactions.length ? (
          <span className="react-stack" onClick={openWho} title="查看回应的人">
            {topReactions.map((r) => (
              <span key={r.key} className="react-mini" style={{ '--rc': r.color } as React.CSSProperties}><Icon name={r.icon} size={11} fill /></span>
            ))}
          </span>
        ) : (
          <Icon name={cur ? cur.icon : 'thumbsup'} size={simple ? 13 : 18} fill={!!mine} className="ico" style={simple ? { verticalAlign: '-2px', marginRight: 3 } : undefined} />
        )}
        {simple ? '' : ' '}{count > 0 ? fmtNum(count) : (cur ? cur.label : '赞')}
      </button>

      <Modal open={whoOpen} onClose={() => setWhoOpen(false)}>
        <div className="rx-who">
          <div className="rx-who-head"><Icon name="heart" size={16} /> {fmtNum(count)} 人回应</div>
          <div className="rx-who-tabs">
            <button className={`rx-tab${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>全部 {fmtNum(count)}</button>
            {topAllReactions.map((r) => (
              <button key={r.key} className={`rx-tab${filter === r.key ? ' on' : ''}`} onClick={() => setFilter(r.key)} style={{ '--rc': r.color } as React.CSSProperties}>
                <Icon name={r.icon} size={13} fill /> {counts?.[r.key] ?? 0}
              </button>
            ))}
          </div>
          <div className="rx-who-list">
            {reactors === null ? <div className="rx-who-loading"><Spinner /></div>
              : reactors.filter((x) => filter === 'all' || x.reaction === filter).length === 0
                ? <div className="faint" style={{ padding: 20, textAlign: 'center', fontSize: 13 }}>还没有人回应</div>
                : reactors.filter((x) => filter === 'all' || x.reaction === filter).map((x) => {
                  const rd = byKey(x.reaction);
                  return (
                    <Link to={`/u/${x.user.username}`} key={x.user.id} className="rx-who-row" onClick={() => setWhoOpen(false)}>
                      <Avatar user={x.user} size={38} showV />
                      <span className="rx-who-name">{x.user.nickname}</span>
                      {rd && <span className="rx-who-ico" style={{ '--rc': rd.color } as React.CSSProperties}><Icon name={rd.icon} size={13} fill /></span>}
                    </Link>
                  );
                })}
          </div>
        </div>
      </Modal>
    </div>
  );
}
