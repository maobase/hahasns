import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import Shell from '../components/Shell';
import Icon from '../components/Icon';
import Avatar from '../components/Avatar';
import { BoardTile, BoardMini } from '../components/BoardIcon';
import ThreadRow from '../components/ThreadRow';
import NewThreadModal from '../components/NewThreadModal';
import { Loading, Empty, RowSkeleton } from '../components/States';
import { Button } from '../components/heroui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api/client';
import { fmtNum } from '../lib/format';

const SORTS = [{ key: 'latest', label: '最新回复' }, { key: 'hot', label: '热门' }, { key: 'elite', label: '精华' }];

export default function Board() {
  const { slug } = useParams<{ slug: string }>();
  const { user, setAuthOpen, patchUser } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [sort, setSort] = useState('latest');
  const [loading, setLoading] = useState(true);
  const [allBoards, setAllBoards] = useState<any[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [buying, setBuying] = useState(false);

  useEffect(() => { api.get('/forum/boards').then(({ data }) => setAllBoards(data.boards)); }, []);
  useEffect(() => {
    setLoading(true);
    api.get(`/forum/boards/${slug}`, { params: { sort } }).then(({ data }) => setData(data)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [slug, sort]);

  if (loading && !data) return <Shell><div className="ui-card" style={{ height: 92 }} /><RowSkeleton /></Shell>;
  if (!data) return <Shell><div className="ui-card"><Empty icon="🔍" text="板块不存在" /></div></Shell>;
  const { board, threads } = data;

  // 乐观更新：即时切换关注状态与计数，失败回滚到快照
  const followBoard = async () => {
    if (!user) return setAuthOpen(true);
    const prev = data.board;
    const next = !prev.isFollowing;
    setData((d: any) => ({ ...d, board: { ...d.board, isFollowing: next, followers: Math.max(0, (d.board.followers || 0) + (next ? 1 : -1)) } }));
    try {
      const { data: r } = await api.post(`/forum/boards/${board.id}/follow`);
      setData((d: any) => ({ ...d, board: { ...d.board, isFollowing: r.following } }));
    } catch { setData((d: any) => ({ ...d, board: prev })); }
  };

  const unlockBoard = async () => {
    if (!user) return setAuthOpen(true);
    setBuying(true);
    try {
      const { data: r } = await api.post(`/forum/boards/${board.id}/purchase`);
      if (typeof r.points === 'number') patchUser?.({ points: r.points });
      const { data: fresh } = await api.get(`/forum/boards/${slug}`, { params: { sort } });
      setData(fresh);
      toast.ok('解锁成功，欢迎进入付费板块');
    } catch (e: any) { toast.err(e.message); }
    finally { setBuying(false); }
  };

  const right = (
    <>
      <div className="ui-card widget">
        <div className="widget-title" style={{ marginBottom: 10 }}>板块版主</div>
        {board.moderators?.length ? board.moderators.map((m: any) => (
          <div className="user-row" key={m.id}>
            <Avatar user={m} size={38} showV />
            <div className="meta nowrap"><Link to={`/u/${m.username}`} className="nm uname">{m.nickname}</Link><div className="sub">版主 · Lv.{m.level}</div></div>
          </div>
        )) : <div className="muted" style={{ fontSize: 13 }}>暂无版主</div>}
      </div>
      {board.children?.length > 0 && (
        <div className="ui-card widget">
          <div className="widget-title" style={{ marginBottom: 10 }}>子板块</div>
          {board.children.map((c: any) => (
            <Link to={`/forum/${c.slug}`} key={c.id} className="row gap-8" style={{ padding: '7px 0' }}>
              <BoardMini slug={c.slug} size={17} />
              <span className="grow" style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</span>
              <span className="faint num" style={{ fontSize: 12 }}>{fmtNum(c.threadCount)}</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );

  return (
    <Shell right={right}>
      <div className="ui-card board-hero">
        <BoardTile slug={board.slug} size={60} />
        <div className="grow">
          <div className="row gap-8"><Link to="/forum" className="muted" style={{ fontSize: 12.5 }}>论坛</Link><span className="faint">/</span></div>
          <div className="row gap-6" style={{ flexWrap: 'wrap' }}>
            <h1>{board.name}</h1>
            {board.isPaid && <span className="board-paid-chip"><Icon name="lock" size={11} /> 付费</span>}
          </div>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 2 }}>{board.description} · {fmtNum(board.threadCount)} 主题 · {fmtNum(board.followers || 0)} 关注</div>
        </div>
        <div className="row gap-8">
          <Button variant={board.isFollowing ? 'flat' : 'bordered'} className="haha-btn-app" onClick={followBoard}>
            {board.isFollowing ? '已关注' : <><Icon name="plus" size={15} style={{ width: 15, height: 15 }} /> 关注</>}
          </Button>
          {!board.locked && <Button color="primary" className="haha-btn-app" onClick={() => (user ? setComposeOpen(true) : setAuthOpen(true))}><Icon name="edit" size={16} style={{ width: 16, height: 16 }} /> 发帖</Button>}
        </div>
      </div>

      {board.announcement && (
        <div className="announce"><Icon name="megaphone" size={16} style={{ flex: 'none', marginTop: 1 }} /><span>{board.announcement}</span></div>
      )}

      {board.locked ? (
        <div className="ui-card paywall">
          <span className="paywall-ico"><Icon name="lock" size={26} /></span>
          <h3 className="paywall-title">这是一个付费板块</h3>
          <p className="paywall-sub">解锁「{board.name}」即可查看全部 {fmtNum(board.threadCount)} 篇主题并参与讨论，一次解锁、永久可看。</p>
          <div className="paywall-price"><Icon name="coin" size={19} /> {fmtNum(board.price)} <span>积分</span></div>
          <Button size="lg" color="primary" className="haha-btn-app" onClick={unlockBoard} isDisabled={buying} style={{ minWidth: 180 }}>
            {buying ? '解锁中…' : (user ? '立即解锁' : '登录后解锁')}
          </Button>
          {user && <div className="muted paywall-note">你当前有 {fmtNum(user.points || 0)} 积分</div>}
        </div>
      ) : (
        <div className="ui-card" style={{ overflow: 'hidden' }}>
          <div className="subtabs">
            {SORTS.map((s) => <button key={s.key} className={`subtab${sort === s.key ? ' active' : ''}`} onClick={() => setSort(s.key)}>{s.label}</button>)}
          </div>
          {threads.length === 0 ? <Empty text="这个板块还没有帖子，来抢首帖！" /> :
            threads.map((t: any, i: number) => (
              <div key={t.id}>{i > 0 && <div className="divider" />}<ThreadRow thread={t} showBoard={false} /></div>
            ))}
        </div>
      )}

      <NewThreadModal open={composeOpen} onClose={() => setComposeOpen(false)} boards={allBoards} defaultBoardId={board.id}
        onCreated={(t: any) => setData((d: any) => ({ ...d, threads: [t, ...d.threads] }))} />
    </Shell>
  );
}
