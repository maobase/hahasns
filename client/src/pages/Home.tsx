import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import Shell from '../components/Shell';
import Composer from '../components/Composer';
import SiteNotice from '../components/SiteNotice';
import PostCard from '../components/PostCard';
import { PostSkeleton, Empty, LoadError } from '../components/States';
import { WhoToFollow } from '../components/Widgets';
import { useAuth } from '../context/AuthContext';
import { useSite } from '../context/SiteContext';
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
  const { homeTabs } = useSite();
  const loc = useLocation();
  // 站长可在后台隐藏可选信息流 tab（视频/同城/关注）；核心 tab（推荐/最新）恒显
  const tabs = FILTERS.filter((f) => homeTabs[f.key] !== false);
  const [filter, setFilter] = useState('recommend');
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const offsetRef = useRef(0);
  const busyRef = useRef(false);

  // (re)load from the top when the filter or viewer changes
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(false); setPosts([]); offsetRef.current = 0;
    api.get('/posts', { params: { filter, limit: PAGE, offset: 0 } })
      .then(({ data }) => { if (!alive) return; setPosts(data.posts); setHasMore(data.hasMore); offsetRef.current = data.posts.length; })
      .catch(() => { if (alive) setError(true); })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [filter, user?.id, reloadKey]);

  const loadMore = useCallback(async () => {
    if (busyRef.current || !hasMore) return;
    busyRef.current = true; setLoadingMore(true);
    try {
      const { data } = await api.get('/posts', { params: { filter, limit: PAGE, offset: offsetRef.current } });
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const fresh = data.posts.filter((p: any) => !seen.has(p.id));
        offsetRef.current += data.posts.length;
        return [...prev, ...fresh];
      });
      setHasMore(data.hasMore);
    } finally { busyRef.current = false; setLoadingMore(false); }
  }, [filter, hasMore]);

  // infinite scroll via IntersectionObserver on the bottom sentinel
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) loadMore(); }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

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
    <Shell>
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
        <div className="ui-card"><LoadError onRetry={() => setReloadKey((k) => k + 1)} /></div>
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
          {posts.map((p) => <PostCard key={p.id} post={p} onDelete={onDelete} />)}
          <div ref={sentinel} />
          {loadingMore && <PostSkeleton />}
          {!hasMore && <div className="empty" style={{ padding: '24px 0', fontSize: 13 }}>· 没有更多了 ·</div>}
        </>
      )}
    </Shell>
  );
}
