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
import CollectModal from './CollectModal';
import ShareModal from './postcard/ShareModal';
import EditModal from './postcard/EditModal';
import TipModal from './postcard/TipModal';
import { Button } from './heroui';
import { useDismiss } from '../lib/useDismiss';
import { onImgError } from '../lib/img';
import { copyText } from '../lib/clipboard';
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

export default function PostCard({ post: initial, onDelete, defaultOpenComments = false, compact = false }: PostCardProps) {
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismiss(menuOpen, () => setMenuOpen(false), menuRef);
  const [pwd, setPwd] = useState('');
  const [bookmarked, setBookmarked] = useState(initial.bookmarked);
  const bmBusy = useRef(false); // 收藏 in-flight 标记（防连点竞态）
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState(initial.content || '');
  const [rewardOpen, setRewardOpen] = useState(false);
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
    if (await copyText(url)) toast.ok('链接已复制'); else toast.show(url);
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
    <article className={`ui-card post rise${compact ? ' post-compact' : ''}`}>
      <div className="post-head">
        <UserHoverCard user={author}><Avatar user={author} size={compact ? 36 : 46} showV /></UserHoverCard>
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
      {post.sharedDeleted && (
        <div className="repost" style={{ color: 'var(--ink-4)', fontStyle: 'italic', cursor: 'default' }}>原动态已删除</div>
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
              <Button size="sm" color="primary" className="haha-btn-app" onClick={unlock}>支付 {post.locked.price} 积分解锁</Button>
            </>
          ) : (
            <>
              <div className="lk-text">这是加密动态，输入密码查看</div>
              <div className="row gap-8 center">
                <input value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="访问密码"
                  style={{ height: 36, width: 160, border: '1.5px solid var(--line-2)', borderRadius: 8, padding: '0 12px' }} />
                <Button size="sm" color="primary" className="haha-btn-app" onClick={unlock}>解锁</Button>
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

      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} post={post} />
      <EditModal open={editOpen} onClose={() => setEditOpen(false)} value={editText} onChange={setEditText} onSave={saveEdit} />
      <TipModal open={rewardOpen} onClose={() => setRewardOpen(false)} postId={post.id} nickname={author?.nickname} />
    </article>
  );
}
