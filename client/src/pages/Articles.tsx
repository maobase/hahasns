import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell';
import Icon from '../components/Icon';
import Avatar from '../components/Avatar';
import { Empty, ArticleListSkeleton, ListEnd, LoadError } from '../components/States';
import { useAuth } from '../context/AuthContext';
import useInfiniteScroll from '../hooks/useInfiniteScroll';
import api from '../api/client';
import { fmtNum } from '../lib/format';
import type { Article, ArticleListResponse, ArticleCategoryCount } from '../types';

type SortKey = 'new' | 'hot';

export const CAT_META: Record<string, { c: string; icon: string }> = {
  综合: { c: '#2b54f0', icon: 'grid' },
  技术: { c: '#0891b2', icon: 'code' },
  设计: { c: '#7c3aed', icon: 'palette' },
  产品: { c: '#ef9f1e', icon: 'rocket' },
  生活: { c: '#14b269', icon: 'smile' },
  观点: { c: '#e11d6b', icon: 'comment' },
};
const catColor = (cat: string) => CAT_META[cat]?.c || 'var(--brand)';
const catIcon = (cat: string) => CAT_META[cat]?.icon || 'edit';

function Cover({ article, big = false }: { article: Article; big?: boolean }) {
  const [err, setErr] = useState(false);
  if (article.cover && !err) {
    return <img className={`art-cover${big ? ' big' : ''}`} src={article.cover} alt="" loading="lazy" onError={() => setErr(true)} />;
  }
  // gradient placeholder keyed to the category color (cover 缺失或加载失败都走这里，不出现破图)
  return (
    <div className={`art-cover ph${big ? ' big' : ''}`} style={{ '--cc': catColor(article.category) } as React.CSSProperties}>
      <Icon name={catIcon(article.category)} size={big ? 40 : 24} />
    </div>
  );
}

function Meta({ article }: { article: Article }) {
  return (
    <div className="art-meta">
      <Avatar user={article.author} size={20} />
      <span className="art-meta-name">{article.author.nickname}</span>
      <span className="art-meta-dot">·</span>
      <span>{article.readMins} 分钟读完</span>
      <span className="art-meta-dot">·</span>
      <span><Icon name="eye" size={12} /> {fmtNum(article.views)}</span>
      {article.likeCount > 0 && <><span className="art-meta-dot">·</span><span><Icon name="heart" size={12} /> {fmtNum(article.likeCount)}</span></>}
    </div>
  );
}

export default function Articles() {
  const { user } = useAuth();
  const [cat, setCat] = useState<string>('全部');
  const [sort, setSort] = useState<SortKey>('new');
  const [meta, setMeta] = useState<{ featured: Article | null; categories: ArticleCategoryCount[] }>({ featured: null, categories: [] });
  const [trending, setTrending] = useState<{ id: number; title: string; category: string; views: number; likeCount: number }[]>([]);

  const { items: articles, loading, error, hasMore, sentinelRef, reload } = useInfiniteScroll<Article>(
    (offset, limit) => {
      const params: Record<string, any> = { sort, offset, limit };
      if (cat !== '全部') params.category = cat;
      return api.get<ArticleListResponse>('/articles', { params }).then(({ data }) => {
        if (offset === 0) setMeta({ featured: data.featured, categories: data.categories });
        return { items: data.articles, hasMore: !!data.hasMore };
      });
    },
    [cat, sort],
    10,
  );

  useEffect(() => {
    api.get<{ articles: typeof trending }>('/articles/trending').then(({ data }) => setTrending(data.articles)).catch(() => {});
  }, []);

  const categories: ArticleCategoryCount[] = meta.categories;
  const featured = meta.featured;

  const right = (
    <>
      <div className="ui-card widget">
        <div className="widget-head"><div className="widget-title"><Icon name="trend" size={16} className="tk" /> 热门专栏</div></div>
        {trending.length === 0 ? <div className="faint" style={{ padding: '6px 2px', fontSize: 12.5 }}>还没有热门文章</div> :
          trending.map((t, i) => (
            <Link to={`/article/${t.id}`} className="art-trend" key={t.id}>
              <span className={`art-trend-no${i < 3 ? ' top' : ''}`}>{i + 1}</span>
              <span className="art-trend-title">{t.title}</span>
            </Link>
          ))}
      </div>
      <div className="ui-card widget">
        <div className="widget-head"><div className="widget-title"><Icon name="grid" size={16} className="tk" /> 分类</div></div>
        <div className="art-catlist">
          {categories.map((c) => (
            <button key={c.name} className={`art-cat-chip${cat === c.name ? ' on' : ''}`} onClick={() => setCat(c.name)}
              style={{ '--cc': catColor(c.name) } as React.CSSProperties}>
              <Icon name={catIcon(c.name)} size={14} /> {c.name} <span className="art-cat-n">{c.count}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <Shell right={right}>
      <div className="ui-card art-head">
        <div>
          <h1 className="text-xl font-extrabold flex items-center gap-2"><Icon name="book" size={20} /> 专栏</h1>
          <p className="art-head-sub">社区里更完整的思考、教程与观点，慢读慢聊。</p>
        </div>
        <Link to="/write" className="btn btn-primary"><Icon name="edit" size={16} /> 写文章</Link>
      </div>

      <div className="art-filterbar">
        <div className="art-cats">
          {['全部', ...['综合', '技术', '设计', '产品', '生活', '观点']].map((c) => (
            <button key={c} className={`art-tab${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
        <div className="art-sort">
          <button className={sort === 'new' ? 'on' : ''} onClick={() => setSort('new')}>最新</button>
          <button className={sort === 'hot' ? 'on' : ''} onClick={() => setSort('hot')}>热门</button>
        </div>
      </div>

      {loading ? <ArticleListSkeleton /> : error ? (
        <div className="ui-card"><LoadError onRetry={reload} /></div>
      ) : (articles.length === 0 && !featured) ? (
        <div className="ui-card"><Empty icon="📝" text="这个分类还没有文章" >
          {user && <Link to="/write" className="btn btn-primary btn-sm" style={{ marginTop: 10 }}><Icon name="edit" size={14} /> 写第一篇</Link>}
        </Empty></div>
      ) : (
        <>
          {featured && (
            <Link to={`/article/${featured.id}`} className="ui-card art-featured">
              <Cover article={featured} big />
              <div className="art-featured-body">
                <span className="art-chip" style={{ '--cc': catColor(featured.category) } as React.CSSProperties}>
                  <Icon name="pin" size={11} /> 编辑精选 · {featured.category}
                </span>
                <h2 className="art-featured-title">{featured.title}</h2>
                <p className="art-featured-sum">{featured.summary}</p>
                <Meta article={featured} />
              </div>
            </Link>
          )}

          <div className="art-list">
            {/* featured 作为头图单独展示；它可能落在任意分页里，全局去重避免重复出现 */}
            {articles.filter((a) => a.id !== featured?.id).map((a) => (
              <Link to={`/article/${a.id}`} className="art-row" key={a.id}>
                <div className="art-row-body">
                  <span className="art-chip sm" style={{ '--cc': catColor(a.category) } as React.CSSProperties}>{a.category}</span>
                  <h3 className="art-row-title">{a.title}</h3>
                  <p className="art-row-sum">{a.summary}</p>
                  <Meta article={a} />
                </div>
                <Cover article={a} />
              </Link>
            ))}
          </div>
          <div ref={sentinelRef} aria-hidden />
          {!hasMore && articles.length > 0 && <ListEnd />}
        </>
      )}
    </Shell>
  );
}
