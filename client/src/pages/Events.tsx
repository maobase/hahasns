import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Shell from '../components/Shell';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import { Empty, EventListSkeleton, LoadError } from '../components/States';
import { Input, Button } from '../components/heroui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api/client';
import { fmtNum } from '../lib/format';
import type { CommunityEvent, EventListResponse } from '../types';

export const EV_CAT: Record<string, { c: string; icon: string }> = {
  聚会: { c: '#2b54f0', icon: 'users' },
  讲座: { c: '#0891b2', icon: 'book' },
  运动: { c: '#14b269', icon: 'fire' },
  桌游: { c: '#7c3aed', icon: 'grid' },
  线上: { c: '#0e8fb8', icon: 'video' },
  公益: { c: '#e11d6b', icon: 'heart' },
};
export const evColor = (cat: string) => EV_CAT[cat]?.c || 'var(--brand)';
export const evIcon = (cat: string) => EV_CAT[cat]?.icon || 'calendar';

const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function parseDate(s: string): Date { return new Date((s || '').replace(' ', 'T')); }
export function fmtEventTime(s: string): string {
  const d = parseDate(s);
  if (Number.isNaN(d.getTime())) return s;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${WD[d.getDay()]} ${hh}:${mm}`;
}
export function dateBadge(s: string): { m: string; d: string } {
  const d = parseDate(s);
  if (Number.isNaN(d.getTime())) return { m: '', d: '' };
  return { m: `${d.getMonth() + 1}月`, d: String(d.getDate()) };
}

const STATUS_LABEL: Record<string, { t: string; cls: string }> = {
  upcoming: { t: '报名中', cls: 'up' },
  ongoing: { t: '进行中', cls: 'on' },
  ended: { t: '已结束', cls: 'end' },
};

const FILTERS: { key: string; label: string }[] = [
  { key: 'upcoming', label: '即将开始' },
  { key: 'mine', label: '我参加的' },
  { key: 'past', label: '已结束' },
];

const CATS = ['聚会', '讲座', '运动', '桌游', '线上', '公益'];

function SignupBtn({ ev, onToggle }: { ev: CommunityEvent; onToggle: (e: React.MouseEvent) => void }) {
  if (ev.isOrganizer) return <span className="ev-btn organizer">我发起的</span>;
  if (ev.status === 'ended') return <span className="ev-btn ended">已结束</span>;
  if (ev.signed) return <button className="ev-btn signed" onClick={onToggle}>已报名</button>;
  if (ev.full) return <span className="ev-btn full">名额已满</span>;
  return <button className="ev-btn join" onClick={onToggle}>报名{ev.fee > 0 ? ` · ${ev.fee}积分` : ''}</button>;
}

function EventCard({ ev, onToggle }: { ev: CommunityEvent; onToggle: (id: number, signed: boolean) => void }) {
  const badge = dateBadge(ev.startAt);
  const st = STATUS_LABEL[ev.status];
  const [coverErr, setCoverErr] = useState(false); // 封面加载失败优雅降级为分类色占位
  const click = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); onToggle(ev.id, ev.signed); };
  return (
    <Link to={`/event/${ev.id}`} className="ev-card">
      <div className="ev-cover" style={{ '--cc': evColor(ev.category) } as React.CSSProperties}>
        {ev.cover && !coverErr ? <img src={ev.cover} alt="" loading="lazy" onError={() => setCoverErr(true)} /> : <Icon name={evIcon(ev.category)} size={30} />}
        <div className="ev-date"><span className="ev-date-d">{badge.d}</span><span className="ev-date-m">{badge.m}</span></div>
      </div>
      <div className="ev-body">
        <div className="ev-tags">
          <span className="ev-chip" style={{ '--cc': evColor(ev.category) } as React.CSSProperties}><Icon name={evIcon(ev.category)} size={11} /> {ev.category}</span>
          <span className={`ev-status ${st.cls}`}>{st.t}</span>
        </div>
        <h3 className="ev-title">{ev.title}</h3>
        <div className="ev-info"><Icon name="clock" size={13} /> {fmtEventTime(ev.startAt)}</div>
        <div className="ev-info"><Icon name={ev.online ? 'video' : 'location'} size={13} /> {ev.location || (ev.online ? '线上活动' : '待定')}</div>
        <div className="ev-foot">
          <span className="ev-count"><Icon name="users" size={13} /> {fmtNum(ev.signupCount)} 人已报名{ev.capacity > 0 ? ` · 剩 ${Math.max(0, ev.capacity - ev.signupCount)} 位` : ''}</span>
          <SignupBtn ev={ev} onToggle={click} />
        </div>
      </div>
    </Link>
  );
}

export default function Events() {
  const { user, setAuthOpen } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('upcoming');
  const [cat, setCat] = useState<string | null>(null);
  const [data, setData] = useState<EventListResponse | null>(null);
  const [error, setError] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setData(null);
    setError(false);
    const params: Record<string, string> = { filter };
    if (cat) params.category = cat;
    api.get<EventListResponse>('/events', { params }).then(({ data }) => setData(data)).catch(() => { setData({ events: [], categories: CATS, counts: { upcoming: 0 } }); setError(true); });
  }, [filter, cat]);
  useEffect(() => { load(); }, [load]);

  const toggleSignup = async (id: number, signed: boolean) => {
    if (!user) return setAuthOpen(true);
    try {
      const { data } = await api.post<{ event: CommunityEvent }>(`/events/${id}/${signed ? 'cancel' : 'signup'}`);
      toast.ok(signed ? '已取消报名' : '报名成功，记得准时参加！');
      setData((d) => d ? { ...d, events: d.events.map((e) => (e.id === id ? data.event : e)) } : d);
    } catch (err) { toast.err((err as Error).message); }
  };

  const right = (
    <div className="ui-card widget">
      <div className="widget-head"><div className="widget-title"><Icon name="calendar" size={16} className="tk" /> 关于活动</div></div>
      <ul className="ev-tips">
        <li>线上 / 线下活动都可发起，支持名额上限与积分报名。</li>
        <li>报名需消耗的积分会在取消时自动退还。</li>
        <li>报名成功后，发起人会收到通知。</li>
      </ul>
      <Button color="primary" fullWidth className="haha-btn-app" style={{ marginTop: 12 }} onClick={() => (user ? setCreating(true) : setAuthOpen(true))}>
        <Icon name="plus" size={15} style={{ width: 15, height: 15 }} /> 发起活动
      </Button>
    </div>
  );

  return (
    <Shell right={right}>
      <div className="ui-card art-head">
        <div>
          <h1 className="text-xl font-extrabold flex items-center gap-2"><Icon name="calendar" size={20} /> 社区活动</h1>
          <p className="art-head-sub">线上线下一起玩，报名参加感兴趣的活动。</p>
        </div>
        <Button color="primary" className="haha-btn-app" onClick={() => (user ? setCreating(true) : setAuthOpen(true))}><Icon name="plus" size={16} style={{ width: 16, height: 16 }} /> 发起活动</Button>
      </div>

      <div className="art-filterbar">
        <div className="art-cats">
          {FILTERS.map((f) => <button key={f.key} className={`art-tab${filter === f.key ? ' on' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>)}
        </div>
        <div className="ev-cats">
          <button className={`ev-cat-pill${!cat ? ' on' : ''}`} onClick={() => setCat(null)}>全部</button>
          {CATS.map((c) => (
            <button key={c} className={`ev-cat-pill${cat === c ? ' on' : ''}`} onClick={() => setCat(c)} style={{ '--cc': evColor(c) } as React.CSSProperties}>
              <Icon name={evIcon(c)} size={13} /> {c}
            </button>
          ))}
        </div>
      </div>

      {!data ? <EventListSkeleton /> : error ? (
        <div className="ui-card"><LoadError onRetry={load} /></div>
      ) : data.events.length === 0 ? (
        <div className="ui-card"><Empty icon="📅" text={filter === 'mine' ? '你还没有参加任何活动' : '这里还没有活动'}>
          {user && <Button size="sm" color="primary" className="haha-btn-app" style={{ marginTop: 10 }} onClick={() => setCreating(true)}><Icon name="plus" size={14} style={{ width: 14, height: 14 }} /> 发起一个</Button>}
        </Empty></div>
      ) : (
        <div className="ev-list">
          {data.events.map((ev) => <EventCard key={ev.id} ev={ev} onToggle={toggleSignup} />)}
        </div>
      )}

      <CreateEvent open={creating} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); navigate(`/event/${id}`); }} />
    </Shell>
  );
}

