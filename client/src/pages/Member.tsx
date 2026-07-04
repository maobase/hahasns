import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import { Badges } from '../components/Identity';
import { Empty, Loading } from '../components/States';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLayout } from '../context/SiteContext';
import api from '../api/client';
import { confirmDialog } from '../components/confirm';
import { fmtNum } from '../lib/format';
import { copyText } from '../lib/clipboard';
import { VIP_TIERS, vipTier, type VipTier } from '../lib/vip';

export default function Member() {
  const { user, loading: authLoading, setAuthOpen, patchUser } = useAuth();
  const toast = useToast();
  const layout = useLayout('member', 'wide');
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [amount, setAmount] = useState(3000);
  const [stats, setStats] = useState<any>(null);
  const [invites, setInvites] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    api.get('/users/me/stats').then(({ data }) => setStats(data)).catch(() => {});
    api.get('/users/me/invites').then(({ data }) => setInvites(data)).catch(() => {});
  }, [user?.id]);

  const inviteLink = user ? `${window.location.origin}/?invite=${encodeURIComponent(user.username)}` : '';
  const copyInvite = async () => {
    if (await copyText(inviteLink)) toast.ok('邀请链接已复制 🔗'); else toast.err('复制失败，请手动复制');
  };

  if (authLoading) return <Shell wide><Loading /></Shell>;
  if (!user) return <Shell wide><div className="ui-card"><Empty icon="🔒" text="登录后查看会员中心" /></div></Shell>;

  const checkedToday = user.lastCheckin === new Date().toISOString().slice(0, 10);
  const checkin = async () => {
    try { const { data } = await api.post('/auth/checkin'); patchUser(data.user); toast.ok(`签到成功 · 连签 ${data.streak} 天 · +${data.pointsEarned} 积分${data.vipMult > 1 ? `（VIP ×${data.vipMult} 加成）` : ''}`); }
    catch (e: any) { toast.err(e.message); }
  };
  const recharge = async () => {
    try { const { data } = await api.post('/users/me/recharge', { amount: Number(amount) }); patchUser(data.user); setRechargeOpen(false); toast.ok('充值成功 🎉'); }
    catch (e: any) { toast.err(e.message); }
  };
  const myLevel = (user.vipLevel ?? (user.vip ? 1 : 0)) as number;
  const myTier = vipTier(myLevel);
  const buyVip = async (t: VipTier) => {
    const action = myLevel === 0 ? '开通' : t.level > myLevel ? '升级到' : '切换到';
    if (!(await confirmDialog('演示环境为模拟开通，不会产生真实扣费', { title: `确认${action} ${t.name}（¥${(t.price / 100).toFixed(0)}/月）？`, confirmText: `确认${action}`, danger: false }))) return;
    try { const { data } = await api.post('/users/me/recharge', { amount: 0, vipLevel: t.level }); patchUser(data.user); toast.ok(`已开通${t.name} 🎉`); }
    catch (e: any) { toast.err(e.message); }
  };

  const lp = (user.levelProgress as any) || { percent: 0, nextLevelExp: 0, exp: 0 };
  // 连签数需与签到逻辑一致：上次签到非今/昨日即视为断签归零，避免会员页与签到页数据矛盾
  const streak = (() => {
    const today = new Date().toISOString().slice(0, 10);
    const yest = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    return (user.lastCheckin === today || user.lastCheckin === yest) ? (user.checkinStreak || 0) : 0;
  })();

  return (
    <Shell layout={layout}>
      {/* identity card */}
      <div className="ui-card" style={{ padding: 20, background: 'linear-gradient(135deg, #1f2640, #2f6bff)' , color: '#fff', overflow: 'hidden' }}>
        <div className="row gap-12">
          <Avatar user={user} size={64} showV ring />
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="row gap-6" style={{ fontSize: 19, fontWeight: 800, flexWrap: 'wrap' }}>{user.nickname} <Badges user={user} /></div>
            <div className="nowrap" style={{ opacity: .85, fontSize: 13, marginTop: 2 }}>@{user.username} · {myTier ? myTier.name : '普通会员'}</div>
          </div>
          <button className="btn" style={{ background: 'rgba(255,255,255,.16)', color: '#fff', flex: 'none' }} onClick={() => setRechargeOpen(true)}>
            <Icon name="coin" size={16} /> 充值
          </button>
        </div>
        <div className="level-bar" style={{ background: 'rgba(255,255,255,.12)', marginTop: 16 }}>
          <div className="lh" style={{ color: 'rgba(255,255,255,.85)' }}><span>Lv.{user.level}</span><span className="num">{lp.exp} / {lp.nextLevelExp} EXP</span></div>
          <div className="level-track" style={{ background: 'rgba(255,255,255,.2)' }}><div className="level-fill" style={{ width: `${lp.percent}%` }} /></div>
        </div>
      </div>

      {/* VIP 多等级 */}
      <div className="ui-card vip-tiers-card">
        <div className="vip-tiers-head">
          <span className="vip-emblem"><Icon name="shield" size={20} fill /></span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="vip-title">{myTier ? `你当前是${myTier.name}` : '开通 VIP 会员'}</div>
            <div className="vip-sub">{myTier ? '专属权益生效中，可随时升级更高等级' : '选择适合你的等级，解锁专属权益'}</div>
          </div>
        </div>
        <div className="vip-tiers">
          {VIP_TIERS.map((t) => {
            const owned = myLevel === t.level;
            const upgrade = myLevel > 0 && myLevel < t.level;
            return (
              <div className={`vip-tier${owned ? ' owned' : ''}`} key={t.level} style={{ ['--tc' as any]: t.color }}>
                <div className="vip-tier-top">
                  <span className="vip-tier-badge" style={{ background: t.color, color: t.ink }}>{t.short}</span>
                  {owned && <span className="vip-tier-cur"><Icon name="check" size={12} /> 当前</span>}
                </div>
                <div className="vip-tier-name">{t.name}</div>
                <div className="vip-tier-tag">{t.tagline}</div>
                <div className="vip-tier-price"><b>¥{(t.price / 100).toFixed(0)}</b><span> / 月</span></div>
                <ul className="vip-tier-perks">
                  {t.perks.map((p) => <li key={p}><Icon name="check" size={13} /> <span>{p}</span></li>)}
                </ul>
                <button className={`btn ${owned ? 'btn-ghost' : 'btn-primary'} btn-block`} disabled={owned} onClick={() => buyVip(t)}>
                  {owned ? '已开通' : upgrade ? '升级' : '开通'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* stat grid */}
      <div className="mc-grid">
        <div className="mc-stat points"><div className="v">{fmtNum(user.points)}</div><div className="k"><Icon name="coin" size={13} /> 我的积分</div></div>
        <div className="mc-stat bal"><div className="v">¥{((user.balance as number) / 100).toFixed(2)}</div><div className="k"><Icon name="wallet" size={13} /> 账户余额</div></div>
        <div className="mc-stat"><div className="v">{fmtNum(user.followers)}</div><div className="k">粉丝</div></div>
        <div className="mc-stat"><div className="v">{fmtNum(user.postCount)}</div><div className="k">动态</div></div>
      </div>

      {/* 创作数据 / creator stats */}
      {stats && (
        <div className="ui-card mc-data">
          <div className="mc-data-head"><Icon name="trend" size={16} /> 创作数据</div>
          <div className="mc-data-grid">
            <div className="mc-data-item"><span className="mc-data-ico di-like"><Icon name="heart" size={16} /></span><b>{fmtNum(stats.likes)}</b><span>累计获赞</span></div>
            <div className="mc-data-item"><span className="mc-data-ico di-view"><Icon name="eye" size={16} /></span><b>{fmtNum(stats.views)}</b><span>内容浏览</span></div>
            <div className="mc-data-item"><span className="mc-data-ico di-visit"><Icon name="user" size={16} /></span><b>{fmtNum(stats.visitors)}</b><span>主页访客</span></div>
            <div className="mc-data-item"><span className="mc-data-ico di-comment"><Icon name="comment" size={16} /></span><b>{fmtNum(stats.comments)}</b><span>收到评论</span></div>
          </div>
        </div>
      )}

      {/* 邀请好友 / invite & referral */}
      <div className="ui-card mc-invite">
        <div className="mc-invite-head">
          <div><Icon name="user" size={16} /> 邀请好友</div>
          <span className="mc-invite-count">已邀请 <b>{invites?.count ?? 0}</b> 人</span>
        </div>
        <p className="mc-invite-sub">好友用你的邀请链接注册，<b>你 +{invites?.rewardPerInvite ?? 50} 积分</b>、好友得 +30 积分见面礼。</p>
        <div className="mc-invite-row">
          <input className="inp" readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} aria-label="邀请链接" />
          <button type="button" className="btn btn-primary" onClick={copyInvite} style={{ flex: 'none' }}><Icon name="copy" size={15} /> 复制</button>
        </div>
        {invites?.invitees?.length > 0 && (
          <div className="mc-invite-avatars">
            {invites.invitees.slice(0, 10).map((u: any) => <Avatar key={u.id} user={u} size={30} />)}
          </div>
        )}
      </div>

      {/* check-in */}
      <div className="ui-card checkin-card">
        <div className="muted" style={{ fontSize: 13 }}>已连续签到</div>
        <div className="checkin-streak">{streak}<span style={{ fontSize: 16, fontWeight: 600 }}> 天</span></div>
        <div className="checkin-week">
          {['一','二','三','四','五','六','日'].map((d, i) => (
            <div key={d} className={`checkin-day${i < (streak % 7 || (streak ? 7 : 0)) ? ' done' : ''}`}>{i < (streak % 7 || (streak ? 7 : 0)) ? <Icon name="check" size={15} /> : d}</div>
          ))}
        </div>
        <button className={`btn ${checkedToday ? 'btn-ghost' : 'btn-primary'} btn-lg`} onClick={checkin} disabled={checkedToday} style={{ minWidth: 160 }}>
          {checkedToday ? '今日已签到' : '立即签到 +积分'}
        </button>
        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>连续签到积分更多，断签重新计算哦</div>
      </div>

      {/* quick links */}
      <div className="ui-card" style={{ padding: 8 }}>
        <Link to="/achievements" className="rail-item" style={{ color: 'var(--brand)' }}><span className="ico"><Icon name="trend" size={20} /></span> 任务中心 · 成就勋章</Link>
        <Link to={`/u/${user.username}`} className="rail-item"><span className="ico"><Icon name="user" size={20} /></span> 我的主页</Link>
        <Link to="/mall" className="rail-item"><span className="ico"><Icon name="shop" size={20} /></span> 积分商城</Link>
        <Link to="/bookmarks" className="rail-item"><span className="ico"><Icon name="bookmark" size={20} /></span> 我的收藏</Link>
        <Link to="/settings" className="rail-item"><span className="ico"><Icon name="edit" size={20} /></span> 编辑资料</Link>
        <Link to="/notifications" className="rail-item"><span className="ico"><Icon name="bell" size={20} /></span> 消息通知</Link>
        {user.role === 'admin' && <Link to="/admin" className="rail-item" style={{ color: 'var(--brand)' }}><span className="ico"><Icon name="shield" size={20} /></span> 管理后台</Link>}
      </div>

      <Modal open={rechargeOpen} onClose={() => setRechargeOpen(false)}>
        <div className="modal-head"><div className="modal-title">充值中心</div><div className="modal-sub">充值账户余额，余额可用于开通会员、商城兑换等</div></div>
        <div className="modal-body">
          <div className="field">
            <label>选择充值金额</label>
            <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
              {[1000, 3000, 6800, 19800].map((a) => (
                <button key={a} className={`btn ${amount === a ? 'btn-primary' : 'btn-outline'} btn-sm`} onClick={() => setAmount(a)}>¥{(a/100).toFixed(0)}</button>
              ))}
            </div>
          </div>
          <button className="btn btn-primary btn-lg btn-block" onClick={recharge}>确认充值 ¥{(amount/100).toFixed(2)}</button>
          <div className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 10 }}>演示环境，充值为模拟操作，不会产生真实扣费</div>
        </div>
      </Modal>
    </Shell>
  );
}
