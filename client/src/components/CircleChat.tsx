import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import Avatar from './Avatar';
import Icon from './Icon';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { timeAgo } from '../lib/format';
import { useDismiss } from '../lib/useDismiss';

const EMOJIS = '😀 😂 🥰 😍 😎 🤔 😴 😭 😡 👍 👏 🙏 💪 🎉 🔥 ✨ 💯 ❤️ 💔 🌈 ☕ 🍜 🎵 📷 🌙 ⭐ 🐱 🐶 🌸 🍀 🚀 💎'.split(' ');

// 圈子聊天室：成员实时（5s 轮询）群聊。非成员看到加入引导。
export default function CircleChat({ slug, joined, onJoin }: { slug: string; joined: boolean; onJoin: () => void }) {
  const { user, setAuthOpen } = useAuth();
  const toast = useToast();
  const [msgs, setMsgs] = useState<any[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const emojiRef = useRef<HTMLDivElement>(null);
  useDismiss(showEmoji, () => setShowEmoji(false), emojiRef);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const lastIdRef = useRef(0);
  const atBottomRef = useRef(true); // 用户是否停在底部（读历史时为 false）
  const firstRef = useRef(true);
  // 圈子聊天输入自增高：长消息换行、撑高（修复 codex#2「单行 input 不换行」）
  useEffect(() => {
    const el = inputRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }
  }, [text]);

  const onScroll = () => {
    const el = listRef.current;
    if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/circles/${encodeURIComponent(slug)}/chat`);
      if (data.locked) { setLocked(true); setMsgs([]); return; }
      setLocked(false); setMsgs(data.messages);
    } catch { /* 轮询失败保持现状，下次再拉 */ }
  }, [slug]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load, joined]);

  // 新消息到达时滚到底部——但仅在首次加载或用户本就在底部时，读历史消息时不打扰
  useEffect(() => {
    if (!msgs) return;
    const lastId = msgs.length ? msgs[msgs.length - 1].id : 0;
    if (lastId === lastIdRef.current) return;
    lastIdRef.current = lastId;
    const el = listRef.current;
    if (!el) return;
    if (firstRef.current || atBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      atBottomRef.current = true;
    }
    firstRef.current = false;
  }, [msgs]);

  const send = async () => {
    const c = text.trim();
    if (!c || sending) return;
    setSending(true);
    try {
      const { data } = await api.post(`/circles/${encodeURIComponent(slug)}/chat`, { content: c });
      setText('');
      atBottomRef.current = true; // 自己发的消息总是滚到底部
      setMsgs((m) => [...(m || []), data.message]);
    } catch (e: any) { toast.err(e.message); }
    finally { setSending(false); }
  };

  const insertEmoji = (em: string) => {
    setText((t) => t + em);
    setShowEmoji(false);
    inputRef.current?.focus();
  };

  if (locked) {
    return (
      <div className="ui-card">
        <div className="cchat-locked">
          <Icon name="lock" size={26} />
          <div>加入圈子后即可参与群聊</div>
          <button className="btn btn-primary btn-sm" onClick={() => (user ? onJoin() : setAuthOpen(true))}>加入圈子</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ui-card cchat">
      <div className="cchat-list" ref={listRef} onScroll={onScroll}>
        {msgs === null ? (
          <div className="cchat-empty"><span className="ui-spinner" /></div>
        ) : msgs.length === 0 ? (
          <div className="cchat-empty">还没有人说话，来开个头吧 👋</div>
        ) : (
          msgs.map((m) => {
            const mine = user && m.author && m.author.id === user.id;
            return (
              <div key={m.id} className={`cchat-msg${mine ? ' mine' : ''}`}>
                <Link to={`/u/${m.author?.username}`} aria-label={m.author?.nickname}><Avatar user={m.author} size={34} noLink /></Link>
                <div className="cchat-bubble-wrap">
                  <div className="cchat-meta">
                    <span className="cchat-name nowrap">{m.author?.nickname}</span>
                    <span className="cchat-time">{timeAgo(m.createdAt)}</span>
                  </div>
                  <div className="cchat-bubble">{m.content}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="cchat-input">
        <div className="cchat-emoji-wrap" ref={emojiRef}>
          <button className="tool" type="button" onClick={() => setShowEmoji((s) => !s)} aria-label="表情"><Icon name="smile" size={19} /></button>
          {showEmoji && (
            <div className="emoji-pop emoji-pop-up">
              {EMOJIS.map((em) => <button key={em} type="button" onClick={() => insertEmoji(em)}>{em}</button>)}
            </div>
          )}
        </div>
        <textarea ref={inputRef} rows={1} value={text} maxLength={1000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          onFocus={() => setShowEmoji(false)}
          placeholder="说点什么…（Enter 发送，Shift+Enter 换行）" />
        <button className="btn btn-primary" onClick={send} disabled={sending || !text.trim()} aria-label="发送"><Icon name="send" size={16} /></button>
      </div>
    </div>
  );
}