function CreateEvent({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const toast = useToast();
  const [f, setF] = useState({ title: '', category: '聚会', cover: '', location: '', online: false, startAt: '', endAt: '', capacity: '', fee: '', description: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));
  const canSubmit = f.title.trim().length >= 2 && !!f.startAt;

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post<{ event: { id: number } }>('/events', {
        ...f, capacity: Number(f.capacity) || 0, fee: Number(f.fee) || 0,
      });
      toast.ok('活动已发起');
      onCreated(data.event.id);
      setF({ title: '', category: '聚会', cover: '', location: '', online: false, startAt: '', endAt: '', capacity: '', fee: '', description: '' });
    } catch (err) { toast.err((err as Error).message); setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} large>
      <div className="modal-head"><div className="modal-title">发起活动</div></div>
      <div className="modal-body ev-form">
        <Input className="haha-inp" placeholder="活动标题" value={f.title} maxLength={50} onChange={(e: any) => set('title', e.target.value)} />
        <div className="ev-form-cats">
          {CATS.map((c) => (
            <button key={c} type="button" className={`ev-cat-pill${f.category === c ? ' on' : ''}`} onClick={() => set('category', c)} style={{ '--cc': evColor(c) } as React.CSSProperties}>
              <Icon name={evIcon(c)} size={13} /> {c}
            </button>
          ))}
        </div>
        <div className="ev-form-row">
          <label className="ev-field"><span>开始时间</span><Input className="haha-inp" type="datetime-local" value={f.startAt} onChange={(e: any) => set('startAt', e.target.value)} /></label>
          <label className="ev-field"><span>结束时间（选填）</span><Input className="haha-inp" type="datetime-local" value={f.endAt} onChange={(e: any) => set('endAt', e.target.value)} /></label>
        </div>
        <label className="ev-checkbox"><input type="checkbox" checked={f.online} onChange={(e) => set('online', e.target.checked)} /> 线上活动</label>
        <Input className="haha-inp" placeholder={f.online ? '会议链接 / 平台' : '活动地点'} value={f.location} onChange={(e: any) => set('location', e.target.value)} />
        <div className="ev-form-row">
          <label className="ev-field"><span>名额上限（0 不限）</span><Input className="haha-inp" type="number" min={0} value={f.capacity} onChange={(e: any) => set('capacity', e.target.value)} /></label>
          <label className="ev-field"><span>报名积分（0 免费）</span><Input className="haha-inp" type="number" min={0} value={f.fee} onChange={(e: any) => set('fee', e.target.value)} /></label>
        </div>
        <Input className="haha-inp" placeholder="封面图链接（选填）" value={f.cover} onChange={(e: any) => set('cover', e.target.value)} />
        <textarea className="art-ed-body" style={{ minHeight: 120 }} placeholder="活动介绍：流程、注意事项、报名要求…" value={f.description} onChange={(e) => set('description', e.target.value)} />
        <div className="row gap-8" style={{ justifyContent: 'flex-end', marginTop: 6 }}>
          <Button variant="flat" className="haha-btn-app" onClick={onClose}>取消</Button>
          <Button color="primary" className="haha-btn-app" onClick={submit} isDisabled={!canSubmit || busy}><Icon name="send" size={15} style={{ width: 15, height: 15 }} /> {busy ? '发布中…' : '发起'}</Button>
        </div>
      </div>
    </Modal>
  );
}
