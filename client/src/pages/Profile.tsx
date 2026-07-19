import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Shell from '../components/Shell';
import { useDismiss } from '../lib/useDismiss';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import PostCard from '../components/PostCard';
import FollowButton from '../components/FollowButton';
import ThreadRow from '../components/ThreadRow';
import { Badges } from '../components/Identity';
import { Loading, Empty, ProfileSkeleton, PostSkeleton, ListEnd, LoadError } from '../components/States';
import { Button } from '../components/heroui';
import useInfiniteScroll from '../hooks/useInfiniteScroll';
import { CheckinRank, TrendingSearch, Footer } from '../components/Widgets';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useCompose } from '../context/ComposeContext';
import { useSite, moduleOn, widgetOn } from '../context/SiteContext';
import api from '../api/client';
import { confirmDialog } from '../components/confirm';
import { reportDialog } from '../components/report';
import { fmtNum, GENDER, timeAgo } from '../lib/format';

function UserList({ username, rel, isMe }: { username: any; rel: string; isMe: boolean }) {
  const nav = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.get(`/users/${username}/${rel}`).then(({ data }) => setUsers(data.users)).finally(() => setLoading(false)); }, [username, rel]);
  if (loading) return <Loading />;
  if (!users.length) return (
    <Empty icon="👥" text={rel === 'followers' ? '还没有粉丝' : '还没有关注任何人'}>
      {isMe && rel === 'following' && <Button size="sm" color="primary" className="haha-btn-app" onClick={() => nav('/discover')}>去发现感兴趣的人</Button>}
    </Empty>
  );
  return (
    <div style={{ padding: '4px 18px' }}>
      {users.map((u: any) => (
        <div className="user-row" key={u.id} style={{ borderTop: '1px solid var(--line)' }}>
          <Avatar user={u} size={46} showV />
          <div className="meta nowrap">
            <Link to={`/u/${u.username}`} className="nm uname" style={{ fontSize: 15 }}>{u.nickname} <Badges user={u} showLevel={false} /></Link>
            <div className="sub nowrap">{!u.bio || u.bio.startsWith('emoji:') ? `Lv.${u.level} · ${fmtNum(u.followers)} 粉丝` : u.bio}</div>
          </div>
          <FollowButton user={u} />
        </div>
      ))}
    </div>
  );
}

