import { useState, useRef, lazy, Suspense } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Avatar from './Avatar';
import Icon from './Icon';
import RichText from './RichText';
import RichBody from './RichBody';
import MediaGrid from './MediaGrid';
import Poll from './Poll';
import RedPacket from './RedPacket';
import Reactions from './Reactions';
import Comments from './Comments';
import Modal from './Modal';
import CollectModal from './CollectModal';
import { useDismiss } from '../lib/useDismiss';
import { onImgError } from '../lib/img';
// 懒加载：分享海报用到 html-to-image + qrcode（较重），且仅在点开「分享海报」时才需要，
// 拆成独立 chunk，从首屏主包移除这两个库。
const SharePoster = lazy(() => import('./SharePoster'));
import UserHoverCard from './UserHoverCard';
import { UserName } from './Identity';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api/client';
import { confirmDialog } from './confirm';
import { reportDialog } from './report';
import { timeAgo, fmtNum, VIS_LABELS } from '../lib/format';

const FOLD_LEN = 220;

function emojiBio(bio: any) {
  if (bio?.startsWith('emoji:')) return '';
  return bio || '';
}

interface PostCardProps {
  post: any;
  onDelete?: (id: number) => void;
  [k: string]: any;
}

export default function PostCard({ post: initial, onDelete, defaultOpenComments = false }: PostCardProps) {
  const { user, setAuthOpen, patchUser } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [post, setPost] = useState<any>(initial);
  const [liked, setLiked] = useState(initial.liked);
  const [likeCount, setLikeCount] = useState(initial.likeCount);
  const [commentCount, setCommentCount] = useState(initial.commentCount);
  const [showComments, setShowComments] = useState(defaultOpenComments);
  const [expanded, setExpanded] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareText, setShareText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismiss(menuOpen, () => setMenuOpen(false), menuRef);
  const [pwd, setPwd] = useState('');
  const [bookmarked, setBookmarked] = useState(initial.bookmarked);
  const bmBusy = useRef(false); // 收藏 in-flight 标记（防连点竞态）
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState(initial.content || '');
  const [rewardOpen, setRewardOpen] = useState(false);
  const [rewardAmt, setRewardAmt] = useState<any>(18);
  const [collOpen, setCollOpen] = useState(false);
  const [posterOpen, setPosterOpen] = useState(false);

  const author = post.author;
  const isAnon = post.visibility === 'anonymous';
  const isOwner = user && author?.id === user.id;
  const long = (post.content || '').length > FOLD_LEN;
  const shown = long && !expanded ? post.content.slice(0, FOLD_LEN) : post.content;

  const requireLogin = () => { if (!user) { setAuthOpen(true); return true; } return false; };

  const like = async () => {
    if (requireLogin()) return;
    setLiked((v: any) => !v); setLikeCount((c: any) => c + (liked ? -1 : 1));
    try { await api.post(`/posts/${post.id}/like`); }
    catch (e: any) { setLiked(liked); setLikeCount(likeCount); toast.err(e.message); }
  };

  const unlock = async () => {
    if (requireLogin()) return;
    try {
      const body = post.locked?.type === 'password' ? { password: pwd } : {};
      const { data } = await api.post(`/posts/${post.id}/unlock`, body);
      if (data.bypass) setPost((p: any) => ({ ...p, content: data.content, media: data.media, locked: null, unlocked: true }));
      else { setPost(data.post); toast.ok('解锁成功'); patchUser({ points: (user?.points || 0) - (post.price || 0) }); }
    } catch (e: any) { toast.err(e.message); }
  };

  const reward = () => { if (requireLogin()) return; setRewardOpen(true); };
  const doReward = async () => {
    const amt = Math.max(1, Number(rewardAmt) || 0);
    if (amt > (user?.points || 0)) return toast.err('积分不足，先去签到赚积分吧');
    try {
      await api.post(`/posts/${post.id}/reward`, { amount: amt });
      patchUser({ points: (user?.points || 0) - amt });
      setRewardOpen(false);
      toast.ok(`已打赏 ${amt} 积分 🎁`);
    } catch (e: any) { toast.err(e.message); }
  };

  const doShare = async () => {
    try { await api.post(`/posts/${post.id}/share`, { content: shareText }); setShareOpen(false); setShareText(''); toast.ok('转发成功'); }
    catch (e: any) { toast.err(e.message); }
  };

  const remove = async () => {
    if (!(await confirmDialog('删除后不可恢复', { title: '删除这条动态？', confirmText: '删除' }))) return;
    try { await api.delete(`/posts/${post.id}`); toast.ok('已删除'); onDelete?.(post.id); }
    catch (e: any) { toast.err(e.message); }
  };

  const bookmark = async () => {
    if (requireLogin()) return;
    if (bmBusy.current) return; // in-flight：忽略请求未完成前的重复点击（防连点竞态）
    bmBusy.current = true;
    setBookmarked((b: any) => !b);
    try { const { data } = await api.post(`/posts/${post.id}/bookmark`); toast.show(data.bookmarked ? '已收藏' : '已取消收藏'); }
    catch (e: any) { setBookmarked(bookmarked); toast.err(e.message); }
    finally { bmBusy.current = false; }
  };

  const report = async () => {
    if (requireLogin()) return;
    setMenuOpen(false);
    const reason = await reportDialog();
    if (reason === null) return;
    try { await api.post('/reports', { targetType: 'post', targetId: post.id, reason }); toast.ok('举报已提交，感谢反馈'); }
    catch (e: any) { toast.err(e.message); }
  };

  const block = async () => {
    if (requireLogin()) return;
    setMenuOpen(false);
    if (!(await confirmDialog('之后将不再看到 TA 的内容', { title: `拉黑 @${author.nickname}？`, confirmText: '拉黑' }))) return;
    try { const { data } = await api.post(`/users/${author.id}/block`); toast.ok('已拉黑'); if (data.blocked) onDelete?.(post.id); }
    catch (e: any) { toast.err(e.message); }
  };

  const saveEdit = async () => {
    try { const { data } = await api.put(`/posts/${post.id}`, { content: editText }); setPost(data.post); setEditOpen(false); toast.ok('已更新'); }
    catch (e: any) { toast.err(e.message); }
  };

  const openCollect = () => {
    setMenuOpen(false);
    if (!user) return setAuthOpen(true);
    setCollOpen(true);
  };

  const copyLink = async () => {
    setMenuOpen(false);
    const url = `${window.location.origin}/post/${post.id}`;
    try { await navigator.clipboard.writeText(url); toast.ok('链接已复制'); }
    catch { toast.show(url); }
  };

  const pin = async () => {
    setMenuOpen(false);
    try { const { data } = await api.post(`/posts/${post.id}/pin`); setPost((p: any) => ({ ...p, pinned: data.pinned })); toast.ok(data.pinned ? '已置顶到主页' : '已取消置顶'); }
    catch (e: any) { toast.err(e.message); }
  };

  const globalPin = async () => {
    setMenuOpen(false);
    try { const { data } = await api.post(`/posts/${post.id}/global-pin`); setPost((p: any) => ({ ...p, globalPinned: data.globalPinned })); toast.ok(data.globalPinned ? '已全站置顶 24 小时' : '已取消全站置顶'); }
    catch (e: any) { toast.err(e.message); }
  };

  return (
    <article className="ui-card post rise">
      <div className="post-head">
        <UserHoverCard user={author}><Avatar user={author} size={46} showV /></UserHoverCard>
        <div className="meta">
          <div className="row gap-6">
            <UserHoverCard user={author}><UserName user={author} /></UserHoverCard>
            {post.globalPinned && <span className="ui-badge badge-gpin"><Icon name="pin" size={11} fill /> 全站置顶</span>}
            {post.pinned && <span className="ui-badge badge-pin">置顶</span>}
            {VIS_LABELS[post.visibility] && post.visibility !== 'public' && (
              <span className="faint" style={{ fontSize: 12 }} title={VIS_LABELS[post.visibility].label}>
                {VIS_LABELS[post.visibility].icon}
              </span>
            )}
          </div>
          <div className="umeta">
            <span>{timeAgo(post.createdAt)}</span>
            {post.edited && <span className="dot">已编辑</span>}
          </div>
        </div>
        {!isAnon && (
          <div style={{ position: 'relative' }} ref={menuRef}>
            <button className="post-menu" onClick={() => setMenuOpen((m) => !m)} aria-label="更多操作"><Icon name="more" size={18} /></button>
            {menuOpen && (
              <div className="ui-card menu-pop">
                <button className="menu-item" onClick={copyLink}><Icon name="share" size={16} /> 复制链接</button>
                <button className="menu-item" onClick={() => { setMenuOpen(false); setPosterOpen(true); }}><Icon name="image" size={16} /> 分享海报</button>
                <button className="menu-item" onClick={openCollect}><Icon name="grid" size={16} /> 加入专题</button>
                {isOwner ? (
                  <>
                    <button className="menu-item" onClick={pin}><Icon name="pin" size={16} /> {post.pinned ? '取消置顶' : '置顶到主页'}</button>
                    <button className="menu-item" onClick={globalPin}><Icon name="fire" size={16} /> {post.globalPinned ? '取消全站置顶' : '全站置顶 24h'}</button>
                    <button className="menu-item" onClick={() => { setEditText(post.content || ''); setEditOpen(true); setMenuOpen(false); }}><Icon name="edit" size={16} /> 编辑</button>
                    <button className="menu-item danger" onClick={remove}><Icon name="close" size={16} /> 删除</button>
                  </>
                ) : (
                  <>
                    <button className="menu-item" onClick={() => { setMenuOpen(false); reward(); }}><Icon name="gift" size={16} /> 打赏</button>
                    <button className="menu-item" onClick={report}><Icon name="flag" size={16} /> 举报</button>
                    <button className="menu-item danger" onClick={block}><Icon name="ban" size={16} /> 拉黑作者</button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* repost source — a quote card that navigates to the original (no nested interactive els) */}
      {post.shared && (
        <div className="repost" role="link" tabIndex={0}
          onClick={() => nav(`/post/${post.shared.id}`)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), nav(`/post/${post.shared.id}`))}>
          <div className="row gap-6"><UserName user={post.shared.author} showBadges={false} /></div>
          <div className="post-body" style={{ fontSize: 14 }}><RichText text={(post.shared.content || '').slice(0, 120)} />{(post.shared.content || '').length > 120 ? '…' : ''}</div>
          {post.shared.media?.length > 0 && (
            <div className="repost-media">
              {post.shared.media.slice(0, 3).map((m: any, i: number) => (
                m.type === 'image'
                  ? <img key={i} src={m.url} alt="" loading="lazy" onError={onImgError} />
                  : <span key={i} className="repost-media-ph"><Icon name={m.type === 'video' ? 'video' : 'music'} size={18} /></span>
              ))}
              {post.shared.media.length > 3 && <span className="repost-media-more">+{post.shared.media.length - 3}</span>}
            </div>
          )}
        </div>
      )}

      {shown && (
        <div className="post-body">
          {long && !expanded ? (
            <><RichText text={shown} /> … <span className="post-fulltext" role="button" tabIndex={0} onClick={() => setExpanded(true)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(true); } }}>查看全文</span></>
          ) : (
            <RichBody text={shown} />
          )}
        </div>
      )}

      {post.topic && !(post.content || '').includes(`#${post.topic.name}#`) && (
        <Link to={`/topic/${encodeURIComponent(post.topic.name)}`} className="topic-chip">
          <Icon name="fire" size={13} /> #{post.topic.name}#
        </Link>
      )}

      {/* locked / paid */}
      {post.locked ? (
        <div className="locked-box">
          <div className="lk-ico"><Icon name={post.locked.type === 'paid' ? 'coin' : 'lock'} size={22} /></div>
          {post.locked.type === 'paid' ? (
            <>
              <div className="lk-text">这是付费内容，{post.locked.price} 积分解锁查看</div>
              <button className="btn btn-primary btn-sm" onClick={unlock}>支付 {post.locked.price} 积分解锁</button>
            </>
          ) : (
            <>
              <div className="lk-text">这是加密动态，输入密码查看</div>
              <div className="row gap-8 center">
                <input value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="访问密码"
                  style={{ height: 36, width: 160, border: '1.5px solid var(--line-2)', borderRadius: 8, padding: '0 12px' }} />
                <button className="btn btn-primary btn-sm" onClick={unlock}>解锁</button>
              </div>
            </>
          )}
        </div>
      ) : (
        post.media?.length > 0 && <MediaGrid media={post.media} />
      )}

      {post.poll && <Poll poll={post.poll} postId={post.id} />}
      {post.redPacket && <RedPacket data={post.redPacket} postId={post.id} />}

      {/* context: location + views */}
      {(post.location || post.views > 0) && (
        <div className="post-context">
          {post.location && <span className="pc"><Icon name="location" size={13} /> {post.location}</span>}
          {post.views > 0 && <span className="pc"><Icon name="eye" size={13} /> {fmtNum(post.views)} 浏览</span>}
        </div>
      )}

      <div className="divider" style={{ margin: '14px 0 4px' }} />
      <div className="post-actions">
        <Reactions id={post.id} initialReaction={post.myReaction ?? (liked ? 'like' : null)} initialCount={likeCount} initialReactions={post.reactions} />
        <button className="act act-comment" onClick={() => setShowComments((s: boolean) => !s)}>
          <Icon name="comment" size={18} className="ico" /> {commentCount > 0 ? fmtNum(commentCount) : '评论'}
        </button>
        <button className="act share" onClick={() => (requireLogin() ? null : setShareOpen(true))}>
          <Icon name="share" size={17} className="ico" /> {post.shareCount > 0 ? fmtNum(post.shareCount) : '转发'}
        </button>
        <button className={`act bookmark${bookmarked ? ' on' : ''}`} onClick={bookmark} title="收藏">
          <Icon name="bookmark" size={17} fill={bookmarked} className="ico" /> {bookmarked ? '已收藏' : '收藏'}
        </button>
      </div>

      {showComments && (
        <Comments postId={post.id} onCountChange={(d: any) => setCommentCount((c: any) => c + d)} />
      )}

      <CollectModal open={collOpen} onClose={() => setCollOpen(false)} targetType="post" targetId={post.id} />
      {posterOpen && <Suspense fallback={null}><SharePoster open={posterOpen} onClose={() => setPosterOpen(false)} post={post} /></Suspense>}

      <Modal open={shareOpen} onClose={() => setShareOpen(false)}>
        <div className="modal-head"><div className="modal-title">转发动态</div></div>
        <div className="modal-body">
          <textarea className="field" style={{ width: '100%', minHeight: 80, padding: 12, border: '1.5px solid var(--line-2)', borderRadius: 10 }}
            value={shareText} onChange={(e) => setShareText(e.target.value)} placeholder="说点什么…（可选）" />
          <div className="repost" style={{ marginTop: 4 }}>
            <UserName user={author} showBadges={false} />
            <div className="post-body" style={{ fontSize: 13 }}>{(post.content || '').slice(0, 80)}</div>
          </div>
          <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 14 }} onClick={doShare}>转发</button>
        </div>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)}>
        <div className="modal-head"><div className="modal-title">编辑动态</div></div>
        <div className="modal-body">
          <textarea className="field" style={{ width: '100%', minHeight: 110, padding: 12, border: '1.5px solid var(--line-2)', borderRadius: 10, background: 'var(--surface)', color: 'var(--ink)' }}
            value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
          <button className="btn btn-primary btn-block btn-lg" onClick={saveEdit} disabled={!editText.trim()}>保存修改</button>
        </div>
      </Modal>

      <Modal open={rewardOpen} onClose={() => setRewardOpen(false)}>
        <div className="modal-head"><div className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="gift" size={18} /> 打赏 {author?.nickname}</div><div className="modal-sub">你当前有 {user?.points ?? 0} 积分</div></div>
        <div className="modal-body">
          <div className="row gap-8" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
            {[6, 18, 66, 188, 520].map((a) => (
              <button key={a} className={`btn ${Number(rewardAmt) === a ? 'btn-primary' : 'btn-outline'}`} onClick={() => setRewardAmt(a)}>{a}</button>
            ))}
          </div>
          <div className="field">
            <label>自定义积分</label>
            <input type="number" min={1} value={rewardAmt} onChange={(e) => setRewardAmt(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-block btn-lg" onClick={doReward}>确认打赏 {rewardAmt} 积分</button>
        </div>
      </Modal>
    </article>
  );
}
