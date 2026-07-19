import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell';
import Icon from '../components/Icon';
import ThreadRow from '../components/ThreadRow';
import NewThreadModal from '../components/NewThreadModal';
import { Empty, RowSkeleton, ListEnd, LoadError } from '../components/States';
import { Button } from '../components/heroui';
import { HotTopics, TrendingSearch, Footer } from '../components/Widgets';
import { BoardTile, BoardMini } from '../components/BoardIcon';
import { useAuth } from '../context/AuthContext';
import { useSite, moduleOn, widgetOn } from '../context/SiteContext';
import useInfiniteScroll from '../hooks/useInfiniteScroll';
import api from '../api/client';
import { fmtNum } from '../lib/format';

const SORTS = [{ key: 'latest', label: '最新回复' }, { key: 'hot', label: '热门' }, { key: 'elite', label: '精华' }];

export default function Forum() {
  const { user, setAuthOpen } = useAuth();
  const { modules, widgets } = useSite();
  const [boards, setBoards] = useState<any[]>([]);
  const [sort, setSort] = useState('latest');
  const [composeOpen, setComposeOpen] = useState(false);
  const [myBoards, setMyBoards] = useState<any[]>([]);

  const { items: threads, loading, error, hasMore, sentinelRef, setItems: setThreads, reload } = useInfiniteScroll<any>(
    (offset, limit) => api.get('/forum/threads', { params: { sort, offset, limit } })
      .then(({ data }) => ({ items: data.threads, hasMore: !!data.hasMore })),
    [sort],
    20,
  );

  useEffect(() => { api.get('/forum/boards').then(({ data }) => setBoards(data.boards)); }, []);
  useEffect(() => { if (user) api.get('/forum/my-boards').then(({ data }) => setMyBoards(data.boards)).catch(() => {}); else setMyBoards([]); }, [user]);

  const right = (
    <>
      {myBoards.length > 0 && (
        <div className="ui-card widget">
          <div className="widget-title" style={{ marginBottom: 10 }}><Icon name="bookmark" size={15} className="tk" /> 我关注的板块</div>
          {myBoards.map((b) => (
            <Link to={`/forum/${b.slug}`} key={b.id} className="row gap-8" style={{ padding: '7px 0' }}>
              <BoardMini slug={b.slug} size={17} />
              <span className="grow" style={{ fontWeight: 600, fontSize: 14 }}>{b.name}</span>
              <span className="faint num" style={{ fontSize: 12 }}>{fmtNum(b.threadCount)}</span>
            </Link>
          ))}
        </div>
      )}
      <div className="ui-card widget">
        <div className="widget-title" style={{ marginBottom: 10 }}><Icon name="forum" size={16} className="tk" /> 全部板块</div>
        {boards.map((b) => (
          <Link to={`/forum/${b.slug}`} key={b.id} className="row gap-8" style={{ padding: '7px 0' }}>
            <BoardMini slug={b.slug} size={17} />
            <span className="grow" style={{ fontWeight: 600, fontSize: 14 }}>{b.name}</span>
            <span className="faint num" style={{ fontSize: 12 }}>{fmtNum(b.threadCount)}</span>
          </Link>
        ))}
      </div>
      {moduleOn(modules, 'discover') && widgetOn(widgets, 'hottopics') && <HotTopics />}
      {widgetOn(widgets, 'trending') && <TrendingSearch />}
      <Footer />
    </>
  );

  return (
    <Shell right={right}>
      <div className="ui-card section-head">
        <h2 className="row gap-8"><Icon name="forum" size={19} style={{ color: 'var(--brand)' }} /> 社区论坛</h2>
        <Button color="primary" className="haha-btn-app" onClick={() => (user ? setComposeOpen(true) : setAuthOpen(true))}>
          {/* 内联尺寸：v3 .button 移动端(<768px)强制内部 svg 20px，钉住保持基线 16px */}
          <Icon name="edit" size={16} style={{ width: 16, height: 16 }} /> 发帖
        </Button>
      </div>

      {/* board cards */}
      {boards.map((b) => (
        <div className="ui-card" key={b.id}>
          <Link to={`/forum/${b.slug}`} className="board-card">
            <BoardTile slug={b.slug} />
            <div className="board-info">
              <div className="bn">{b.name}</div>
              <div className="bd">{b.description}</div>
            </div>
            <div className="board-count"><b>{fmtNum(b.threadCount)}</b>主题</div>
          </Link>
          {b.children?.length > 0 && (
            <div className="board-children">
              {b.children.map((c: any) => (
                <Link to={`/forum/${c.slug}`} key={c.id} className="board-child"><BoardMini slug={c.slug} size={13} /> {c.name}</Link>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* thread feed */}
      <div className="ui-card section-head" style={{ paddingBottom: 0, borderBottom: '1px solid var(--line)' }}>
        <div className="subtabs" style={{ border: 'none', padding: 0 }}>
          {SORTS.map((s) => (
            <button key={s.key} className={`subtab${sort === s.key ? ' active' : ''}`} onClick={() => setSort(s.key)}>{s.label}</button>
          ))}
        </div>
      </div>
      {loading ? <RowSkeleton /> : (
      <>
      <div className="ui-card" style={{ overflow: 'hidden' }}>
        {error ? <LoadError onRetry={reload} /> : threads.length === 0 ? <Empty text="还没有帖子" /> :
          threads.map((t, i) => (
            <div key={t.id}>
              {i > 0 && <div className="divider" />}
              <ThreadRow thread={t} />
            </div>
          ))}
      </div>
      <div ref={sentinelRef} aria-hidden />
      {!hasMore && threads.length > 0 && <ListEnd />}
      </>
      )}

      <NewThreadModal open={composeOpen} onClose={() => setComposeOpen(false)} boards={boards}
        onCreated={(t: any) => setThreads((ts) => [t, ...ts])} />
    </Shell>
  );
}
