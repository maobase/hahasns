import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import Shell from '../components/Shell';
import Icon from '../components/Icon';
import Avatar from '../components/Avatar';
import PostCard from '../components/PostCard';
import { Loading, Empty } from '../components/States';
import { Button } from '../components/heroui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api/client';
import { confirmDialog } from '../components/confirm';
import { fmtNum, timeAgo } from '../lib/format';

export default function CollectionDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/collections/${id}`).then(({ data }) => setData(data)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Shell><Loading /></Shell>;
  if (!data?.collection) return <Shell><div className="ui-card"><Empty icon="🔍" text="专题不存在或已删除" /></div></Shell>;

  const { collection: c, items } = data;

  const removeItem = async (itemId: number) => {
    try { await api.delete(`/collections/${c.id}/items/${itemId}`); setData((d: any) => ({ ...d, items: d.items.filter((x: any) => x.itemId !== itemId) })); toast.ok('已移出专题'); }
    catch (e: any) { toast.err(e.message); }
  };
  const removeColl = async () => {
    if (!(await confirmDialog('已收录内容不会被删除，仅解除收录', { title: '删除整个专题？', confirmText: '删除' }))) return;
    try { await api.delete(`/collections/${c.id}`); toast.ok('专题已删除'); nav('/collections'); }
    catch (e: any) { toast.err(e.message); }
  };

  return (
    <Shell>
      <Link to="/collections" className="art-back"><Icon name="back" size={16} /> 专题</Link>
      <div className="ui-card coll-detail-head">
        {c.cover && <div className="coll-detail-cover" style={{ backgroundImage: `url(${c.cover})` }} />}
        <div className="coll-detail-meta">
          <div className="coll-detail-title">{c.title}</div>
          {c.description && <div className="coll-detail-desc">{c.description}</div>}
          <div className="coll-detail-foot">
            <Link to={`/u/${c.owner?.username}`} className="coll-owner"><Avatar user={c.owner} size={22} noLink /> <span>{c.owner?.nickname}</span></Link>
            <span className="faint">· {fmtNum(c.itemCount)} 篇收录</span>
            {c.isOwner && <Button size="sm" variant="flat" className="haha-btn-app danger" style={{ marginLeft: 'auto' }} onClick={removeColl}><Icon name="close" size={14} style={{ width: 14, height: 14 }} /> 删除专题</Button>}
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="ui-card"><Empty icon="📭" text="还没有收录内容">{c.isOwner && <div className="faint" style={{ fontSize: 13, marginTop: 6 }}>去动态或文章详情页点「加入专题」收录内容</div>}</Empty></div>
      ) : (
        items.map((it: any) => it.type === 'post' ? (
          <div key={`p${it.itemId}`} className="coll-item">
            {c.isOwner && <button className="coll-item-rm" title="移出专题" onClick={() => removeItem(it.itemId)}><Icon name="close" size={14} /></button>}
            <PostCard post={it} />
          </div>
        ) : (
          <div key={`a${it.itemId}`} className="ui-card coll-art-card">
            {c.isOwner && <button className="coll-item-rm" title="移出专题" onClick={() => removeItem(it.itemId)}><Icon name="close" size={14} /></button>}
            <Link to={`/article/${it.id}`} className="coll-art-link">
              {it.cover && <div className="coll-art-cover" style={{ backgroundImage: `url(${it.cover})` }} />}
              <div className="coll-art-body">
                <span className="coll-art-cat">{it.category}</span>
                <div className="coll-art-title">{it.title}</div>
                {it.summary && <div className="coll-art-summary">{it.summary}</div>}
                <div className="coll-art-meta"><Avatar user={it.author} size={18} noLink /> {it.author?.nickname} · {timeAgo(it.createdAt)} · <Icon name="heart" size={12} /> {fmtNum(it.likeCount)}</div>
              </div>
            </Link>
          </div>
        ))
      )}
    </Shell>
  );
}