export default function Profile() {
  const { username } = useParams();
  const nav = useNavigate();
  const { user: me, setAuthOpen } = useAuth();
  const toast = useToast();
  const { openCompose } = useCompose();
  const { modules, widgets } = useSite();
  const [user, setUser] = useState<any>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState('posts');
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismiss(menuOpen, () => setMenuOpen(false), menuRef);
  const [threads, setThreads] = useState<any>(null);
  const [badges, setBadges] = useState<any[]>([]);
  const [visitors, setVisitors] = useState<any[]>([]);
  const [followBusy, setFollowBusy] = useState(false);
  const [visitorTotal, setVisitorTotal] = useState(0);

  // 动态 / 赞过两列 C 端信息流统一走 useInfiniteScroll（对齐 Home：按窗口推进 offset、
  // 代次丢弃在途竞态、底部哨兵自动续拉），删掉手写「加载更多」。切用户 / 重试自动重置。
  const { items: posts, loading: postsLoading, hasMore: postsMore, sentinelRef: postsSentinel, setItems: setPosts } = useInfiniteScroll<any>(
    (offset, limit) => api.get(`/posts/user/${username}`, { params: { limit, offset } })
      .then(({ data }) => ({ items: data.posts, hasMore: !!data.hasMore })),
    [username, reloadKey],
    20,
  );
  const { items: likedPosts, loading: likedLoading, hasMore: likedMore, sentinelRef: likedSentinel } = useInfiniteScroll<any>(
    (offset, limit) => api.get(`/posts/liked/${username}`, { params: { limit, offset } })
      .then(({ data }) => ({ items: data.posts, hasMore: !!data.hasMore })),
    [username, reloadKey],
    20,
  );

  const loadProfile = () => api.get(`/users/${username}`).then(({ data }) => setUser(data.user)).catch((e: any) => { setUser(null); if (e?.status !== 404) setError(true); });
  useEffect(() => {
    setLoading(true); setError(false); setTab('posts'); setThreads(null);
    loadProfile().finally(() => setLoading(false));
  }, [username, reloadKey]);

  useEffect(() => {
    if (tab === 'threads' && threads === null)
      api.get(`/forum/threads/user/${username}`).then(({ data }) => setThreads(data.threads)).catch(() => setThreads([]));
  }, [tab, username, threads]);

  // earned achievement badges (a wall on the profile)
  useEffect(() => {
    if (!user?.id) { setBadges([]); return; }
    api.get(`/achievements/user/${user.id}/badges`)
      .then(({ data }) => setBadges((data.badges || []).filter((bb: any) => bb.unlocked)))
      .catch(() => setBadges([]));
  }, [user?.id]);

  // 最近访客 — only the profile owner sees who's visited
  useEffect(() => {
    setVisitors([]); setVisitorTotal(0);
    if (!user?.id || me?.id !== user.id) return;
    api.get(`/users/${user.username}/visitors`)
      .then(({ data }) => { setVisitors(data.visitors || []); setVisitorTotal(data.total || 0); })
      .catch(() => {});
  }, [user?.id, me?.id, user?.username]);

  if (loading || postsLoading) return <Shell right={false}><ProfileSkeleton /><PostSkeleton /><PostSkeleton /></Shell>;
  if (error) return <Shell right={false}><div className="ui-card"><LoadError onRetry={() => setReloadKey((k) => k + 1)} /></div></Shell>;
  if (!user) return <Shell right={false}><div className="ui-card"><Empty icon="🔍" text="用户不存在" /></div></Shell>;

  const isMe = me?.id === user.id;
  const cover = user.cover && !user.cover.startsWith('emoji') ? { backgroundImage: `url(${user.cover})` } : {};

  const follow = async () => {
    if (!me) return setAuthOpen(true);
    if (followBusy) return;
    setFollowBusy(true);
    try {
      const { data } = await api.post(`/users/${user.id}/follow`);
      setUser(data.user);
      toast.ok(data.following ? `已关注 ${user.nickname}` : '已取消关注');
    } catch (e: any) { toast.err(e.message); }
    finally { setFollowBusy(false); }
  };

  const blockUser = async () => {
    setMenuOpen(false);
    if (!(await confirmDialog('之后将不再看到 TA 的内容', { title: `拉黑 @${user.nickname}？`, confirmText: '拉黑' }))) return;
    try { await api.post(`/users/${user.id}/block`); toast.ok('已拉黑'); setUser((u: any) => ({ ...u, isFollowing: false })); }
    catch (e: any) { toast.err(e.message); }
  };
  const reportUser = async () => {
    setMenuOpen(false);
    const reason = await reportDialog();
    if (reason === null) return;
    try { await api.post('/reports', { targetType: 'user', targetId: user.id, reason }); toast.ok('举报已提交，感谢反馈'); }
    catch (e: any) { toast.err(e.message); }
  };

  const lp = user.levelProgress || { percent: 0, level: user.level, nextLevelExp: 0, exp: 0 };

  const right = (
    <>
      {moduleOn(modules, 'checkin') && widgetOn(widgets, 'checkin') && <CheckinRank />}
      {widgetOn(widgets, 'trending') && <TrendingSearch />}
      <Footer />
    </>
  );

  return (
    <Shell right={right}>
      <div className="ui-card profile-hero">
        <div className="profile-cover" style={cover} />
        <div className="profile-main">
          <div className="profile-top">
            <div className="profile-avatar"><Avatar user={user} size={88} showV /></div>
            <div className="profile-id">
              <div className="profile-name">
                <span className="pname-text">{user.nickname}</span>
                {user.gender && GENDER[user.gender] && <span style={{ fontSize: 16, color: user.gender === 'female' ? '#f06595' : '#4c6ef5' }}>{GENDER[user.gender]}</span>}
                <Badges user={user} />
              </div>
              <div className="profile-handle">@{user.username}</div>
            </div>
            <div className="row gap-8" style={{ paddingBottom: 4 }}>
              {isMe ? (
                <Button variant="bordered" className="haha-btn-app" onClick={() => nav('/settings')}><Icon name="edit" size={15} style={{ width: 15, height: 15 }} /> 编辑资料</Button>
              ) : (
                <>
                  <Button variant="flat" className="haha-btn-app" onClick={() => nav(`/messages/${user.id}`)}><Icon name="mail" size={15} style={{ width: 15, height: 15 }} /> 私信</Button>
                  <Button color="primary" variant={user.isFollowing ? 'flat' : 'solid'} className={`haha-btn-app follow-btn${user.isFollowing ? ' following' : ''}`} onClick={follow} isDisabled={followBusy}>
                    {user.isFollowing
                      ? <><span className="fb-on">已关注</span><span className="fb-off">取消关注</span></>
                      : <><Icon name="plus" size={15} style={{ width: 15, height: 15 }} /> 关注</>}
                  </Button>
                  {me && (
                    <div style={{ position: 'relative' }} ref={menuRef}>
                      <button className="post-menu" onClick={() => setMenuOpen((m) => !m)} aria-label="更多操作"><Icon name="more" size={18} /></button>
                      {menuOpen && (
                        <div className="ui-card menu-pop">
                          <button className="menu-item" onClick={reportUser}><Icon name="flag" size={16} /> 举报</button>
                          <button className="menu-item danger" onClick={blockUser}><Icon name="ban" size={16} /> 拉黑</button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {!user.bio?.startsWith('emoji:') && user.bio && <div className="profile-bio">{user.bio}</div>}
          <div className="profile-tags">
            {user.location && <span className="pt"><Icon name="location" size={14} /> {user.location}</span>}
            {user.verified && <span className="pt"><Icon name="check" size={14} style={{ color: 'var(--verify)' }} /> {user.verifiedNote || '认证用户'}</span>}
            {moduleOn(modules, 'checkin') && <span className="pt"><Icon name="checkin" size={14} /> 连续签到 {user.checkinStreak} 天</span>}
          </div>

          <div className="profile-stats">
            <button className="pstat" onClick={() => setTab('posts')}><b>{fmtNum(user.postCount)}</b><span>动态</span></button>
            <button className="pstat" onClick={() => setTab('following')}><b>{fmtNum(user.following)}</b><span>关注</span></button>
            <button className="pstat" onClick={() => setTab('followers')}><b>{fmtNum(user.followers)}</b><span>粉丝</span></button>
            <div className="pstat"><b style={{ color: 'var(--gold)' }}>{fmtNum(user.points)}</b><span>积分</span></div>
          </div>

          <div className="level-bar">
            <div className="lh"><span>等级 Lv.{lp.level}</span><span className="num">{lp.exp} / {lp.nextLevelExp} 经验</span></div>
            <div className="level-track"><div className="level-fill" style={{ width: `${lp.percent}%` }} /></div>
          </div>
        </div>
      </div>

      {badges.length > 0 && (
        <div className="ui-card pf-badges">
          <div className="pf-badges-head">
            <div className="pf-badges-title"><Icon name="shield" size={16} /> 勋章 <span className="pf-badges-n">{badges.length}</span></div>
            {isMe && <Link to="/achievements" className="pf-badges-more">查看全部</Link>}
          </div>
          <div className="pf-badge-row">
            {badges.slice(0, 12).map((bb) => (
              <div key={bb.key} className={`pf-badge tier-${bb.tier}`} title={`${bb.name} · ${bb.desc}`}>
                <span className="pf-medal"><Icon name={bb.icon} size={21} /></span>
                <span className="pf-badge-name">{bb.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isMe && visitors.length > 0 && (
        <div className="ui-card pv-card">
          <div className="pv-head">
            <span className="pv-title"><Icon name="eye" size={16} /> 最近访客 <span className="pv-n">{visitorTotal}</span></span>
          </div>
          <div className="pv-list">
            {visitors.slice(0, 12).map((v) => (
              <Link key={v.id} to={`/u/${v.username}`} className="pv-item" title={`${v.nickname} · ${timeAgo(v.visitedAt)}看过`}>
                <Avatar user={v} size={44} showV />
                <span className="pv-name nowrap">{v.nickname}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="ui-card" style={{ overflow: 'hidden' }}>
        <div className="subtabs">
          <button className={`subtab${tab === 'posts' ? ' active' : ''}`} onClick={() => setTab('posts')}>动态 {user.postCount}</button>
          <button className={`subtab${tab === 'threads' ? ' active' : ''}`} onClick={() => setTab('threads')}>帖子</button>
          <button className={`subtab${tab === 'liked' ? ' active' : ''}`} onClick={() => setTab('liked')}>赞过</button>
          <button className={`subtab${tab === 'following' ? ' active' : ''}`} onClick={() => setTab('following')}>关注 {user.following}</button>
          <button className={`subtab${tab === 'followers' ? ' active' : ''}`} onClick={() => setTab('followers')}>粉丝 {user.followers}</button>
        </div>
        {(tab === 'following' || tab === 'followers') && <UserList username={username} rel={tab} isMe={isMe} />}
        {tab === 'threads' && (threads === null ? <Loading />
          : threads.length === 0 ? <Empty icon="📋" text={isMe ? '你还没有发过帖子' : 'TA 还没有发过帖子'}>{isMe && <Button size="sm" color="primary" className="haha-btn-app" onClick={() => nav('/forum')}>去论坛发帖</Button>}</Empty>
          : threads.map((t: any, i: number) => <div key={t.id}>{i > 0 && <div className="divider" />}<ThreadRow thread={t} /></div>))}
      </div>

      {tab === 'posts' && (posts.length === 0 ? <div className="ui-card"><Empty icon="✍️" text={isMe ? '你还没有发布动态' : 'TA 还没有发布动态'}>
        {isMe && <Button size="sm" color="primary" className="haha-btn-app" onClick={openCompose}><Icon name="edit" size={14} style={{ width: 14, height: 14 }} /> 发布第一条动态</Button>}
      </Empty></div>
        : <>
          {posts.map((p: any) => <PostCard key={p.id} post={p} onDelete={(id: number) => setPosts((x) => x.filter((y) => y.id !== id))} />)}
          <div ref={postsSentinel} />
          {postsMore && <PostSkeleton />}
          {!postsMore && <ListEnd />}
        </>)}

      {tab === 'liked' && (likedLoading ? <Loading />
        : likedPosts.length === 0 ? <div className="ui-card"><Empty icon="❤️" text={isMe ? '你还没有赞过动态' : 'TA 还没有公开的点赞'}>{isMe && <Button size="sm" color="primary" className="haha-btn-app" onClick={() => nav('/discover')}>去发现好内容</Button>}</Empty></div>
        : <>
          {likedPosts.map((p: any) => <PostCard key={p.id} post={p} />)}
          <div ref={likedSentinel} />
          {likedMore && <PostSkeleton />}
          {!likedMore && <ListEnd />}
        </>)}
    </Shell>
  );
}
