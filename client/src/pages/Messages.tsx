import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Shell from '../components/Shell';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { UserName } from '../components/Identity';
import { Empty, Loading, ChatListSkeleton } from '../components/States';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api/client';
import { confirmDialog } from '../components/confirm';
import { timeAgo, clockTime } from '../lib/format';
import { useDismiss } from '../lib/useDismiss';

const CHAT_EMOJIS = '😀 😂 🥰 😍 😎 🤔 😴 😭 👍 👏 🙏 💪 🎉 🔥 ❤️ 🌈 ☕ 🎵 🙌 🤝 😅 🥺 😘 🤣 👀 🐶 🌸 ✨'.split(' ');

export default function Messages() {
  const { peerId } = useParams();
  const nav = useNavigate();
  const { user, loading: authLoading, setAuthOpen } = useAuth();
  const toast = useToast();
  const [convos, setConvos] = useState<any[]>([]);
  const [active, setActive] = useState<any>(null); // { peer, messages }
  const [text, setText] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [menuFor, setMenuFor] = useState<any>(null);
  const [menuUp, setMenuUp] = useState(false);
  // open the convo ⋯ menu upward if a downward menu would clip past the scrollable list bottom
  const openConvoMenu = (e: any, id: any) => {
    if (menuFor === id) { setMenuFor(null); return; }
    const btn = e.currentTarget.getBoundingClientRect();
    const list = e.currentTarget.closest('.chat-list')?.getBoundingClientRect();
    setMenuUp(!!list && btn.bottom + 160 > list.bottom);
    setMenuFor(id);
  };
  // 会话 ⋯ 菜单：点菜单外部或按 Esc 关闭（触摸端无 mouseLeave、键盘也要能关）
  useEffect(() => {
    if (menuFor == null) return;
    const onDown = (e: any) => { if (!e.target.closest?.('.convo-actions')) setMenuFor(null); };
    const onKey = (e: any) => { if (e.key === 'Escape') setMenuFor(null); };
    const id = setTimeout(() => { document.addEventListener('pointerdown', onDown); document.addEventListener('keydown', onKey); }, 0);
    return () => { clearTimeout(id); document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuFor]);
  const endRef = useRef<HTMLDivElement | null>(null);
  const imageFile = useRef<HTMLInputElement | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const emojiRef = useRef<HTMLDivElement>(null);
  useDismiss(showEmoji, () => setShowEmoji(false), emojiRef);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  // 私信输入自增高：长消息换行、撑高（修复 codex#1「单行 input 不换行」）
  useEffect(() => {
    const el = textRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }
  }, [text]);

  useEffect(() => { if (!authLoading && !user) setAuthOpen(true); }, [authLoading, user, setAuthOpen]);

  const loadConvos = () => api.get('/messages').then(({ data }) => setConvos(data.conversations)).finally(() => setLoadingList(false));
  const deleteConvo = async (e: any, peerId: any) => {
    e.stopPropagation();
    if (!(await confirmDialog('该会话的全部消息将被删除', { title: '删除该会话？', confirmText: '删除' }))) return;
    try {
      await api.delete(`/messages/${peerId}`);
      setConvos((cs) => cs.filter((c) => c.peer.id !== peerId));
      if (active?.peer.id === peerId) { setActive(null); nav('/messages'); }
      toast.ok('已删除会话');
    } catch (err: any) { toast.err(err.message); }
  };
  const setPref = async (peerId: any, patch: any) => {
    setMenuFor(null);
    try {
      const { data } = await api.post(`/messages/${peerId}/settings`, patch);
      await loadConvos();
      if (patch.pinned !== undefined) toast.ok(data.pinned ? '已置顶会话' : '已取消置顶');
      else toast.ok(data.muted ? '已开启免打扰' : '已关闭免打扰');
    } catch (err: any) { toast.err(err.message); }
  };
  useEffect(() => { if (user) loadConvos(); }, [user]);

  const openChat = async (pid: any) => {
    const { data } = await api.get(`/messages/${pid}`);
    setActive(data);
    try { setText(localStorage.getItem(`haha_msgdraft_${pid}`) || ''); } catch { setText(''); }
    setConvos((cs) => cs.map((c) => c.peer.id === Number(pid) ? { ...c, unread: 0 } : c));
    setTimeout(() => endRef.current?.scrollIntoView(), 50);
  };

  // keep an unsent message per conversation so switching/leaving doesn't lose it
  useEffect(() => {
    if (!active) return;
    const key = `haha_msgdraft_${active.peer.id}`;
    try { text.trim() ? localStorage.setItem(key, text) : localStorage.removeItem(key); } catch {}
  }, [text, active?.peer.id]);
  useEffect(() => { if (peerId && user) openChat(peerId); /* eslint-disable-next-line */ }, [peerId, user]);

  const pushMessage = (msg: any) => {
    setActive((a: any) => ({ ...a, messages: [...a.messages, msg] }));
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 30);
    loadConvos();
  };

  const sendImage = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file || !active) return;
    const fd = new FormData(); fd.append('files', file);
    try {
      const up = await api.post('/upload', fd);
      const url = up.data.files[0]?.url;
      const { data } = await api.post(`/messages/${active.peer.id}`, { content: url, type: 'image' });
      pushMessage(data.message);
    } catch (err: any) { toast.err(err.message); }
    e.target.value = '';
  };

  const send = async () => {
    if (!text.trim() || !active) return;
    try {
      const { data } = await api.post(`/messages/${active.peer.id}`, { content: text });
      pushMessage(data.message);
      setText('');
    } catch (e: any) { toast.err(e.message); }
  };

  if (authLoading) return <Shell right={false}><Loading /></Shell>;
  if (!user) return <Shell right={false}><div className="ui-card"><Empty icon="🔒" text="登录后查看私信" /></div></Shell>;

  return (
    <Shell wide>
      <div className="ui-card page-title" style={{ marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
        <Icon name="mail" size={20} /> 私信
      </div>
      <div className={`ui-card chat-shell${active ? ' has-active' : ''}`} style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: -1 }}>
        <div className="chat-list">
          {loadingList ? <ChatListSkeleton /> : convos.length === 0 ? <div style={{ padding: 24 }}><Empty icon="💬" text="还没有会话"><button className="btn btn-primary btn-sm" onClick={() => nav('/discover')}>找人聊聊</button></Empty></div> :
            convos.map((c) => (
              <div key={c.peer.id} className={`chat-list-item${active?.peer.id === c.peer.id ? ' active' : ''}${c.pinned ? ' pinned' : ''}`} onClick={() => nav(`/messages/${c.peer.id}`)}>
                <Avatar user={c.peer} size={46} showV />
                <div className="chat-li-main">
                  <div className="chat-li-name">
                    <span className="chat-li-nm">
                      {c.pinned && <Icon name="pin" size={12} style={{ color: 'var(--brand)', marginRight: 3, verticalAlign: '-1px' }} />}
                      {c.peer.nickname}
                    </span>
                    <span className="t">{timeAgo(c.last?.created_at)}</span>
                  </div>
                  <div className="chat-li-preview nowrap">
                    {(() => {
                      let draft = '';
                      try { draft = localStorage.getItem(`haha_msgdraft_${c.peer.id}`) || ''; } catch {}
                      if (draft && active?.peer.id !== c.peer.id) return <><span className="draft-tag">[草稿]</span> {draft}</>;
                      return <>{c.muted && <Icon name="bellOff" size={12} style={{ marginRight: 3, verticalAlign: '-1px' }} />}{c.last?.type === 'image' ? '[图片]' : c.last?.content}</>;
                    })()}
                  </div>
                </div>
                {c.unread > 0 && (c.muted
                  ? <span className="convo-mute-dot" title={`${c.unread} 条未读`} />
                  : <span className="nav-dot" style={{ position: 'static', border: 'none' }}>{c.unread}</span>)}
                <div className="convo-actions" onClick={(e) => e.stopPropagation()}>
                  <button className={`convo-menu-btn${menuFor === c.peer.id ? ' open' : ''}`} onClick={(e) => openConvoMenu(e, c.peer.id)} aria-label="会话操作"><Icon name="more" size={16} /></button>
                  {menuFor === c.peer.id && (
                    <div className={`ui-card menu-pop convo-menu-pop${menuUp ? ' up' : ''}`}>
                      <button className="menu-item" onClick={() => setPref(c.peer.id, { pinned: !c.pinned })}><Icon name="pin" size={16} /> {c.pinned ? '取消置顶' : '置顶会话'}</button>
                      <button className="menu-item" onClick={() => setPref(c.peer.id, { muted: !c.muted })}><Icon name={c.muted ? 'bell' : 'bellOff'} size={16} /> {c.muted ? '取消免打扰' : '消息免打扰'}</button>
                      <button className="menu-item danger" onClick={(e) => deleteConvo(e, c.peer.id)}><Icon name="close" size={16} /> 删除会话</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
        </div>

        <div className="chat-window">
          {!active ? (
            <div className="center" style={{ flex: 1, flexDirection: 'column', color: 'var(--ink-4)', gap: 12 }}>
              <span className="empty-ico-tile"><Icon name="mail" size={28} /></span>
              <div>{convos.length === 0 ? '关注感兴趣的人，开启第一段对话' : '选择一个会话开始聊天'}</div>
            </div>
          ) : (
            <>
              <div className="chat-header">
                <button className="back-btn chat-back" onClick={() => { setActive(null); nav('/messages'); }} aria-label="返回会话列表"><Icon name="back" size={19} /></button>
                <Avatar user={active.peer} size={34} showV />
                <UserName user={active.peer} />
              </div>
              <div className="chat-msgs">
                {(() => { const lastMine = active.messages.map((m: any) => m.sender_id).lastIndexOf(user.id); return active.messages.map((m: any, i: number) => {
                  const mine = m.sender_id === user.id;
                  return (
                    <div key={m.id}>
                      <div className={`bubble-row ${mine ? 'me' : 'them'}`}>
                        {!mine && <Avatar user={active.peer} size={32} />}
                        {m.type === 'image'
                          ? <a className="bubble bubble-img" href={m.content} target="_blank" rel="noreferrer"><img src={m.content} alt="" /></a>
                          : <div className="bubble">{m.content}</div>}
                        <span className="bubble-time">{clockTime(m.created_at)}</span>
                      </div>
                      {mine && i === lastMine && <div className="read-receipt">{m.read ? '已读' : '送达'}</div>}
                    </div>
                  );
                }); })()}
                <div ref={endRef} />
              </div>
              <div className="chat-input">
                <button className="chat-img-btn" onClick={() => imageFile.current?.click()} aria-label="发送图片"><Icon name="image" size={20} /></button>
                <div style={{ position: 'relative' }} ref={emojiRef}>
                  <button className="chat-img-btn" onClick={() => setShowEmoji((s) => !s)} aria-label="表情"><Icon name="smile" size={20} /></button>
                  {showEmoji && (
                    <div className="emoji-pop" style={{ bottom: '46px', top: 'auto', left: 0 }}>
                      {CHAT_EMOJIS.map((em) => <button key={em} onClick={() => { setText((t) => t + em); setShowEmoji(false); }}>{em}</button>)}
                    </div>
                  )}
                </div>
                <textarea ref={textRef} rows={1} value={text} onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="输入消息…" />
                <button className="btn btn-primary" onClick={send} disabled={!text.trim()}>发送</button>
              </div>
              <input ref={imageFile} type="file" accept="image/*" hidden onChange={sendImage} />
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
