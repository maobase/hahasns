import { useState, useEffect, useRef } from 'react';
import Avatar from './Avatar';
import Icon from './Icon';
import RichText from './RichText';
import Reactions from './Reactions';
import useMention from '../hooks/useMention';
import UserHoverCard from './UserHoverCard';
import { UserName } from './Identity';
import { CommentSkeleton, LoadError } from './States';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api/client';
import { confirmDialog } from './confirm';
import { reportDialog } from './report';
import { timeAgo } from '../lib/format';

function CommentItem({ c, me, onReply, onLike, onDelete, onReport, onEdit }: {
  c: any;
  me: any;
  onReply: (c: any) => void;
  onLike: (c: any) => void;
  onDelete: (c: any) => void;
  onReport: (c: any) => void;
  onEdit: (c: any, content: string) => Promise<boolean>;
}) {
  const mine = me && c.author?.id === me.id;
  const [showAllReplies, setShowAllReplies] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.content);
  const [saving, setSaving] = useState(false);
  const replies = c.replies || [];
  const visibleReplies = showAllReplies ? replies : replies.slice(0, 3);
  const saveEdit = async () => {
    if (!draft.trim() || saving) return;
    setSaving(true);
    const ok = await onEdit(c, draft.trim());
    setSaving(false);
    if (ok) setEditing(false);
  };
  return (
    <div className="comment">
      <UserHoverCard user={c.author}><Avatar user={c.author} size={36} /></UserHoverCard>
      <div className="comment-body">
        <div className="cname"><UserHoverCard user={c.author}><UserName user={c.author} /></UserHoverCard></div>
        {editing ? (
          <div className="comment-edit">
            <textarea className="inp" value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} autoFocus />
            <div className="comment-edit-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setDraft(c.content); }}>取消</button>
              <button className="btn btn-primary btn-sm" disabled={saving || !draft.trim()} onClick={saveEdit}>{saving ? '保存中…' : '保存'}</button>
            </div>
          </div>
        ) : (
          <div className="ctext">
            {c.replyTo && <span className="reply-to">@{c.replyTo.nickname} </span>}
            <RichText text={c.content} />
          </div>
        )}
        <div className="comment-meta">
          <span>{timeAgo(c.createdAt)}{c.edited && <span className="cmt-edited"> · 已编辑</span>}</span>
          <Reactions target="comment" id={c.id} initialReaction={c.myReaction ?? (c.liked ? 'like' : null)} initialCount={c.likeCount} simple />
          <button onClick={() => onReply(c)}>回复</button>
          {mine && <button onClick={() => { setDraft(c.content); setEditing(true); }}>编辑</button>}
          {mine
            ? <button onClick={() => onDelete(c)}>删除</button>
            : <button onClick={() => onReport(c)}>举报</button>}
        </div>
        {replies.length > 0 && (
          <div className="comment-replies">
            {visibleReplies.map((r: any) => <CommentItem key={r.id} c={r} me={me} onReply={onReply} onLike={onLike} onDelete={onDelete} onReport={onReport} onEdit={onEdit} />)}
            {!showAllReplies && replies.length > 3 && (
              <button className="replies-more" onClick={() => setShowAllReplies(true)}>展开 {replies.length - 3} 条回复 <Icon name="chevron" size={13} style={{ verticalAlign: '-2px' }} /></button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Comments({ postId, threadId, articleId, onCountChange }: {
  postId?: number;
  threadId?: number;
  articleId?: number;
  onCountChange?: (delta: number) => void;
}) {
  const { user, setAuthOpen } = useAuth();
  const toast = useToast();
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState('latest');
  const [text, setText] = useState('');
  const [replyTarget, setReplyTarget] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const mention = useMention(text, setText, inputRef);
  // 评论框自增高：随内容换行、超长滚动（修复反馈#7「超过长度不能换行」）
  useEffect(() => {
    const el = inputRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }
  }, [text]);

  const params = postId ? { postId } : threadId ? { threadId } : { articleId };

  const load = async () => {
    setLoading(true); setError(false);
    try {
      const { data } = await api.get('/comments', { params: { ...params, sort } });
      setComments(data.comments);
    } catch { setError(true); } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [postId, threadId, articleId, sort]);

  const submit = async () => {
    if (!user) return setAuthOpen(true);
    if (!text.trim()) return;
    setBusy(true);
    try {
      const payload: any = { ...params, content: text };
      if (replyTarget) { payload.parentId = replyTarget.parentId || replyTarget.id; payload.replyTo = replyTarget.author.id; }
      await api.post('/comments', payload);
      setText(''); setReplyTarget(null);
      await load();
      onCountChange?.(1);
      toast.ok('评论已发布');
    } catch (e: any) { toast.err(e.message); }
    finally { setBusy(false); }
  };

  const like = async (c: any) => {
    if (!user) return setAuthOpen(true);
    try {
      const { data } = await api.post(`/comments/${c.id}/like`);
      const apply = (list: any[]): any[] => list.map((x) => x.id === c.id ? { ...x, liked: data.liked, likeCount: data.likeCount } : { ...x, replies: x.replies ? apply(x.replies) : x.replies });
      setComments((cs) => apply(cs));
    } catch (e: any) { toast.err(e.message); }
  };

  const remove = async (c: any) => {
    if (!(await confirmDialog('删除后不可恢复', { title: '删除这条评论？', confirmText: '删除' }))) return;
    try { await api.delete(`/comments/${c.id}`); await load(); onCountChange?.(-1); toast.ok('已删除'); }
    catch (e: any) { toast.err(e.message); }
  };

  const editComment = async (c: any, content: string): Promise<boolean> => {
    try {
      const { data } = await api.put(`/comments/${c.id}`, { content });
      const apply = (list: any[]): any[] => list.map((x) => x.id === c.id
        ? { ...x, content: data.comment.content, edited: data.comment.edited }
        : { ...x, replies: x.replies ? apply(x.replies) : x.replies });
      setComments((cs) => apply(cs));
      toast.ok('评论已更新');
      return true;
    } catch (e: any) { toast.err(e.message); return false; }
  };
  const report = async (c: any) => {
    if (!user) return setAuthOpen(true);
    const reason = await reportDialog();
    if (reason === null) return;
    try { await api.post('/reports', { targetType: 'comment', targetId: c.id, reason }); toast.ok('举报已提交，感谢反馈'); }
    catch (e: any) { toast.err(e.message); }
  };

  const total = comments.reduce((n, c) => n + 1 + (c.replies?.length || 0), 0);

  return (
    <div className="comments">
      <div className="row gap-8" style={{ padding: '12px 0', alignItems: 'flex-end' }}>
        <Avatar user={user} size={34} emoji={user ? undefined : 'emoji:🙂:#cdd3dd'} />
        <div style={{ flex: 1, position: 'relative' }}>
          <textarea
            ref={inputRef}
            value={text}
            rows={1}
            onChange={(e) => { setText(e.target.value); mention.scan(e.target.value, e.target.selectionStart ?? 0); }}
            onKeyDown={(e) => { if (mention.onKeyDown(e)) return; if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            onBlur={() => setTimeout(mention.close, 120)}
            onFocus={() => !user && setAuthOpen(true)}
            placeholder={replyTarget ? `回复 @${replyTarget.author.nickname}：` : '友善评论，@ 提及好友…'}
            className="inp"
            style={{ height: 'auto', minHeight: 40, maxHeight: 120, padding: '9px 16px', lineHeight: 1.45, resize: 'none', overflowY: 'auto' }}
          />
          {mention.dropdown}
        </div>
        {replyTarget && <button className="btn btn-ghost btn-sm" onClick={() => setReplyTarget(null)}>取消</button>}
        <button className="btn btn-primary btn-sm" disabled={busy || !text.trim()} onClick={submit}>发送</button>
      </div>

      {loading ? (
        <CommentSkeleton />
      ) : error ? (
        <LoadError onRetry={load} text="评论加载失败" />
      ) : total === 0 ? (
        <div className="empty" style={{ padding: '28px 0' }}>
          <div className="e-text">还没有评论，来抢个沙发吧</div>
        </div>
      ) : (
        <>
          {comments.length >= 2 && (
            <div className="comments-head">
              <span className="ch-count">{total} 条评论</span>
              <div className="ch-sort">
                <button className={sort === 'latest' ? 'on' : ''} onClick={() => setSort('latest')}>最新</button>
                <button className={sort === 'hot' ? 'on' : ''} onClick={() => setSort('hot')}>最热</button>
              </div>
            </div>
          )}
          {(showAll ? comments : comments.slice(0, 5)).map((c) => (
            <CommentItem key={c.id} c={c} me={user} onReply={setReplyTarget} onLike={like} onDelete={remove} onReport={report} onEdit={editComment} />
          ))}
          {!showAll && comments.length > 5 && (
            <button className="comments-more" onClick={() => setShowAll(true)}>查看全部 {comments.length} 条评论 <Icon name="chevron" size={13} style={{ verticalAlign: '-2px' }} /></button>
          )}
        </>
      )}
    </div>
  );
}
