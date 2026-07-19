import { useState, useEffect, useRef, useCallback } from 'react';
import Shell from '../components/Shell';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { Empty, Loading, ChatListSkeleton } from '../components/States';
import AiMarkdown from '../components/AiMarkdown';
import { Spinner, Textarea } from '../components/heroui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api/client';
import { confirmDialog } from '../components/confirm';
import { timeAgo } from '../lib/format';
import { copyText } from '../lib/clipboard';

// Pre-fill prompts for the empty state. Restrained, real copy.
const SUGGESTIONS = [
  { icon: 'edit', title: '润色动态', text: '帮我润色一条想发的动态，让它更自然有趣：' },
  { icon: 'spark', title: '话题灵感', text: '给我三个今天能发的话题灵感，适合轻松随手分享的那种。' },
  { icon: 'gift', title: '玩转社区', text: '怎么用积分商城和签到？积分都能换些什么？' },
  { icon: 'users', title: '逛逛圈子', text: '推荐几个适合摸鱼看的圈子，最好有点意思。' },
];

// An assistant avatar tile (brand-gradient sparkle) — stable identity for the bot.
function AiAvatar({ size = 32 }: { size?: number }) {
  return (
    <span className="ai-avatar" style={{ width: size, height: size }} aria-hidden>
      <Icon name="spark" size={Math.round(size * 0.58)} fill />
    </span>
  );
}

