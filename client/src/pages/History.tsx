import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Shell from '../components/Shell';
import Icon from '../components/Icon';
import { Empty, RowSkeleton } from '../components/States';
import { Button } from '../components/heroui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLayout } from '../context/SiteContext';
import api from '../api/client';
import { confirmDialog } from '../components/confirm';
import { timeAgo } from '../lib/format';

export default function History() {
  const { user, loading: authLoading, setAuthOpen } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const layout = useLayout('history', 'default');
  const [items, setItems] = useState<any[] | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setAuthOpen(true); setItems([]); return; }
    api.get('/history').then(({ data }) => setItems(data.items)).catch(() => setItems([]));
  }, [authLoading, user]);

  const clearAll = async () => {
    if (!(await confirmDialog('清空后不可恢复', { title: '清空全部浏览足迹？', confirmText: '清空' }))) return;
    try { await api.delete('/history'); setItems([]); toast.ok('已清空足迹'); } catch (e: any) { toast.err(e.message); }
  };
  const removeOne = async (it: any) => {
    try {
      await api.delete(`/history/${it.type}/${it.id}`);
      setItems((xs) => (xs || []).filter((x) => !(x.type === it.type && x.id === it.id)));
    } catch (e: any) { toast.err(e.message); }
  };

  if (authLoading) return <Shell right={false}><div className="ui-card page-title"><Icon name="clock" size={19} /> 浏览足迹</div><RowSkeleton rows={6} /></Shell>;
  if (!user) return <Shell right={false}><div className="ui-card"><Empty icon="🔒" text="登录后查看浏览足迹" /></div></Shell>;

  return (
    <Shell layout={layout}>
      <div className="ui-card page-title hist-head">
        <span className="row gap-8"><Icon name="clock" size={19} style={{ color: 'var(--brand)' }} /> 浏览足迹</span>
        {items && items.length > 0 && (
          <Button size="sm" variant="flat" className="haha-btn-app" onClick={clearAll}><Icon name="trash" size={14} style={{ width: 14, height: 14 }} /> 清空</Button>
        )}
      </div>
      {items === null ? <RowSkeleton rows={6} />
        : items.length === 0 ? (
          <div className="ui-card"><Empty icon="🕓" text="还没有浏览记录，去看看大家在聊什么吧">
            <Button size="sm" color="primary" className="haha-btn-app" onClick={() => nav('/')}>去首页逛逛</Button>
          </Empty></div>
        ) : (
          <div className="ui-card hist-list">
            {items.map((it) => (
              <Link key={`${it.type}-${it.id}`} to={it.link} className="hist-row">
                <span className={`hist-ico hist-${it.type}`}><Icon name={it.icon} size={17} /></span>
                <div className="hist-main">
                  <div className="hist-title">
                    <span className="hist-title-txt">{it.title}</span>
                    {it.solved && <span className="hist-solved"><Icon name="check" size={11} /> 已解决</span>}
                  </div>
                  <div className="hist-meta">
                    <span className="hist-type">{it.typeLabel}</span>
                    <span className="hist-dot">·</span>
                    <span className="nowrap">{it.author?.nickname || '匿名'}</span>
                    <span className="hist-dot">·</span>
                    <span className="nowrap">{timeAgo(it.viewedAt)}看过</span>
                  </div>
                </div>
                {it.cover && <span className="hist-cover" style={{ backgroundImage: `url(${it.cover})` }} />}
                <button className="hist-del" aria-label="从足迹中移除" onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeOne(it); }}>
                  <Icon name="close" size={15} />
                </button>
              </Link>
            ))}
          </div>
        )}
    </Shell>
  );
}
