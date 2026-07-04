import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Shell from '../components/Shell';
import Icon from '../components/Icon';
import PostCard from '../components/PostCard';
import { Loading, Empty, PostSkeleton, ListEnd, LoadError } from '../components/States';
import useInfiniteScroll from '../hooks/useInfiniteScroll';
import { useAuth } from '../context/AuthContext';
import { useLayout } from '../context/SiteContext';
import api from '../api/client';

export default function Bookmarks() {
  const { user, loading: authLoading, setAuthOpen } = useAuth();
  const nav = useNavigate();
  const layout = useLayout('bookmarks', 'default');

  // 统一走 useInfiniteScroll（与论坛/专栏一致，滚动自动续拉，去掉手写「加载更多」按钮）。
  // 未登录 / auth 未就绪时 fetchPage 空返回；auth 就绪后 deps 变化自动重拉。
  const { items: posts, loading, error, hasMore, sentinelRef, setItems: setPosts, reload } = useInfiniteScroll<any>(
    (offset, limit) =>
      !authLoading && user
        ? api.get('/users/me/bookmarks', { params: { offset, limit } })
            .then(({ data }) => ({ items: data.posts, hasMore: !!data.hasMore }))
        : Promise.resolve({ items: [], hasMore: false }),
    [authLoading, user?.id],
    20,
  );

  useEffect(() => { if (!authLoading && !user) setAuthOpen(true); }, [authLoading, user, setAuthOpen]);

  if (authLoading) return <Shell right={false}><Loading /></Shell>;
  if (!user) return <Shell right={false}><div className="ui-card"><Empty icon="🔒" text="登录后查看收藏" /></div></Shell>;

  return (
    <Shell layout={layout}>
      <div className="ui-card page-title"><Icon name="bookmark" size={19} style={{ color: 'var(--gold)' }} /> 我的收藏</div>
      {loading && posts.length === 0 ? <><PostSkeleton /><PostSkeleton /><PostSkeleton /></>
        : error ? <div className="ui-card"><LoadError onRetry={reload} /></div>
        : posts.length === 0 ? <div className="ui-card"><Empty icon="🔖" text="还没有收藏任何动态">
          <button className="btn btn-primary btn-sm" onClick={() => nav('/')}>去首页逛逛</button>
        </Empty></div>
        : <>
          {posts.map((p: any) => <PostCard key={p.id} post={p} onDelete={(id: number) => setPosts((x) => x.filter((y) => y.id !== id))} />)}
          <div ref={sentinelRef} />
          {!hasMore && <ListEnd />}
        </>}
    </Shell>
  );
}
