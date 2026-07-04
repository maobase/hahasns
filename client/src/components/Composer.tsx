import { useState, useRef, useEffect, useMemo } from 'react';
import Avatar from './Avatar';
import Icon from './Icon';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useSite } from '../context/SiteContext';
import api from '../api/client';
import { VIS_LABELS } from '../lib/format';
import { shrinkImage } from '../lib/resizeImage';
import { loadDraft, saveDraft, clearDraft as clearDraftStore, hasDraft } from '../lib/draft';
import useMention from '../hooks/useMention';
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
    const fd = new FormData();
    const picked = await Promise.all(files.slice(0, maxImages - media.length).map((f) => shrinkImage(f)));
    picked.forEach((f) => fd.append('files', f));
    try {
      const { data } = await api.post('/upload', fd);
      setMedia((m) => [...m, ...data.files].slice(0, maxImages));
    } catch (err: any) { toast.err(err.message); }
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
        price: vis === 'paid' ? Number(price) : 0,
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
    const file = await shrinkImage(raw);
    const fd = new FormData();
    fd.append('files', file);
    try {
      const { data } = await api.post('/upload', fd);
      const url = data.files?.[0]?.url;
      if (url) insertAtCursor(`\n![图片](${url})\n`);
    } catch (err: any) { toast.err(err.message); }
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
              <input type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)}
                className="inp inp-sm" style={{ width: 96 }} />
              <span className="muted">积分</span>
            </div>
          )}
          {vis === 'password' && (
            <div className="row gap-8" style={{ marginTop: 10, fontSize: 13 }}>
              <span className="muted">访问密码</span>
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="设置查看密码"
                className="inp inp-sm" style={{ width: 170 }} />
            </div>
          )}
          {showLoc && (
            <div className="row gap-8" style={{ marginTop: 10, fontSize: 13 }}>
              <Icon name="location" size={15} style={{ color: 'var(--brand)' }} />
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="所在城市，如：上海" maxLength={20}
                className="inp inp-sm" style={{ width: 210 }} />
              {location && <button className="faint" style={{ fontSize: 12 }} onClick={() => { setLocation(''); setShowLoc(false); }}>清除</button>}
            </div>
          )}
          {poll && (
            <div className="poll-editor">
              <div className="poll-editor-head">
                <span><Icon name="poll" size={15} /> 发起投票</span>
                <button className="faint" style={{ fontSize: 12.5 }} onClick={() => setPoll(null)}>移除</button>
              </div>
              {poll.options.map((opt: any, i: number) => (
                <div className="poll-editor-row" key={i}>
                  <input value={opt} maxLength={60} placeholder={`选项 ${i + 1}`}
                    onChange={(e) => setPoll((p: any) => ({ ...p, options: p.options.map((o: any, j: number) => j === i ? e.target.value : o) }))} />
                  {poll.options.length > 2 && (
                    <button className="poll-editor-rm" title="删除选项"
                      onClick={() => setPoll((p: any) => ({ ...p, options: p.options.filter((_: any, j: number) => j !== i) }))}>
                      <Icon name="close" size={15} />
                    </button>
                  )}
                </div>
              ))}
              <div className="poll-editor-foot">
                {poll.options.length < 6 && (
                  <button className="poll-add" onClick={() => setPoll((p: any) => ({ ...p, options: [...p.options, ''] }))}>
                    <Icon name="plus" size={14} /> 添加选项
                  </button>
                )}
                <div className="spacer" />
                <label className="poll-multi"><input type="checkbox" checked={poll.multi}
                  onChange={(e) => setPoll((p: any) => ({ ...p, multi: e.target.checked }))} /> 多选</label>
                <select className="vis-select" value={poll.days}
                  onChange={(e) => setPoll((p: any) => ({ ...p, days: Number(e.target.value) }))} title="截止时间">
                  <option value={0}>长期</option>
                  <option value={1}>1 天</option>
                  <option value={3}>3 天</option>
                  <option value={7}>7 天</option>
                </select>
              </div>
            </div>
          )}
          {redPacket && (
            <div className="rp-editor">
              <div className="rp-editor-head">
                <span><Icon name="redpacket" size={15} /> 积分红包</span>
                <button className="faint" style={{ fontSize: 12.5 }} onClick={() => setRedPacket(null)}>移除</button>
              </div>
              <div className="rp-editor-row">
                <label className="rp-ef"><span>总积分</span>
                  <input type="number" min={1} value={redPacket.points} onChange={(e) => setRedPacket((r: any) => ({ ...r, points: e.target.value }))} className="inp inp-sm" /></label>
                <label className="rp-ef"><span>红包个数</span>
                  <input type="number" min={1} max={100} value={redPacket.count} onChange={(e) => setRedPacket((r: any) => ({ ...r, count: e.target.value }))} className="inp inp-sm" /></label>
              </div>
              <input className="inp inp-sm rp-ef-bless" maxLength={30} placeholder="祝福语（选填）" value={redPacket.blessing}
                onChange={(e) => setRedPacket((r: any) => ({ ...r, blessing: e.target.value }))} />
              <div className="rp-editor-hint">
                {Number(redPacket.count) > 0 && `${redPacket.count} 个红包随机分配 ${Number(redPacket.points) || 0} 积分，先到先得 · `}
                你当前 {user?.points ?? 0} 积分
              </div>
            </div>
          )}
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
              <button className="btn btn-primary" disabled={busy || (!content.trim() && !media.length && !poll)} onClick={submit}>
                {busy ? '发布中…' : '发布'}
              </button>
            </div>
          </div>
        </>
      )}
      <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" multiple hidden onChange={upload} />
    </div>
  );
}
