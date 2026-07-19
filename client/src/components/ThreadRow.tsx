import { useState } from 'react';
import { Link } from 'react-router-dom';
import Avatar from './Avatar';
import Icon from './Icon';
import { Spinner } from './heroui';
import MediaGrid from './MediaGrid';
import Comments from './Comments';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api/client';
import { timeAgo, fmtNum } from '../lib/format';

interface ThreadRowProps {
  thread: any;
  showBoard?: boolean;
  defaultOpen?: boolean;
}

// A forum thread row that expands inline (full content + replies + reply box)
// so reading and replying never leaves the list.
export default function ThreadRow({ thread: initial, showBoard = true, defaultOpen = false }: ThreadRowProps) {
  const { user, setAuthOpen } = useAuth();
  const toast = useToast();
  const [t, setT] = useState<any>(initial);
  const [open, setOpen] = useState(defaultOpen);
  const [full, setFull] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [replyCount, setReplyCount] = useState(initial.replyCount);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !full) {
      setLoading(true);
      try { const { data } = await api.get(`/forum/threads/${t.id}`); setFull(data.thread); setT(data.thread); }
      catch (e: any) { toast.err(e.message); }
      finally { setLoading(false); }
    }
  };

  const like = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!user) return setAuthOpen(true);
    try { const { data } = await api.post(`/forum/threads/${t.id}/like`); setT((x: any) => ({ ...x, liked: data.liked, likeCount: data.likeCount })); }
    catch (err: any) { toast.err(err.message); }
  };

  return (
    <div className={`thread-item${open ? ' open' : ''}`}>
      <div className="thread-row" onClick={toggle} role="button" tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle())}>
        <Avatar user={t.author} size={42} showV />
        <div className="thread-main">
          <div className="thread-title">
            {t.pinned && <span className="ui-badge badge-pin">置顶</span>}
            {t.elite && <span className="ui-badge badge-elite">精华</span>}
            <Link to={`/thread/${t.id}`} className="thread-title-link" onClick={(e) => e.stopPropagation()}>{t.title}</Link>
          </div>
          {t.content && !open && <div className="thread-excerpt">{t.content}</div>}
          <div className="thread-meta">
            <span className="uname" style={{ fontSize: 12.5, fontWeight: 600 }}>{t.author?.nickname}</span>
            {showBoard && t.board && <Link to={`/forum/${t.board.slug}`} className="thread-board-tag" onClick={(e) => e.stopPropagation()}>{t.board.icon} {t.board.name}</Link>}
            <span className="tm">{timeAgo(t.lastReplyAt || t.createdAt)}</span>
            <span className="tm"><Icon name="eye" size={13} /> {fmtNum(t.views)}</span>
            <span className="tm"><Icon name="comment" size={13} /> {fmtNum(replyCount)}</span>
            <span className="tm"><Icon name="heart" size={13} /> {fmtNum(t.likeCount)}</span>
          </div>
        </div>
        <Icon name="back" size={18} className="thread-chevron" />
      </div>

      {open && (
        <div className="thread-expand">
          {loading ? (
            <div className="center" style={{ padding: 24 }}><Spinner /></div>
          ) : (
            <>
              <div className="thread-content">{full?.content || t.content}</div>
              {full?.media?.length > 0 && <MediaGrid media={full.media} />}
              <div className="row gap-8" style={{ marginTop: 14 }}>
                <button className={`btn btn-sm ${t.liked ? 'btn-primary' : 'btn-outline'}`} onClick={like}>
                  <Icon name="heart" size={14} fill={t.liked} /> 赞 {t.likeCount > 0 ? fmtNum(t.likeCount) : ''}
                </button>
                <Link to={`/thread/${t.id}`} className="btn btn-ghost btn-sm" onClick={(e) => e.stopPropagation()}><Icon name="forum" size={14} /> 查看完整帖子</Link>
                <span className="spacer" />
                <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>收起</button>
              </div>
              <div style={{ borderTop: '1px solid var(--line)', marginTop: 8 }}>
                <Comments threadId={t.id} onCountChange={() => setReplyCount((c: number) => c + 1)} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
