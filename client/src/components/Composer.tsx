import { useState, useRef, useEffect, useMemo } from 'react';
import Avatar from './Avatar';
import Icon from './Icon';
import PollEditor from './composer/PollEditor';
import RedPacketEditor from './composer/RedPacketEditor';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useSite } from '../context/SiteContext';
import api from '../api/client';
import { VIS_LABELS } from '../lib/format';
import { uploadPickedFiles } from '../lib/upload';
import { loadDraft, saveDraft, clearDraft as clearDraftStore, hasDraft } from '../lib/draft';
import useMention from '../hooks/useMention';
import { Input, Button } from './heroui';
import { onCtrlEnter } from '../lib/kbd';

const EMOJIS = '😀 😂 🥰 😍 😎 🤔 😴 😭 😡 👍 👏 🙏 💪 🎉 🔥 ✨ 💯 ❤️ 💔 🌈 ☕ 🍜 🎵 📷 🌙 ⭐ 🐱 🐶 🌸 🍀 🚀 💎'.split(' ');

export interface ComposerProps {
  onPosted?: (post: any) => void;
  compact?: boolean;
  prefill?: string;
  embedded?: boolean;
  circleId?: number | null;
  placeholder?: string;
}

export default function Composer({ onPosted, compact = false, prefill = '', embedded = false, circleId = null, placeholder = '' }: ComposerProps) {
  const { user, setAuthOpen } = useAuth();
  const toast = useToast();
  // 恢复结构化草稿（文本 + 图片 + 投票 + 可见性 + 位置）；有 prefill（转发/圈子预填）时不读草稿
  const initialDraft = useMemo(() => (prefill ? null : loadDraft()), [prefill]);
  const [content, setContent] = useState<string>(() => initialDraft?.content ?? prefill ?? '');
  const [media, setMedia] = useState<any[]>(() => initialDraft?.media ?? []);
  const maxImages = useSite().uploadMaxImages;
  const maxSizeMb = useSite().uploadMaxSizeMb;
  const paidPriceMax = useSite().paidPriceMax;
  const [vis, setVis] = useState(() => initialDraft?.vis ?? 'public');
  const [price, setPrice] = useState<any>(50);
  const [password, setPassword] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(embedded);
  const [location, setLocation] = useState(() => initialDraft?.location ?? user?.location ?? '');
  const [showLoc, setShowLoc] = useState(() => !!initialDraft?.location);
  const [poll, setPoll] = useState<any>(() => initialDraft?.poll ?? null); // { options: [], multi, days }
  const [redPacket, setRedPacket] = useState<any>(null); // { points, count, blessing } — 不持久化（含积分，避免误恢复）
  const [draftRestored, setDraftRestored] = useState(() => !prefill && hasDraft());
  const [savedHint, setSavedHint] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const inlineImgRef = useRef<HTMLInputElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const mention = useMention(content, setContent, taRef);

  // persist a structured draft so an unsent post (文本+图片+投票+可见性+位置) survives navigation / reload (防误触丢失)
  useEffect(() => {
    setSavedHint(saveDraft({ content, media, vis, poll, location }));
  }, [content, media, vis, poll, location]);
  const clearDraft = () => { clearDraftStore(); setContent(''); setMedia([]); setPoll(null); setVis('public'); setDraftRestored(false); setSavedHint(false); };

  if (!user) {
    return (
      <div className="ui-card composer center" style={{ padding: 22, cursor: 'pointer' }} onClick={() => setAuthOpen(true)}
        role="button" tabIndex={0} aria-label="登录后分享你的第一条动态"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAuthOpen(true); } }}>
        <span className="muted">登录后分享你的第一条动态 →</span>
      </div>
    );
  }

  const mediaType = media.some((m) => m.type === 'video') ? 'video'
    : media.some((m) => m.type === 'audio') ? 'music'
    : media.length ? 'image' : 'text';

  const grow = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    const el = e.target; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px';
    mention.scan(el.value, el.selectionStart);
  };

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files as any)];
    if (!files.length) return;
    const uploaded = await uploadPickedFiles(files, { maxSizeMb, remaining: maxImages - media.length, onErr: toast.err });
    if (uploaded.length) setMedia((m) => [...m, ...uploaded].slice(0, maxImages));
    e.target.value = '';
  };

  const insertEmoji = (em: string) => {
    setContent((c) => c + em);
    setShowEmoji(false);
    taRef.current?.focus();
  };

  const submit = async () => {
    const pollOpts = poll ? poll.options.map((o: any) => o.trim()).filter(Boolean) : null;
    if (poll && (!pollOpts || pollOpts.length < 2)) return toast.err('投票至少需要 2 个选项');
    if (redPacket) {
      const pts = Number(redPacket.points) || 0, cnt = Number(redPacket.count) || 0;
      if (cnt < 1) return toast.err('红包个数至少 1 个');
      if (pts < cnt) return toast.err(`${cnt} 个红包至少需要 ${cnt} 积分`);
      if ((user?.points || 0) < pts) return toast.err('积分不足，发不出这么大的红包');
    }
    if (!content.trim() && !media.length && !pollOpts && !redPacket) return toast.err('说点什么或添加图片吧');
    setBusy(true);
    try {
      const device = /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent) ? '手机端' : '电脑端';
      const { data } = await api.post('/posts', {
        content, media, mediaType, visibility: vis,
        price: vis === 'paid' ? Math.min(Number(price) || 0, paidPriceMax) : 0,
        password: vis === 'password' ? password : '',
        location: location.trim(), device,
        ...(circleId ? { circleId } : {}),
        ...(pollOpts ? { poll: { options: pollOpts, multi: poll.multi, days: poll.days } } : {}),
        ...(redPacket ? { redPacket: { points: Number(redPacket.points) || 0, count: Number(redPacket.count) || 0, blessing: redPacket.blessing } } : {}),
      });
      setContent(''); setMedia([]); setVis('public'); setFocused(false); setShowLoc(false); setPoll(null); setRedPacket(null);
      clearDraftStore(); setDraftRestored(false);
      if (taRef.current) taRef.current.style.height = 'auto';
      toast.ok('发布成功 🎉');
      onPosted?.(data.post);
    } catch (err: any) { toast.err(err.message); }
    finally { setBusy(false); }
  };

  const resizeTa = (ta: HTMLTextAreaElement) => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; };

  // wrap the current textarea selection with markdown markers (加粗/删除线/代码)
  const format = (mark: string, end: string = mark) => {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart ?? content.length;
    const e = ta.selectionEnd ?? content.length;
    const sel = content.slice(s, e) || '文字';
    const next = content.slice(0, s) + mark + sel + end + content.slice(e);
    setContent(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = s + mark.length;
      ta.selectionEnd = s + mark.length + sel.length;
      resizeTa(ta);
    });
  };

  // prepend a block marker (标题 ## / 列表 - / 引用 >) to the start of the current line
  const prefixLine = (prefix: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart ?? content.length;
    const lineStart = content.lastIndexOf('\n', s - 1) + 1;
    const next = content.slice(0, lineStart) + prefix + content.slice(lineStart);
    setContent(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = s + prefix.length;
      resizeTa(ta);
    });
  };

  // insert a markdown link [文字](url), cursor landing on the url so it can be typed over
  const insertLink = () => {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart ?? content.length;
    const e = ta.selectionEnd ?? content.length;
    const sel = content.slice(s, e) || '链接文字';
    const snippet = `[${sel}](https://)`;
    const next = content.slice(0, s) + snippet + content.slice(e);
    setContent(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = s + sel.length + 3;       // just after "]("
      ta.selectionEnd = s + snippet.length - 1;     // just before ")"
      resizeTa(ta);
    });
  };

  // 在光标处插入一段文本（图片 markdown 等），插入后光标落在末尾
  const insertAtCursor = (snippet: string) => {
    const ta = taRef.current;
    const s = ta?.selectionStart ?? content.length;
    const e = ta?.selectionEnd ?? content.length;
    const next = content.slice(0, s) + snippet + content.slice(e);
    setContent(next);
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      ta.selectionStart = ta.selectionEnd = s + snippet.length;
      resizeTa(ta);
    });
  };

  // 上传一张图片并在正文光标处插入 ![](url)，实现正文内联配图
  const uploadInline = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const raw = (ev.target.files || [])[0];
    if (!raw) return;
    const uploaded = await uploadPickedFiles([raw], { maxSizeMb, remaining: 1, onErr: toast.err, single: true });
    const url = uploaded[0]?.url;
    if (url) insertAtCursor(`\n![图片](${url})\n`);
    ev.target.value = '';
  };

  return (
    <div className={embedded ? 'composer composer-embedded' : 'ui-card composer'}>
      <div className="composer-top">
        <Avatar user={user} size={44} />
        <div style={{ flex: 1, position: 'relative' }}>
          {draftRestored && content && (
            <div className="composer-draft-note">
              <span><Icon name="clock" size={13} /> 已恢复上次未发布的草稿</span>
              <button type="button" onClick={clearDraft}>清除</button>
            </div>
          )}
          <textarea
            ref={taRef}
            maxLength={20000}
            value={content}
            onChange={grow}
            onKeyDown={onCtrlEnter(submit, mention.onKeyDown)}
            onBlur={() => setTimeout(mention.close, 120)}
            onFocus={() => setFocused(true)}
            placeholder={placeholder || (user ? `${user.nickname}，分享你的新鲜事…（可 @好友、加 #话题#）` : '分享新鲜事…')}
            rows={focused || content ? 2 : 1}
          />
          {mention.dropdown}
          {!!media.length && (
            <div className="composer-preview">
              {media.map((m, i) => (
                <div className="pv" key={i}>
                  {m.type === 'image'
                    ? <img src={m.url} alt="" />
                    : <div className="center" style={{ height: '100%', color: 'var(--ink-3)' }}><Icon name={m.type === 'video' ? 'video' : 'music'} size={26} /></div>}
                  <button className="rm" onClick={() => setMedia((a) => a.filter((_, j) => j !== i))} aria-label="移除"><Icon name="close" size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {(focused || content || media.length > 0 || poll || redPacket) && (
        <>
          {vis === 'paid' && (
            <div className="row gap-8" style={{ marginTop: 10, fontSize: 13 }}>
              <span className="muted">解锁价格</span>
              <Input type="number" min={1} max={paidPriceMax} value={price} onChange={(e: any) => setPrice(e.target.value)}
                className="haha-inp haha-inp-sm" style={{ width: 96 }} />
              <span className="muted">积分</span>
            </div>
          )}
          {vis === 'password' && (
            <div className="row gap-8" style={{ marginTop: 10, fontSize: 13 }}>
              <span className="muted">访问密码</span>
              <Input value={password} onChange={(e: any) => setPassword(e.target.value)} placeholder="设置查看密码"
                className="haha-inp haha-inp-sm" style={{ width: 170 }} />
            </div>
          )}
          {showLoc && (
            <div className="row gap-8" style={{ marginTop: 10, fontSize: 13 }}>
              <Icon name="location" size={15} style={{ color: 'var(--brand)' }} />
              <Input value={location} onChange={(e: any) => setLocation(e.target.value)} placeholder="所在城市，如：上海" maxLength={20}
                className="haha-inp haha-inp-sm" style={{ width: 210 }} />
              {location && <button className="faint" style={{ fontSize: 12 }} onClick={() => { setLocation(''); setShowLoc(false); }}>清除</button>}
            </div>
          )}
          {poll && <PollEditor value={poll} onChange={setPoll} />}
          {redPacket && <RedPacketEditor value={redPacket} onChange={setRedPacket} userPoints={user?.points ?? 0} />}
          <div className="composer-bar">
            <button className="tool" onClick={() => fileRef.current?.click()} title="图片"><Icon name="image" size={19} /></button>
            <button className="tool" onClick={() => fileRef.current?.click()} title="视频"><Icon name="video" size={19} /></button>
            <button className={`tool${poll ? ' on' : ''}`} title="投票" style={poll ? { color: 'var(--brand)' } : undefined}
              onClick={() => setPoll((p: any) => p ? null : { options: ['', ''], multi: false, days: 0 })}><Icon name="poll" size={19} /></button>
            <button className={`tool${redPacket ? ' on' : ''}`} title="积分红包" style={redPacket ? { color: 'var(--gold-deep)' } : undefined}
              onClick={() => setRedPacket((r: any) => r ? null : { points: 88, count: 8, blessing: '恭喜发财，大吉大利' })}><Icon name="redpacket" size={19} /></button>
            <div style={{ position: 'relative' }}>
              <button className="tool" onClick={() => setShowEmoji((s) => !s)} title="表情"><Icon name="smile" size={19} /></button>
              {showEmoji && (
                <div className="emoji-pop">
                  {EMOJIS.map((em) => <button key={em} onClick={() => insertEmoji(em)}>{em}</button>)}
                </div>
              )}
            </div>
            <button className={`tool${showLoc && location ? ' on' : ''}`} onClick={() => setShowLoc((s) => !s)} title="所在位置" style={showLoc && location ? { color: 'var(--brand)' } : undefined}><Icon name="location" size={19} /></button>
            <select className="vis-select" value={vis} onChange={(e) => setVis(e.target.value)} title="可见范围">
              {Object.entries(VIS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{(v as any).label}</option>
              ))}
            </select>
            <div className="composer-submit">
              {savedHint && <span className="composer-saved"><Icon name="check" size={11} /> 已存草稿</span>}
              <span className="faint num" style={{ fontSize: 12 }}>{content.length}/1000</span>
              <Button color="primary" className="haha-btn-app" isDisabled={busy || (!content.trim() && !media.length && !poll)} onClick={submit}>
                {busy ? '发布中…' : '发布'}
              </Button>
            </div>
          </div>
        </>
      )}
      <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" multiple hidden onChange={upload} />
    </div>
  );
}