export default function AIChat() {
  const { user, loading: authLoading, setAuthOpen } = useAuth();
  const toast = useToast();

  const [status, setStatus] = useState<any>(null);            // { configured, defaultModel, models }
  const [model, setModel] = useState('');
  const [modelOpen, setModelOpen] = useState(false);

  const [convos, setConvos] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeId, setActiveId] = useState<any>(null);        // null => empty / new-chat view
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);

  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [menuFor, setMenuFor] = useState<any>(null);
  const [menuUp, setMenuUp] = useState(false);
  // flip the conversation ⋯ menu upward when a downward one would clip past the list bottom
  const openConvoMenu = (e: any, id: any) => {
    if (menuFor === id) { setMenuFor(null); return; }
    const btn = e.currentTarget.getBoundingClientRect();
    const list = e.currentTarget.closest('.chat-list')?.getBoundingClientRect();
    setMenuUp(!!list && btn.bottom + 90 > list.bottom);
    setMenuFor(id);
  };
  const [mobileList, setMobileList] = useState(false);   // mobile: show list pane instead of window
  const [copiedId, setCopiedId] = useState<any>(null);

  const endRef = useRef<HTMLDivElement | null>(null);
  const msgsRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { if (!authLoading && !user) setAuthOpen(true); }, [authLoading, user, setAuthOpen]);

  // status + model picker default
  useEffect(() => {
    api.get('/ai/status').then(({ data }) => {
      setStatus(data);
      setModel(data.defaultModel || Object.keys(data.models || {})[0] || '');
    }).catch(() => {});
  }, []);

  const loadConvos = useCallback(() => {
    return api.get('/ai/conversations')
      .then(({ data }) => setConvos(data.conversations || []))
      .finally(() => setLoadingList(false));
  }, []);
  useEffect(() => { if (user) loadConvos(); }, [user, loadConvos]);

  // scroll only the messages container (never the whole page)
  const scrollToEnd = (smooth?: boolean) =>
    setTimeout(() => {
      const c = msgsRef.current;
      if (c) c.scrollTo({ top: c.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    }, 30);

  const openConvo = async (id: any) => {
    setMenuFor(null);
    setMobileList(false);
    if (id === activeId) return;
    setActiveId(id);
    setLoadingThread(true);
    setStreamText('');
    try {
      const { data } = await api.get(`/ai/conversations/${id}`);
      setMessages(data.messages || []);
      scrollToEnd();
    } catch (e: any) { toast.err(e.message); }
    finally { setLoadingThread(false); }
  };

  const newChat = () => {
    if (streaming) return;
    setMenuFor(null);
    setMobileList(false);
    setActiveId(null);
    setMessages([]);
    setStreamText('');
    setTimeout(() => taRef.current?.focus(), 30);
  };

  const deleteConvo = async (e: any, id: any) => {
    e.stopPropagation();
    if (!(await confirmDialog('删除后不可恢复', { title: '删除该会话？', confirmText: '删除' }))) return;
    try {
      await api.delete(`/ai/conversations/${id}`);
      setConvos((cs) => cs.filter((c) => c.id !== id));
      if (activeId === id) newChat();
      toast.ok('已删除会话');
    } catch (err: any) { toast.err(err.message); }
  };

  // Auto-grow the composer textarea up to a cap.
  const autoGrow = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  };
  useEffect(() => { autoGrow(); }, [text]);

  // Stream a reply: create a conversation lazily on the first message of a new chat.
  const send = async () => {
    const content = text.trim();
    if (!content || streaming) return;

    let convId = activeId;
    let createdNew = false;
    try {
      if (!convId) {
        const { data } = await api.post('/ai/conversations');
        convId = data.conversation.id;
        createdNew = true;
        setActiveId(convId);
      }
    } catch (e: any) { toast.err(e.message); return; }

    const userMsg = { id: `u-${Date.now()}`, role: 'user', content, created_at: new Date().toISOString() };
    setMessages((m) => [...m, userMsg]);
    setText('');
    setStreaming(true);
    setStreamText('');
    scrollToEnd(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let acc = '';
    let errored = false;

    try {
      const resp = await fetch(`/api/ai/conversations/${convId}/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('haha_token')}`,
        },
        body: JSON.stringify({ content, model }),
        signal: controller.signal,
      });
      if (!resp.ok || !resp.body) throw new Error(`AI 服务暂时不可用（${resp.status}）`);

      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let event = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('event:')) { event = line.slice(6).trim(); continue; }
          if (!line.startsWith('data:')) continue;
          let payload: any = {};
          try { payload = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (event === 'delta' && payload.text) {
            acc += payload.text;
            setStreamText(acc);
            scrollToEnd();
          } else if (event === 'error') {
            errored = true;
            toast.err(payload.error || 'AI 回复失败');
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') { errored = true; toast.err(e.message); }
    } finally {
      abortRef.current = null;
      // commit the streamed text as a real assistant message
      if (acc) {
        setMessages((m) => [...m, { id: `a-${Date.now()}`, role: 'assistant', content: acc, created_at: new Date().toISOString() }]);
      }
      setStreamText('');
      setStreaming(false);
      // refresh the list so titles / ordering update (esp. for a brand-new chat)
      if (createdNew || !errored) loadConvos();
      scrollToEnd(true);
    }
  };

  const onKeyDown = (e: any) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const useSuggestion = (s: any) => {
    setText(s.text);
    setTimeout(() => { taRef.current?.focus(); autoGrow(); }, 20);
  };

  const copyMsg = async (m: any) => {
    if (await copyText(m.content)) {
      setCopiedId(m.id);
      setTimeout(() => setCopiedId((c: any) => (c === m.id ? null : c)), 1600);
    } else { toast.err('复制失败，请手动选择文本'); }
  };

  if (authLoading) return <Shell right={false}><Loading /></Shell>;
  if (!user) return <Shell right={false}><div className="ui-card"><Empty icon="🔒" text="登录后使用 AI 助手" /></div></Shell>;

  const hasThread = activeId != null;
  const models = status?.models || {};
  const showThread = hasThread && (messages.length > 0 || streaming || streamText || loadingThread);

  return (
    <Shell wide>
      <div className={`ui-card chat-shell ai-shell${mobileList ? '' : ' has-active'}`}>
        {/* ── Left: conversation list ── */}
        <div className="chat-list ai-list">
          <div className="ai-list-top">
            <button className="btn btn-primary btn-block ai-newchat" onClick={newChat} disabled={streaming}>
              <Icon name="plus" size={16} /> 新对话
            </button>
          </div>
          {loadingList ? <ChatListSkeleton /> : convos.length === 0 ? (
            <div style={{ padding: '8px 16px' }}>
              <div className="ai-list-hint">还没有对话，从右侧开始第一次提问吧。</div>
            </div>
          ) : convos.map((c) => (
            <div
              key={c.id}
              className={`chat-list-item ai-li${activeId === c.id ? ' active' : ''}`}
              onClick={() => openConvo(c.id)}
            >
              <span className="ai-li-ico"><Icon name="comment" size={16} /></span>
              <div className="chat-li-main">
                <div className="chat-li-name">
                  <span className="chat-li-nm">{c.title || '新对话'}</span>
                  <span className="t">{timeAgo(c.updated_at || c.created_at)}</span>
                </div>
              </div>
              <div className="convo-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className={`convo-menu-btn${menuFor === c.id ? ' open' : ''}`}
                  onClick={(e) => openConvoMenu(e, c.id)}
                  aria-label="对话操作"
                ><Icon name="more" size={16} /></button>
                {menuFor === c.id && (
                  <div className={`ui-card menu-pop convo-menu-pop${menuUp ? ' up' : ''}`} onMouseLeave={() => setMenuFor(null)}>
                    <button className="menu-item danger" onClick={(e) => deleteConvo(e, c.id)}>
                      <Icon name="trash" size={16} /> 删除对话
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Right: thread + composer ── */}
        <div className="chat-window ai-window">
          <div className="chat-header ai-header">
            <button className="back-btn chat-back" onClick={() => setMobileList(true)} aria-label="返回对话列表"><Icon name="back" size={19} /></button>
            <AiAvatar size={30} />
            <div className="ai-header-txt">
              <b>HahaSNS 智能助手</b>
              {status && (
                <span className={`ai-status-dot${status.configured ? ' on' : ''}`}>
                  {status.configured ? '在线' : '演示模式'}
                </span>
              )}
            </div>
          </div>

          <div className="chat-msgs ai-msgs" ref={msgsRef}>
            {!showThread ? (
              <div className="ai-empty">
                <span className="ai-empty-ico"><Icon name="spark" size={30} fill /></span>
                <h2 className="ai-empty-title">嗨，我是 HahaSNS 智能助手</h2>
                <p className="ai-empty-sub">帮你润色动态、找话题灵感、解答社区玩法。试试下面这些，或直接开始打字。</p>
                <div className="ai-suggest-grid">
                  {SUGGESTIONS.map((s) => (
                    <button key={s.title} className="ai-suggest" onClick={() => useSuggestion(s)}>
                      <span className="ai-suggest-ico"><Icon name={s.icon} size={18} /></span>
                      <span className="ai-suggest-body">
                        <span className="ai-suggest-title">{s.title}</span>
                        <span className="ai-suggest-text">{s.text}</span>
                      </span>
                    </button>
                  ))}
                </div>
                {status && !status.configured && (
                  <div className="ai-demo-notice">
                    <Icon name="help" size={15} />
                    <span>当前为演示模式，服务端未配置 ANTHROPIC_API_KEY，回复为占位内容。配置后即可获得真实回答。</span>
                  </div>
                )}
              </div>
            ) : loadingThread ? (
              <Loading />
            ) : (
              <>
                {messages.map((m) => (
                  <div key={m.id} className={`ai-row ${m.role === 'user' ? 'me' : 'bot'}`}>
                    {m.role === 'assistant' && <AiAvatar size={32} />}
                    {m.role === 'user' && <Avatar user={user} size={32} />}
                    <div className={`ai-bubble${m.role === 'assistant' ? ' md' : ''}`}>
                      {m.role === 'assistant' ? <AiMarkdown text={m.content} /> : m.content}
                      {m.role === 'assistant' && m.content && (
                        <button className={`ai-copy${copiedId === m.id ? ' done' : ''}`} onClick={() => copyMsg(m)} aria-label="复制回复">
                          {copiedId === m.id
                            ? <><Icon name="check" size={13} /> 已复制</>
                            : <><Icon name="copy" size={13} /> 复制</>}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {streaming && (
                  <div className="ai-row bot">
                    <AiAvatar size={32} />
                    <div className="ai-bubble">
                      {streamText
                        ? <>{streamText}<span className="ai-caret" /></>
                        : <span className="ai-typing"><i /><i /><i /></span>}
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </>
            )}
          </div>

          <div className="ai-composer">
            <div className="ai-composer-tools">
              {/* model picker */}
              <div className="ai-model" onClick={(e) => e.stopPropagation()}>
                <button className="ai-model-btn" onClick={() => setModelOpen((o) => !o)} disabled={streaming}>
                  <Icon name="spark" size={14} />
                  <span>{models[model] || '模型'}</span>
                  <Icon name="back" size={13} className="ai-model-caret" />
                </button>
                {modelOpen && (
                  <div className="ui-card menu-pop ai-model-pop" onMouseLeave={() => setModelOpen(false)}>
                    {Object.entries(models).map(([id, label]) => (
                      <button
                        key={id}
                        className={`menu-item${id === model ? ' active' : ''}`}
                        onClick={() => { setModel(id); setModelOpen(false); }}
                      >
                        {label as any}
                        {id === model && <Icon name="check" size={15} style={{ marginLeft: 'auto' }} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="ai-composer-hint">Enter 发送 · Shift+Enter 换行</span>
            </div>
            <div className="ai-composer-row">
              <Textarea
                ref={taRef}
                className="haha-inp ai-textarea"
                value={text}
                onChange={(e: any) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="问点什么，或让我帮你润色一条动态…"
                minRows={1}
              />
              <button className="ai-send" onClick={send} disabled={!text.trim() || streaming} aria-label="发送">
                {streaming ? <Spinner size="sm" color="current" /> : <Icon name="send" size={18} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
