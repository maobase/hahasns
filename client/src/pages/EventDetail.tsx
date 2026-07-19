import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Shell from '../components/Shell';
import Icon from '../components/Icon';
import Avatar from '../components/Avatar';
import RichBody from '../components/RichBody';
import { DetailSkeleton, LoadError } from '../components/States';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api/client';
import { confirmDialog } from '../components/confirm';
import { fmtNum } from '../lib/format';
import { usePageTitle } from '../hooks/usePageTitle';
import type { CommunityEvent, EventDetailResponse, PublicUser } from '../types';
import { EV_CAT, evColor, evIcon, fmtEventTime } from './Events';

const STATUS: Record<string, { t: string; cls: string }> = {
  upcoming: { t: '报名中', cls: 'up' }, ongoing: { t: '进行中', cls: 'on' }, ended: { t: '已结束', cls: 'end' },
};

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, setAuthOpen } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [ev, setEv] = useState<CommunityEvent | null>(null);
  const [attendees, setAttendees] = useState<PublicUser[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [coverErr, setCoverErr] = useState(false); // 封面外链加载失败时优雅降级为分类色占位
  usePageTitle(ev?.title); // 标签页显示活动真实标题（覆盖通用「活动详情」）

  const load = useCallback(() => {
    setEv(null); setNotFound(false); setError(false);
    api.get<EventDetailResponse>(`/events/${id}`)
      .then(({ data }) => { setEv(data.event); setAttendees(data.attendees); })
      .catch((e: any) => { if (e?.status === 404) setNotFound(true); else setError(true); });
  }, [id]);
  useEffect(() => { load(); window.scrollTo(0, 0); }, [load]);

  const toggle = async () => {
    if (!user) return setAuthOpen(true);
    if (!ev || busy) return;
    if (ev.signed && !(await confirmDialog(ev.fee > 0 ? '取消后已支付的积分将退还' : '确定取消本次报名', { title: '取消报名？', confirmText: '取消报名', danger: false }))) return;
    setBusy(true);
    try {
      const { data } = await api.post<{ event: CommunityEvent }>(`/events/${ev.id}/${ev.signed ? 'cancel' : 'signup'}`);
      toast.ok(ev.signed ? '已取消报名' : '报名成功，记得准时参加！');
      setEv(data.event); load();
    } catch (err) { toast.err((err as Error).message); } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!ev || !(await confirmDialog('删除后不可恢复', { title: '删除这个活动？', confirmText: '删除' }))) return;
    try { await api.delete(`/events/${ev.id}`); toast.ok('活动已删除'); navigate('/events'); }
    catch (err) { toast.err((err as Error).message); }
  };

  if (error) return <Shell right={false}><div className="ui-card"><LoadError onRetry={load} /></div></Shell>;
  if (notFound) return <Shell right={false}><div className="ui-card" style={{ padding: 40, textAlign: 'center' }}>活动不存在或已取消。<br /><Link to="/events" className="haha-btn-app haha-btn-app--primary haha-btn-app--sm" style={{ marginTop: 12 }}>返回活动</Link></div></Shell>;
  if (!ev) return <Shell right={false}><DetailSkeleton media={false} /></Shell>;

  const st = STATUS[ev.status];

  const cta = (() => {
    if (ev.isOrganizer) return <button className="ev-cta organizer" disabled><Icon name="user" size={17} /> 我是发起人</button>;
    if (ev.status === 'ended') return <button className="ev-cta ended" disabled>活动已结束</button>;
    if (ev.signed) return <button className="ev-cta cancel" onClick={toggle} disabled={busy}><Icon name="check" size={17} /> 已报名 · 点击取消</button>;
    if (ev.full) return <button className="ev-cta full" disabled>名额已满</button>;
    return <button className="ev-cta join" onClick={toggle} disabled={busy}><Icon name="ticket" size={17} /> 立即报名{ev.fee > 0 ? ` · ${ev.fee} 积分` : ' · 免费'}</button>;
  })();

  const right = (
    <div className="ui-card widget">
      <div className="widget-head"><div className="widget-title"><Icon name="users" size={16} className="tk" /> 报名的人 {ev.signupCount > 0 && <span className="faint">· {ev.signupCount}</span>}</div></div>
      {attendees.length === 0 ? <div className="faint" style={{ padding: '6px 2px', fontSize: 12.5 }}>还没有人报名，来当第一个～</div> : (
        <div className="ev-attendees">
          {attendees.map((a) => (
            <Link to={`/u/${a.username}`} key={a.id} className="ev-attendee" title={a.nickname}><Avatar user={a} size={38} /></Link>
          ))}
          {ev.signupCount > attendees.length && <span className="ev-more">+{ev.signupCount - attendees.length}</span>}
        </div>
      )}
    </div>
  );

  return (
    <Shell right={right}>
      <Link to="/events" className="art-back"><Icon name="back" size={16} /> 社区活动</Link>

      <div className="ui-card ev-detail">
        <div className="ev-hero" style={{ '--cc': evColor(ev.category) } as React.CSSProperties}>
          {ev.cover && !coverErr ? <img src={ev.cover} alt="" onError={() => setCoverErr(true)} /> : <Icon name={evIcon(ev.category)} size={52} />}
        </div>
        <div className="ev-detail-body">
          <div className="ev-tags">
            <span className="ev-chip" style={{ '--cc': evColor(ev.category) } as React.CSSProperties}><Icon name={EV_CAT[ev.category]?.icon || 'calendar'} size={11} /> {ev.category}</span>
            <span className={`ev-status ${st.cls}`}>{st.t}</span>
          </div>
          <h1 className="ev-detail-title">{ev.title}</h1>

          <div className="ev-meta-grid">
            <div className="ev-meta-row"><span className="ev-meta-ico"><Icon name="clock" size={16} /></span><div><div className="ev-meta-k">时间</div><div className="ev-meta-v">{fmtEventTime(ev.startAt)}{ev.endAt ? ` — ${fmtEventTime(ev.endAt).split(' ').pop()}` : ''}</div></div></div>
            <div className="ev-meta-row"><span className="ev-meta-ico"><Icon name={ev.online ? 'video' : 'location'} size={16} /></span><div><div className="ev-meta-k">{ev.online ? '线上' : '地点'}</div><div className="ev-meta-v">{ev.location || (ev.online ? '线上活动' : '待定')}</div></div></div>
            <div className="ev-meta-row"><span className="ev-meta-ico"><Icon name="users" size={16} /></span><div><div className="ev-meta-k">报名</div><div className="ev-meta-v">{fmtNum(ev.signupCount)} 人{ev.capacity > 0 ? ` / ${ev.capacity} 名额` : ' · 不限名额'}</div></div></div>
            <div className="ev-meta-row"><span className="ev-meta-ico"><Icon name="ticket" size={16} /></span><div><div className="ev-meta-k">费用</div><div className="ev-meta-v">{ev.fee > 0 ? `${ev.fee} 积分` : '免费'}</div></div></div>
          </div>

          <Link to={`/u/${ev.organizer.username}`} className="ev-organizer">
            <Avatar user={ev.organizer} size={40} showV />
            <div><div className="ev-org-name">{ev.organizer.nickname}</div><div className="ev-org-sub">活动发起人</div></div>
          </Link>

          {ev.description && <div className="ev-desc"><RichBody text={ev.description} /></div>}

          <div className="ev-actions">
            {cta}
            {(user?.id === ev.organizer.id || user?.role === 'admin') && <button className="ev-del" onClick={remove} title="删除活动" aria-label="删除活动"><Icon name="trash" size={17} /></button>}
          </div>
        </div>
      </div>
    </Shell>
  );
}
