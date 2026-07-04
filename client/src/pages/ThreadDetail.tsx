import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Shell from '../components/Shell';
import { useDismiss } from '../lib/useDismiss';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import Comments from '../components/Comments';
import MediaGrid from '../components/MediaGrid';
import Modal from '../components/Modal';
import MarkdownToolbar from '../components/MarkdownToolbar';
import { UserName } from '../components/Identity';
import { Loading, Empty, DetailSkeleton, LoadError } from '../components/States';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLayout } from '../context/SiteContext';
import api from '../api/client';
import { confirmDialog } from '../components/confirm';
import { reportDialog } from '../components/report';
import { useSmartBack } from '../hooks/useSmartBack';
import { timeAgo, fmtNum } from '../lib/format';

export default function ThreadDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const back = useSmartBack('/forum');
  const { user, setAuthOpen } = useAuth();
  const toast = useToast();
  const [t, setT] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismiss(menuOpen, () => setMenuOpen(false), menuRef);
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState({ title: '', content: '' });
  const editTaRef = useRef<HTMLTextAreaElement | null>(null);
  const layout = useLayout('thread', 'narrow');

  useEffect(() => {
    setLoading(true); setError(false);
    api.get(`/forum/threads/${id}`).then(({ data }) => setT(data.thread)).catch((e: any) => { setT(null); if (e?.status !== 404) setError(true); }).finally(() => setLoading(false));
  }, [id, reloadKey]);

  if (loading) return <Shell layout={layout}><DetailSkeleton /></Shell>;
  if (error) return <Shell layout={layout}><div className="ui-card"><LoadError onRetry={() => setReloadKey((k) => k + 1)} /></div></Shell>;
  if (!t) return <Shell layout={layout}><div className="ui-card"><Empty icon="🔍" text="帖子不存在或已删除" /></div></Shell>;
  if (t.paywalled) return (
    <Shell layout={layout}>
      <div className="ui-card paywall">
        <span className="paywall-ico"><Icon name="lock" size={26} /></span>
        <h3 className="paywall-title">付费板块内容</h3>
        <p className="paywall-sub">「{t.title}」属于付费板块「{t.board?.name}」，解锁该板块后即可阅读全文与回复。</p>
        <div className="paywall-price"><Icon name="coin" size={19} /> {fmtNum(t.board?.price)} <span>积分</span></div>
        <Link to={`/forum/${t.board?.slug}`} className="btn btn-primary btn-lg" style={{ minWidth: 180 }}>前往解锁板块</Link>
      </div>
    </Shell>
  );

  const like = async () => {
    if (!user) return setAuthOpen(true);
    try {
      const { data } = await api.post(`/forum/threads/${t.id}/like`);
      setT((x: any) => ({ ...x, liked: data.liked, likeCount: data.likeCount }));
    } catch (e: any) { toast.err(e.message); }
  };

  // 订阅帖子：乐观切换，新回复时收到通知；失败回滚
  const subscribe = async () => {
    if (!user) return setAuthOpen(true);
    const next = !t.isSubscribed;
    setT((x: any) => ({ ...x, isSubscribed: next }));
    toast.show(next ? '已订阅，有新回复会通知你' : '已取消订阅');
    try {
      const { data } = await api.post(`/forum/threads/${t.id}/subscribe`);
      if (data.subscribed !== next) setT((x: any) => ({ ...x, isSubscribed: data.subscribed }));
    } catch (e: any) { setT((x: any) => ({ ...x, isSubscribed: !next })); toast.err(e.message); }
  };

  const moderate = async (action: string) => {
    if (action === 'delete' && !(await confirmDialog('删除后不可恢复', { title: '删除该帖？', confirmText: '删除' }))) return;
    try {
      const { data } = await api.post(`/forum/threads/${t.id}/moderate`, { action });
      if (data.deleted) { toast.ok('已删除'); nav(`/forum/${t.board.slug}`); return; }
      setT((x: any) => ({ ...x, pinned: data.pinned ?? x.pinned, elite: data.elite ?? x.elite, locked: data.locked ?? x.locked }));
      toast.ok('操作成功');
    } catch (e: any) { toast.err(e.message); }
  };

  const isOwner = user && t.author?.id === user.id;
  const openEdit = () => { setEdit({ title: t.title, content: t.content }); setEditOpen(true); setMenuOpen(false); };
  const saveEdit = async () => {
    try { const { data } = await api.put(`/forum/threads/${t.id}`, edit); setT((x: any) => ({ ...x, ...data.thread })); setEditOpen(false); toast.ok('已更新'); }
    catch (e: any) { toast.err(e.message); }
  };
  const report = async () => {
    setMenuOpen(false);
    if (!user) return setAuthOpen(true);
    const reason = await reportDialog();
    if (reason === null) return;
    try { await api.post('/reports', { targetType: 'thread', targetId: t.id, reason }); toast.ok('举报已提交，感谢反馈'); }
    catch (e: any) { toast.err(e.message); }
  };

  return (
    <Shell layout={layout}>
      <div className="ui-card">
        <div className="page-title" style={{ paddingBottom: 0 }}>
          <button className="back-btn" onClick={back} aria-label="返回"><Icon name="back" size={20} /></button>
          <Link to={`/forum/${t.board?.slug}`} className="thread-board-tag" style={{ fontSize: 14 }}>{t.board?.icon} {t.board?.name}</Link>
        </div>
        <div className="thread-detail" style={{ paddingTop: 12 }}>
          <h1>
            {t.pinned && <span className="ui-badge badge-pin" style={{ marginRight: 6, verticalAlign: 'middle' }}>置顶</span>}
            {t.elite && <span className="ui-badge badge-elite" style={{ marginRight: 6, verticalAlign: 'middle' }}>精华</span>}
            {t.title}
          </h1>
          <div className="row gap-12" style={{ marginBottom: 16 }}>
            <Avatar user={t.author} size={42} showV />
            <div className="grow">
              <UserName user={t.author} />
              <div className="umeta"><span>{timeAgo(t.createdAt)}</span><span className="dot"><Icon name="eye" size={12} style={{ verticalAlign: -2 }} /> {fmtNum(t.views)} 浏览</span></div>
            </div>
            {t.canModerate && (
              <div className="row gap-4 hide-mobile">
                <button className="btn btn-ghost btn-sm" onClick={() => moderate('pin')}>{t.pinned ? '取消置顶' : '置顶'}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => moderate('elite')}>{t.elite ? '取消精华' : '加精'}</button>
              </div>
            )}
            <div style={{ position: 'relative' }} ref={menuRef}>
              <button className="post-menu" onClick={() => setMenuOpen((m) => !m)} aria-label="更多操作"><Icon name="more" size={18} /></button>
              {menuOpen && (
                <div className="ui-card menu-pop">
                  {isOwner && <button className="menu-item" onClick={openEdit}><Icon name="edit" size={16} /> 编辑</button>}
                  {!isOwner && <button className="menu-item" onClick={report}><Icon name="flag" size={16} /> 举报</button>}
                  {(isOwner || t.canModerate) && <button className="menu-item danger" onClick={() => { setMenuOpen(false); moderate('delete'); }}><Icon name="close" size={16} /> 删除</button>}
                </div>
              )}
            </div>
          </div>
          <div className="thread-content">{t.content}</div>
          {t.media?.length > 0 && <MediaGrid media={t.media} />}

          <div className="row gap-8" style={{ marginTop: 22 }}>
            <button className={`btn ${t.liked ? 'btn-primary' : 'btn-outline'}`} onClick={like}>
              <Icon name="heart" size={16} fill={t.liked} /> 赞 {t.likeCount > 0 ? fmtNum(t.likeCount) : ''}
            </button>
            <button className={`btn ${t.isSubscribed ? 'btn-ghost' : 'btn-outline'}`} onClick={subscribe}
              title={t.isSubscribed ? '已订阅，新回复会通知你' : '订阅后新回复会通知你'}>
              <Icon name={t.isSubscribed ? 'check' : 'bell'} size={16} /> {t.isSubscribed ? '已订阅' : '订阅'}
            </button>
            <div className="muted" style={{ fontSize: 13 }}>{fmtNum(t.replyCount)} 条回复</div>
          </div>
        </div>
      </div>

      <div className="ui-card">
        <div className="section-head" style={{ paddingBottom: 0 }}><h2 style={{ fontSize: 16 }}>全部回复</h2></div>
        <Comments threadId={t.id} onCountChange={() => setT((x: any) => ({ ...x, replyCount: x.replyCount + 1 }))} />
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} large>
        <div className="modal-head"><div className="modal-title">编辑帖子</div></div>
        <div className="modal-body">
          <div className="field"><label>标题</label><input value={edit.title} onChange={(e) => setEdit((s) => ({ ...s, title: e.target.value }))} maxLength={60} /></div>
          <div className="field">
            <label>正文</label>
            <MarkdownToolbar taRef={editTaRef} value={edit.content} onChange={(v) => setEdit((s) => ({ ...s, content: v }))} />
            <textarea ref={editTaRef} value={edit.content} onChange={(e) => setEdit((s) => ({ ...s, content: e.target.value }))} style={{ minHeight: 160 }} />
          </div>
          <button className="btn btn-primary btn-lg btn-block" onClick={saveEdit} disabled={!edit.title.trim() || !edit.content.trim()}>保存修改</button>
        </div>
      </Modal>
    </Shell>
  );
}
