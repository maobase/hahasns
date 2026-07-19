import { useState, useEffect, useRef, useCallback } from 'react';
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
import { fmtNum, timeAgo } from '../lib/format';

// clockwise grid placement for prize positions 0..7 (center cell is the button)
const AREA = ['p0', 'p1', 'p2', 'p7', 'btn', 'p3', 'p6', 'p5', 'p4'];

export default function Lottery() {
  const { user, setAuthOpen, patchUser } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [winners, setWinners] = useState<any[]>([]);
  const [highlight, setHighlight] = useState(-1);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const spinRef = useRef(false);

  const load = useCallback(() => {
    api.get('/lottery').then(({ data }) => setData(data)).catch(() => setData({ prizes: [] }));
    api.get('/lottery/winners').then(({ data }) => setWinners(data.winners)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const draw = async () => {
    if (!user) return setAuthOpen(true);
    if (spinRef.current) return;
    const free = data.freeLeft > 0;
    if (!free && (data.points || 0) < data.cost) return toast.err(`积分不足，每次抽奖需 ${data.cost} 积分`);
    spinRef.current = true; setSpinning(true); setResult(null);
    let res;
    try {
      const { data: r } = await api.post('/lottery/draw');
      res = r;
    } catch (err: any) { spinRef.current = false; setSpinning(false); return toast.err(err.message); }

    // spin the highlight around the 8 cells, decelerating onto the won position
    const target = res.prize.position;
    const start = highlight < 0 ? 0 : highlight;
    const steps = 8 * 2 + ((target - start + 8) % 8);
    let i = 0;
    const tick = () => {
      setHighlight((h) => ((h < 0 ? 0 : h) + 1) % 8);
      i += 1;
      if (i >= steps) {
        spinRef.current = false; setSpinning(false);
        patchUser?.(res.user);
        setData((d: any) => ({ ...d, points: res.user.points, freeLeft: res.freeLeft }));
        setTimeout(() => { setResult(res); load(); }, 380);
        return;
      }
      const p = i / steps;
      setTimeout(tick, 34 + 320 * p * p); // ease-out: fast then decelerate onto the prize
    };
    setTimeout(tick, 45);
  };

  if (!data) return <Shell right={false}><Loading /></Shell>;

  const free = data.freeLeft > 0;
  const right = (
    <>
      <div className="ui-card widget">
        <div className="widget-head"><div className="widget-title"><Icon name="trend" size={16} className="tk" /> 中奖播报</div></div>
        {winners.length === 0 ? <div className="faint" style={{ padding: '6px 2px', fontSize: 12.5 }}>还没有人中奖，快来抽第一发～</div> :
          winners.map((w) => (
            <Link to={`/u/${w.user.username}`} className="lw-row" key={w.id}>
              <Avatar user={w.user} size={28} />
              <span className="lw-text"><b>{w.user.nickname}</b> 抽中 <span className="lw-prize">{w.prizeName}</span></span>
              <span className="lw-time">{timeAgo(w.createdAt)}</span>
            </Link>
          ))}
      </div>
      {user && data.myRecent?.length > 0 && (
        <div className="ui-card widget">
          <div className="widget-head"><div className="widget-title"><Icon name="gift" size={16} className="tk" /> 我的记录</div></div>
          {data.myRecent.slice(0, 8).map((m: any) => (
            <div className="lh-row" key={m.id}>
              <span className={`lh-name${m.prize_type === 'thanks' ? ' thanks' : ''}`}>{m.prize_name}</span>
              <span className="lh-time">{timeAgo(m.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );

  return (
    <Shell right={right}>
      <div className="ui-card lottery-hero">
        <div>
          <h1 className="text-xl font-extrabold flex items-center gap-2"><Icon name="gift" size={20} /> 幸运抽奖</h1>
          <p className="lottery-sub">{free ? '今天还有 1 次免费抽奖机会，试试手气！' : `每次抽奖消耗 ${data.cost} 积分`}</p>
        </div>
        <div className="lottery-points"><Icon name="coin" size={15} /> {fmtNum(data.points || 0)}</div>
      </div>

      <div className="ui-card lottery-board">
        <div className="lottery-grid">
          {data.prizes.map((p: any) => (
            <div key={p.id} className={`lottery-cell${highlight === p.position ? ' lit' : ''}`} style={{ gridArea: `p${p.position}`, '--pc': p.color || 'var(--brand)' } as React.CSSProperties}>
              <span className="lc-ico"><Icon name={p.icon} size={22} /></span>
              <span className="lc-name">{p.name}</span>
            </div>
          ))}
          <button className="lottery-go" style={{ gridArea: 'btn' }} onClick={draw} disabled={spinning}>
            {spinning ? <span className="lottery-go-spin"><Icon name="gift" size={26} /></span> : (
              <>
                <span className="lg-label">{free ? '免费抽' : '抽一次'}</span>
                <span className="lg-cost">{free ? '今日免费' : `${data.cost} 积分`}</span>
              </>
            )}
          </button>
        </div>
        <div className="lottery-tip faint"><Icon name={free ? 'gift' : 'coin'} size={14} /> {free ? '每日 1 次免费机会，明日 0 点刷新' : '抽中积分会直接到账，头衔 / 头像框自动佩戴'}</div>
      </div>

      <Modal open={!!result} onClose={() => setResult(null)}>
        {result && (
          <div className="lottery-result">
            <div className={`lr-ico${result.prize.type === 'thanks' ? ' thanks' : ' win'}`} style={{ '--pc': result.prize.color || 'var(--brand)' } as React.CSSProperties}>
              <Icon name={result.prize.icon} size={36} />
            </div>
            <div className="lr-title">{result.prize.type === 'thanks' ? '谢谢参与' : '恭喜中奖！'}</div>
            {result.prize.type !== 'thanks' && <div className="lr-prize">{result.prize.name}</div>}
            <div className="lr-sub faint">{result.prize.type === 'thanks' ? '别灰心，再抽一次说不定就中了～' : '奖励已发放到你的账户'}</div>
            <div className="row gap-8" style={{ justifyContent: 'center', marginTop: 14 }}>
              <Button variant="flat" className="haha-btn-app" onClick={() => setResult(null)}>知道了</Button>
              <Button color="primary" className="haha-btn-app" onClick={() => { setResult(null); setTimeout(draw, 60); }} isDisabled={!data.freeLeft && (data.points || 0) < data.cost}>再抽一次</Button>
            </div>
          </div>
        )}
      </Modal>
    </Shell>
  );
}
