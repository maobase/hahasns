import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import { Button } from './heroui';
import Avatar from './Avatar';
import Modal from './Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api/client';
import { fmtNum } from '../lib/format';
import type { RedPacketData } from '../types';

export default function RedPacket({ data: initial, postId }: { data: RedPacketData; postId: number }) {
  const { user, setAuthOpen, patchUser } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<RedPacketData>(initial);
  const [opening, setOpening] = useState(false);
  const [result, setResult] = useState<number | null>(null);

  const grabbable = !!user && !data.over && data.myAmount == null && !data.isOwner;

  const open = async () => {
    if (!user) return setAuthOpen(true);
    if (!grabbable || opening) return;
    setOpening(true);
    try {
      const { data: r } = await api.post<{ amount: number; redPacket: RedPacketData; user: { points: number } }>(`/posts/${postId}/grab`);
      setData(r.redPacket);
      patchUser?.({ points: r.user.points });
      setResult(r.amount);
    } catch (err) { toast.err((err as Error).message); } finally { setOpening(false); }
  };

  const pct = data.totalCount > 0 ? Math.round((data.grabbedCount / data.totalCount) * 100) : 0;

  return (
    <div className={`redpacket${data.over ? ' is-over' : ''}`} onClick={(e) => e.stopPropagation()}>
      <div className="rp-main">
        <span className="rp-ico"><Icon name="redpacket" size={24} /></span>
        <div className="rp-info">
          <div className="rp-bless">{data.blessing}</div>
          <div className="rp-meta">{fmtNum(data.totalPoints)} 积分 · 共 {data.totalCount} 个红包</div>
        </div>
        {data.myAmount != null ? (
          <div className="rp-got">已抢到 <b>{fmtNum(data.myAmount)}</b></div>
        ) : data.isOwner ? (
          <div className="rp-tag">你发的</div>
        ) : data.over ? (
          <div className="rp-tag">已抢光</div>
        ) : (
          <button className="rp-open" onClick={open} disabled={opening}>{opening ? '…' : '开'}</button>
        )}
      </div>

      {data.grabbedCount > 0 && (
        <div className="rp-foot">
          <div className="rp-bar"><span style={{ width: `${pct}%` }} /></div>
          <span className="rp-prog">已抢 {data.grabbedCount}/{data.totalCount} 个 · {fmtNum(data.grabbedPoints)} 积分</span>
        </div>
      )}

      {data.grabs.length > 0 && (
        <div className="rp-grabs">
          {data.grabs.slice(0, 8).map((g) => (
            <Link to={`/u/${g.user.username}`} key={g.user.id} className={`rp-grab${g.user.id === data.bestUserId ? ' best' : ''}`} title={`${g.user.nickname} · ${g.amount} 积分`}>
              <Avatar user={g.user} size={26} />
            </Link>
          ))}
        </div>
      )}

      <Modal open={result != null} onClose={() => setResult(null)} bare>
        <div className="rp-result">
          <button className="rp-result-x" onClick={() => setResult(null)} aria-label="关闭"><Icon name="close" size={18} /></button>
          <span className="rp-result-ico"><Icon name="redpacket" size={38} /></span>
          <div className="rp-result-bless">{data.blessing}</div>
          <div className="rp-result-amt"><b>{fmtNum(result || 0)}</b> 积分</div>
          <div className="rp-result-sub">已存入你的积分账户</div>
          {data.grabs.length > 0 && (
            <div className="rp-result-list">
              {data.grabs.slice(0, 6).map((g) => (
                <Link to={`/u/${g.user.username}`} key={g.user.id} className="rp-rrow">
                  <Avatar user={g.user} size={28} />
                  <span className="rp-rname">{g.user.nickname}</span>
                  {g.user.id === data.bestUserId && <span className="rp-best-tag">手气最佳</span>}
                  <span className="rp-ramt">{fmtNum(g.amount)} 积分</span>
                </Link>
              ))}
            </div>
          )}
          <Button color="primary" fullWidth className="haha-btn-app" style={{ marginTop: 14 }} onClick={() => setResult(null)}>开心收下</Button>
        </div>
      </Modal>
    </div>
  );
}
