import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Shell from '../components/Shell';
import Icon from '../components/Icon';
import MarkdownToolbar from '../components/MarkdownToolbar';
import RichBody from '../components/RichBody';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Input, Button } from '../components/heroui';
import api from '../api/client';
import type { Article } from '../types';
import { CAT_META } from './Articles';
import { onCtrlEnter } from '../lib/kbd';

const CATEGORIES = ['综合', '技术', '设计', '产品', '生活', '观点'];

export default function WriteArticle() {
  const { user, setAuthOpen } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('综合');
  const [cover, setCover] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [preview, setPreview] = useState(false);

  if (!user) {
    return (
      <Shell narrow>
        <div className="ui-card" style={{ padding: 40, textAlign: 'center' }}>
          登录后即可发表专栏文章。
          <div><Button size="sm" color="primary" className="haha-btn-app" style={{ marginTop: 12 }} onClick={() => setAuthOpen(true)}>登录 / 注册</Button></div>
        </div>
      </Shell>
    );
  }

  const canPublish = title.trim().length >= 2 && content.trim().length >= 10;

  const publish = async () => {
    if (!canPublish || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post<{ article: Article }>('/articles', {
        title: title.trim(), category, cover: cover.trim(), summary: summary.trim(), content: content.trim(),
      });
      toast.ok('文章已发布');
      navigate(`/article/${data.article.id}`);
    } catch (err) { toast.err((err as Error).message); setBusy(false); }
  };

  return (
    <Shell narrow>
      <div className="art-back-row">
        <Link to="/articles" className="art-back"><Icon name="back" size={16} /> 专栏</Link>
      </div>

      <div className="ui-card art-editor">
        <input className="art-ed-title" placeholder="标题" value={title} maxLength={60}
          onChange={(e) => setTitle(e.target.value)} />

        <div className="art-ed-cats">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className={`art-cat-chip${category === c ? ' on' : ''}`}
              onClick={() => setCategory(c)} style={{ '--cc': CAT_META[c]?.c || 'var(--brand)' } as React.CSSProperties}>
              <Icon name={CAT_META[c]?.icon || 'edit'} size={14} /> {c}
            </button>
          ))}
        </div>

        <label className="art-ed-field">
          <span className="art-ed-label"><Icon name="image" size={14} /> 封面图链接（选填）</span>
          <Input className="haha-inp" placeholder="https://… 留空将使用分类配色封面" value={cover} onChange={(e: any) => setCover(e.target.value)} />
        </label>

        <div className="row gap-8 art-ed-toolbar" style={{ justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 8px' }}>
          <MarkdownToolbar taRef={taRef} value={content} onChange={setContent} />
          <Button type="button" size="sm" variant="flat" className="haha-btn-app" style={{ padding: '3px 12px', fontSize: 12.5, flex: 'none' }} onClick={() => setPreview((p) => !p)}>{preview ? '继续编辑' : '预览'}</Button>
        </div>
        {preview ? (
          <div className="art-ed-body" style={{ overflowY: 'auto' }}>
            {content.trim() ? <RichBody text={content} /> : <span className="faint">这里预览 Markdown 渲染效果…</span>}
          </div>
        ) : (
          <textarea ref={taRef} className="art-ed-body" onKeyDown={onCtrlEnter(publish)} placeholder="开始写正文…支持 Markdown（标题 / 列表 / 引用 / 代码 / 链接 / 图片）、@提及、#话题#，空行分段。" value={content}
            onChange={(e) => setContent(e.target.value)} />
        )}

        <label className="art-ed-field">
          <span className="art-ed-label"><Icon name="edit" size={14} /> 摘要（选填，留空自动截取）</span>
          <Input className="haha-inp" placeholder="一句话概括这篇文章" value={summary} maxLength={120} onChange={(e: any) => setSummary(e.target.value)} />
        </label>

        <div className="art-ed-footer">
          <span className="art-ed-count">
            {content.length} 字
            {!canPublish && (title.trim() !== '' || content.trim() !== '') && (
              <span style={{ marginLeft: 10, color: 'var(--danger, #d64545)', fontWeight: 600 }}>
                · {title.trim().length < 2 ? '标题至少 2 个字' : '正文至少 10 个字'}
              </span>
            )}
          </span>
          <div className="row gap-8">
            <Link to="/articles" className="haha-btn-app haha-btn-app--ghost">取消</Link>
            <Button color="primary" className="haha-btn-app" onClick={publish} isDisabled={!canPublish || busy}>
              {/* 内联尺寸：v3 .button 会强制内部 svg 16px，基线此图标为 15px，钉住保持像素一致 */}
              <Icon name="send" size={15} style={{ width: 15, height: 15 }} /> {busy ? '发布中…' : '发布'}
            </Button>
          </div>
        </div>
      </div>
    </Shell>
  );
}
