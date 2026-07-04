import { useState, useEffect, useRef, useCallback } from 'react';

interface Page<T> { items: T[]; hasMore: boolean }

/**
 * 通用无限滚动：给定一个按 offset 取页的函数，自动管理列表 / hasMore / loading，
 * 并用底部哨兵 + IntersectionObserver 在接近底部时续拉下一页。
 * 当 deps 变化（如切换分类 / 排序）时自动重置并重新拉第一页。
 *
 * 用法：
 *   const { items, loading, hasMore, sentinelRef, setItems, reload } =
 *     useInfiniteScroll<Article>((offset, limit) =>
 *       api.get('/articles', { params: { category, sort, offset, limit } })
 *         .then(({ data }) => ({ items: data.articles, hasMore: data.hasMore })),
 *       [category, sort], 12);
 */
export default function useInfiniteScroll<T>(
  fetchPage: (offset: number, limit: number) => Promise<Page<T>>,
  deps: any[],
  limit = 12,
) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);       // 首屏拉取失败（区别于「拉到空」），供页面显示重试
  const [reloadKey, setReloadKey] = useState(0);    // reload() 递增以重跑首屏 effect
  const [hasMore, setHasMore] = useState(false);
  const offsetRef = useRef(0);
  const busyRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // generation：每次 deps 重置自增，用于丢弃切换分类/排序时仍在途的旧请求结果
  const genRef = useRef(0);

  // 重置 + 拉第一页（deps 变化时）
  useEffect(() => {
    const myGen = ++genRef.current;
    setLoading(true);
    setError(false);
    setItems([]);
    offsetRef.current = 0;
    busyRef.current = false;
    fetchPage(0, limit)
      .then(({ items, hasMore }) => {
        if (myGen !== genRef.current) return;
        setItems(items);
        setHasMore(hasMore);
        // advance by the page window, NOT items.length — server may post-filter
        // (e.g. drop featured / locked rows), so item count can be < limit while
        // the next offset must still skip the full window to avoid overlap.
        offsetRef.current = limit;
      })
      .catch(() => { if (myGen === genRef.current) { setItems([]); setHasMore(false); setError(true); } })
      .finally(() => { if (myGen === genRef.current) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey]);

  const loadMore = useCallback(async () => {
    if (busyRef.current || !hasMore) return;
    const myGen = genRef.current;
    busyRef.current = true;
    try {
      const { items: more, hasMore: hm } = await fetchPage(offsetRef.current, limit);
      if (myGen !== genRef.current) return; // deps 在途中变了：丢弃这页，避免把旧筛选结果拼进新列表
      setItems((prev) => [...prev, ...more]);
      offsetRef.current += limit;
      setHasMore(hm);
    } catch {
      /* 续拉失败：保留已加载内容，下次进入视口再试 */
    } finally {
      if (myGen === genRef.current) busyRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, limit, ...deps]);

  // 底部哨兵进入视口（提前 600px）→ 续拉
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMore(); },
      { rootMargin: '600px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { items, loading, error, hasMore, sentinelRef, setItems, reload };
}
