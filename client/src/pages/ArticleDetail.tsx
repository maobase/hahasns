import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Shell from '../components/Shell';
import Icon from '../components/Icon';
import Avatar from '../components/Avatar';
import RichBody from '../components/RichBody';
import Comments from '../components/Comments';
import CollectModal from '../components/CollectModal';
import { DetailSkeleton, LoadError } from '../components/States';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api/client';
import { confirmDialog } from '../components/confirm';
import { timeAgo, fmtNum } from '../lib/format';
import { usePageTitle } from '../hooks/usePageTitle';
import type { Article, ArticleDetailResponse } from '../types';
import { CAT_META } from './Articles';

const catColor = (cat: string) => CAT_META[cat]?.c || 'var(--brand)';

export default function ArticleDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, setAuthOpen } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [article, setArticle] = useState<Article | null>(null);
  const [related, setRelated] = useState<Article[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);
  const [coverErr, setCoverErr] = useState(false); // 封面外链加载失败时不显示破图
  const [collectOpen, setCollectOpen] = useState(false);
  usePageTitle(article?.title); // 标签页显示文章真实标题（覆盖 Layout 的通用「文章」）

  const load = useCallback(() => {
    setArticle(null); setNotFound(false); setError(false);
    api.get<ArticleDetailResponse>(`/articles/${id}`)
      .then(({ data }) => { setArticle(data.article); setRelated(data.related); })
      .catch((e: any) => { if (e?.status === 404) setNotFound(true); else setError(true); });
  }, [id]);
  useEffect(() => { load(); window.scrollTo(0, 0); }, [load]);

  const toggleLike = async () => {
    if (!user) return setAuthOpen(true);
    if (!article) return;
    try {
      const { data } = await api.post<{ liked: boolean; likeCount: number }>(`/articles/${article.id}/like`);
      setArticle((a) => (a ? { ...a, liked: data.liked, likeCount: data.likeCount } : a));
    } catch (err) { toast.err((err as Error).message); }
  };

  const remove = async () => {
    if (!article || !(await confirmDialog('删除后不可恢复', { title: '删除这篇文章？', confirmText: '删除' }))) return;
    try { await api.delete(`/articles/${article.id}`); toast.ok('已删除'); navigate('/articles'); }
    catch (err) { toast.err((err as Error).message); }
  };

  if (error) return <Shell right={false}><div className="ui-card"><LoadError onRetry={load} /></div></Shell>;
  if (notFound) return <Shell right={false}><div className="ui-card" style={{ padding: 40, textAlign: 'center' }}>文章不存在或已删除。<br /><Link to="/articles" className="haha-btn-app haha-btn-app--primary haha-btn-app--sm" style={{ marginTop: 12 }}>返回专栏</Link></div></Shell>;
  if (!article) return <Shell right={false}><DetailSkeleton /></Shell>;

  const canManage = user && (user.id === article.author.id || user.role === 'admin');

  const right = (
    <div className="ui-card widget">
      <div className="widget-head"><div className="widget-title"><Icon name="book" size={16} className="tk" /> 相关阅读</div></div>
      {related.length === 0 ? <div className="faint" style={{ padding: '6px 2px', fontSize: 12.5 }}>暂无相关文章</div> :
        related.map((r) => (
          <Link to={`/article/${r.id}`} className="art-rel" key={r.id}>
            <span className="art-rel-title">{r.title}</span>
            <span className="art-rel-meta">{r.author.nickname} · {fmtNum(r.views)} 阅读</span>
          </Link>
        ))}
    </div>
  );

  return (
    <Shell right={right}>
      <Link to="/articles" className="art-back"><Icon name="back" size={16} /> 专栏</Link>

      <article className="ui-card art-read">
        {article.cover && !coverErr && <img className="art-read-cover" src={article.cover} alt="" onError={() => setCoverErr(true)} />}
        <div className="art-read-body">
          <span className="art-chip" style={{ '--cc': catColor(article.category) } as React.CSSProperties}>
            <Icon name={CAT_META[article.category]?.icon || 'edit'} size={11} /> {article.category}
          </span>
          <h1 className="art-read-title">{article.title}</h1>

          <div className="art-read-byline">
            <Link to={`/u/${article.author.username}`}><Avatar user={article.author} size={40} showV /></Link>
            <div className="art-byline-info">
              <Link to={`/u/${article.author.username}`} className="art-byline-name">{article.author.nickname}</Link>
              <div className="art-byline-meta">{timeAgo(article.createdAt)} · {article.readMins} 分钟读完 · {fmtNum(article.views)} 阅读</div>
            </div>
            {canManage && <button className="art-del" onClick={remove} title="删除" aria-label="删除文章"><Icon name="trash" size={16} /></button>}
          </div>

          <div className="art-read-content">
            <RichBody text={article.content} />
          </div>

          <div className="art-read-actions">
            <button className={`art-like${article.liked ? ' on' : ''}`} onClick={toggleLike}>
              <Icon name="heart" size={18} /> {article.liked ? '已赞' : '点赞'} {article.likeCount > 0 && <b>{fmtNum(article.likeCount)}</b>}
            </button>
            <button className="art-like" onClick={() => (user ? setCollectOpen(true) : setAuthOpen(true))}>
              <Icon name="grid" size={17} /> 加入专题
            </button>
            <span className="art-read-stat"><Icon name="comment" size={16} /> {fmtNum(article.commentCount)} 评论</span>
          </div>
        </div>
      </article>

      <div className="ui-card art-comments">
        <div className="art-comments-head"><Icon name="comment" size={16} /> 评论 {article.commentCount > 0 && <span className="faint">· {article.commentCount}</span>}</div>
        <Comments articleId={article.id} onCountChange={(delta: number) => setArticle((a) => (a ? { ...a, commentCount: Math.max(0, a.commentCount + delta) } : a))} />
      </div>

      <CollectModal open={collectOpen} onClose={() => setCollectOpen(false)} targetType="article" targetId={article.id} />
    </Shell>
  );
}
