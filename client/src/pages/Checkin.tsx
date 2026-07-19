import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell';
import Icon from '../components/Icon';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';
import { Loading } from '../components/States';
import { Button } from '../components/heroui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api/client';
import { fmtNum } from '../lib/format';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export default function Checkin() {
  const { user, setAuthOpen, patchUser } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [signing, setSigning] = useState(false);
  const [makeupDay, setMakeupDay] = useState<number | null>(null); // day-number pending 补签 confirm
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get('/checkin').then(({ data }) => setData(data)).catch(() => setData({ authed: false, rewards: [], topStreakers: [] }));
  }, []);
  useEffect(() => { load(); }, [load]);

  const signIn = async () => {
    if (!user) return setAuthOpen(true);
    if (signing || data.checkedToday) return;
    setSigning(true);
    try {
      const { data: r } = await api.post('/auth/checkin');
      patchUser?.(r.user);
      toast.ok(`签到成功 · 连签 ${r.streak} 天 · +${r.pointsEarned} 积分${r.vipMult > 1 ? `（VIP ×${r.vipMult} 加成）` : ''}`);
      load();
    } catch (err: any) { toast.err(err.message); } finally { setSigning(false); }
  };

  const doMakeup = async () => {
    if (!makeupDay) return;
    const ymd = `${data.todayDate.slice(0, 7)}-${String(makeupDay).padStart(2, '0')}`;
    setBusy(true);
    try {
      const { data: r } = await api.post('/checkin/makeup', { date: ymd });
      patchUser?.(r.user);
      toast.ok(`已补签 ${makeupDay} 日 · -${r.cost} 积分`);
      setMakeupDay(null);
      load();
    } catch (err: any) { toast.err(err.message); } finally { setBusy(false); }
  };

  if (!data) return <Shell right={false}><Loading /></Shell>;

  // VIP 多等级签到积分加成（与后端一致）：VIP1 ×1.2 / VIP2 ×1.5 / VIP3 ×2
  const vipLevel = (user?.vipLevel ?? (user?.vip ? 1 : 0)) as number;
  const vipMult = vipLevel === 3 ? 2 : vipLevel === 2 ? 1.5 : vipLevel === 1 ? 1.2 : 1;

  // ---- build the month grid from the server's "today" ----
  const [y, m, dToday] = (data.todayDate || '2026-01-01').split('-').map(Number);
  const firstWeekday = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const checked = new Map<number, boolean>((data.monthDays || []).map((d: any) => [d.day, d.makeup]));
  const cells: any[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    let state;
    if (checked.has(d)) state = checked.get(d) ? 'makeup' : 'checked';
    else if (d === dToday) state = 'today';
    else if (d < dToday) state = 'missed';
    else state = 'future';
    cells.push({ d, state, isToday: d === dToday });
  }

  const right = (
    <>
      <div className="ui-card widget">
        <div className="widget-head"><div className="widget-title"><Icon name="fire" size={16} className="tk" /> 签到榜</div></div>
        {(!data.topStreakers || data.topStreakers.length === 0)
          ? <div className="faint" style={{ padding: '6px 2px', fontSize: 12.5 }}>还没有人开始连续签到</div>
          : data.topStreakers.map((s: any, i: number) => (
            <Link to={`/u/${s.user.username}`} className="ckin-rank" key={s.user.id}>
              <span className={`ckin-rank-no${i < 3 ? ' top' : ''}`}>{i + 1}</span>
              <Avatar user={s.user} size={28} />
              <span className="ckin-rank-name">{s.user.nickname}</span>
              <span className="ckin-rank-streak"><Icon name="fire" size={12} /> {s.streak}</span>
            </Link>
          ))}
      </div>
      <div className="ui-card widget ckin-rules">
        <div className="widget-head"><div className="widget-title"><Icon name="calendar" size={16} className="tk" /> 签到规则</div></div>
        <ul className="ckin-rule-list">
          <li>每日签到得 5 积分，连签越久奖励越多，第 7 天起每天 +12。</li>
          <li>断签后连续天数从头计算，记得每天回来打卡。</li>
          <li>漏签可花 {data.makeupCost} 积分补签当月任意一天（不计入连签）。</li>
          {vipLevel > 0
            ? <li>你是 VIP{vipLevel} 会员，签到积分 <b style={{ color: 'var(--brand)' }}>×{vipMult}</b> 已自动加成 🎉</li>
            : <li><Link to="/member" style={{ color: 'var(--brand)', fontWeight: 600 }}>开通 VIP 会员</Link>，签到积分最高翻倍。</li>}
        </ul>
      </div>
    </>
  );

  return (
    <Shell right={right}>
      {/* streak hero */}
      <div className="ui-card ckin-hero">
        <div className="ckin-hero-l">
          <div className={`ckin-flame${data.checkedToday ? ' lit' : ''}`}><Icon name="fire" size={26} /></div>
          <div>
            <div className="ckin-streak-row">
              <span className="ckin-streak-num">{data.streak || 0}</span>
              <span className="ckin-streak-unit">天</span>
            </div>
            <div className="ckin-streak-sub">{data.checkedToday ? '今天已打卡，继续保持！' : '连续签到 · 今天还没打卡哦'}</div>
          </div>
        </div>
        <div className="ckin-hero-r">
          <div className="ckin-points"><Icon name="coin" size={14} /> {fmtNum(data.points || 0)}</div>
          <button className={`ckin-cta${data.checkedToday ? ' done' : ''}`} onClick={signIn} disabled={signing || data.checkedToday}>
            {data.checkedToday
              ? <><Icon name="check" size={18} /> 今日已签到</>
              : <><Icon name="checkin" size={18} /> 立即签到 <b>+{data.todayReward}</b></>}
          </button>
        </div>
      </div>

      {/* 7-day reward track */}
      <div className="ui-card ckin-track-card">
        <div className="ckin-section-head"><Icon name="gift" size={15} /> 连签奖励 · 坚持 7 天领大奖</div>
        <div className="ckin-track">
          {(data.rewards || []).map((r: any) => (
            <div key={r.day} className={`ckin-cell ${r.state}${r.isToday ? ' is-today' : ''}`}>
              <span className="ckin-cell-coin"><Icon name={r.state === 'done' ? 'check' : 'coin'} size={r.state === 'done' ? 14 : 13} /></span>
              <span className="ckin-cell-pts">+{r.points}</span>
              <span className="ckin-cell-day">第 {r.day} 天</span>
            </div>
          ))}
        </div>
      </div>

      {/* monthly calendar */}
      <div className="ui-card ckin-cal">
        <div className="ckin-cal-head">
          <div className="ckin-section-head" style={{ margin: 0 }}><Icon name="calendar" size={15} /> {y} 年 {m} 月</div>
          <div className="ckin-cal-stats">
            <span>本月 <b>{data.monthCount || 0}</b> 天</span>
            <span>累计 <b>{data.totalDays || 0}</b> 天</span>
            <span>最长 <b>{data.bestStreak || 0}</b> 天</span>
          </div>
        </div>
        <div className="ckin-week">{WEEK.map((w) => <span key={w}>{w}</span>)}</div>
        <div className="ckin-grid">
          {cells.map((c, i) => c === null
            ? <span key={`b${i}`} className="ckin-day blank" />
            : (
              <button
                key={c.d}
                className={`ckin-day ${c.state}${c.isToday ? ' today-ring' : ''}`}
                onClick={() => { if (c.state === 'missed') setMakeupDay(c.d); else if (c.state === 'today' && user) signIn(); }}
                disabled={c.state === 'future' || c.state === 'checked' || c.state === 'makeup'}
              >
                {(c.state === 'checked' || c.state === 'makeup')
                  ? <Icon name="check" size={15} />
                  : <span className="ckin-day-n">{c.d}</span>}
                {c.state === 'makeup' && <span className="ckin-day-tag">补</span>}
                {c.state === 'missed' && <span className="ckin-day-dot" />}
              </button>
            ))}
        </div>
      </div>

      <Modal open={!!makeupDay} onClose={() => setMakeupDay(null)}>
        <div className="ckin-makeup">
          <div className="ckin-makeup-ico"><Icon name="calendar" size={30} /></div>
          <div className="ckin-makeup-title">补签 {m} 月 {makeupDay} 日</div>
          <div className="ckin-makeup-sub faint">将花费 <b>{data.makeupCost} 积分</b> 补上这一天（不计入连签）。当前 {fmtNum(data.points || 0)} 积分。</div>
          <div className="row gap-8" style={{ justifyContent: 'center', marginTop: 16 }}>
            <Button variant="flat" className="haha-btn-app" onClick={() => setMakeupDay(null)} isDisabled={busy}>再想想</Button>
            <Button color="primary" className="haha-btn-app" onClick={doMakeup} isDisabled={busy || (data.points || 0) < data.makeupCost}>
              {(data.points || 0) < data.makeupCost ? '积分不足' : `花 ${data.makeupCost} 积分补签`}
            </Button>
          </div>
        </div>
      </Modal>
    </Shell>
  );
}
