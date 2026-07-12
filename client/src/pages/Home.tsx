import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import useInfiniteScroll from '../hooks/useInfiniteScroll';
import Shell from '../components/Shell';
import Composer from '../components/Composer';
import SiteNotice from '../components/SiteNotice';
import PostCard from '../components/PostCard';
import { PostSkeleton, Empty, LoadError } from '../components/States';
import { WhoToFollow } from '../components/Widgets';
import { useAuth } from '../context/AuthContext';
import { useSite } from '../context/SiteContext';
import { normalizeFeedLayout } from '../lib/feedLayout';
import api from '../api/client';

const FILTERS = [
  { key: 'recommend', label: '推荐' },
  { key: 'all', label: '最新' },
  { key: 'following', label: '关注', auth: true },
  { key: 'video', label: '视频' },
  { key: 'samecity', label: '同城', auth: true },
];
const PAGE = 12;

export default function Home() {
  const { user, setAuthOpen } = useAuth();
  const { homeTabs, feedLayout } = useSite();
  const layout = normalizeFeedLayout(feedLayout);
  const isWaterfall = layout === 'waterfall';
  const loc = useLocation();
  // 站长可在后台隐藏可选信息流 tab（视频/同城/关注）；核心 tab（推荐/最新）恒显
  const tabs = FILTERS.filter((f) => homeTabs[f.key] !== false);
  const [filter, setFilter] = useState('recommend');
  const composerRef = useRef<HTMLDivElement | null>(null);
  // 无限滚动收敛到通用 useInfiniteScroll（哨兵 IO + 按窗口推进 offset，避免服务端后过滤导致的重叠重复拉取；切 filter/登录态自动重置）。
  const { items: posts, loading, error, hasMore, sentinelRef, setItems: setPosts, reload } = useInfiniteScroll<any>(
    (offset, limit) => api.get('/posts', { params: { filter, offset, limit } }).then(({ data }) => ({ items: data.posts, hasMore: data.hasMore })),
    [filter, user?.id],
    PAGE,
  );

  useEffect(() => {
    if (loc.state?.compose) composerRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [loc.state]);

  const onFilter = (f: any) => {
    if (f.auth && !user) return setAuthOpen(true);
    setFilter(f.key);
  };
  const onPosted = (post: any) => setPosts((p) => [post, ...p]);
  const onDelete = (id: number) => setPosts((p) => p.filter((x) => x.id !== id));

  return (
    <Shell right={isWaterfall ? false : undefined} wide={isWaterfall || undefined}>
      <SiteNotice />
      <div ref={composerRef}><Composer onPosted={onPosted} /></div>

      <div className="ui-card feed-tabs">
        {tabs.map((f) => (
          <button key={f.key} className={`feed-tab${filter === f.key ? ' active' : ''}`} onClick={() => onFilter(f)}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <>{[1, 2, 3].map((i) => <PostSkeleton key={i} />)}</>
      ) : error ? (
        <div className="ui-card"><LoadError onRetry={reload} /></div>
      ) : posts.length === 0 ? (
        <>
          <div className="ui-card"><Empty icon={filter === 'following' ? '👀' : '🍃'} text={
            filter === 'following' ? '关注更多有趣的人，这里会出现他们的动态' :
            filter === 'samecity' ? '完善你的城市，发现同城新鲜事' :
            filter === 'video' ? '还没有视频动态' : '还没有动态，来发布第一条吧'
          } /></div>
          {filter === 'following' && <WhoToFollow />}
        </>
      ) : (
        <>
          <div className={isWaterfall ? 'feed-waterfall' : 'feed-list'}>
            {posts.map((p) => (
              <div key={p.id} className={isWaterfall ? 'feed-waterfall-item' : undefined}>
                <PostCard post={p} onDelete={onDelete} compact={isWaterfall} />
              </div>
            ))}
          </div>
          <div ref={sentinelRef} />
          {hasMore && <PostSkeleton />}
          {!hasMore && <div className="empty" style={{ padding: '24px 0', fontSize: 13 }}>· 没有更多了 ·</div>}
        </>
      )}
    </Shell>
  );
}
