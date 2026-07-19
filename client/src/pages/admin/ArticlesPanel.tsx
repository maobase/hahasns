import { useState, useEffect } from 'react';
import Icon from '../../components/Icon';
import { Empty, RowSkeleton } from '../../components/States';
import { Button } from '../../components/heroui';
import { useToast } from '../../context/ToastContext';
import api from '../../api/client';
import { fmtNum } from '../../lib/format';
import { confirmDialog } from '../../components/confirm';
import { ListHead, AdminSearch } from './ui';

// 专栏文章后台：精选 / 取消精选 / 删除（前台 /articles 展示，精选进首页编辑精选位）。
// 第 10 刀自 Admin.tsx 整体抽离：组件自取自存、无外部 props，共享件沿用 ./ui，实现逐字不变。
export default function ArticlesPanel() {
  const toast = useToast();
  const [list, setList] = useState<any[] | null>(null);
  const [q, setQ] = useState('');
  const load = (query = q) => api.get('/articles', { params: { limit: 40, q: query || undefined } }).then(({ data }) => {
    const seen = new Set<number>(); const out: any[] = [];
    for (const a of [data.featured, ...(data.articles || [])]) { if (a && !seen.has(a.id)) { seen.add(a.id); out.push(a); } }
    setList(out);
  }).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const feature = async (a: any, on: boolean) => {
    try { await api.post(`/articles/${a.id}/feature`, { featured: on }); toast.ok(on ? '已设为精选' : '已取消精选'); load(); } catch (e: any) { toast.err(e.message); }
  };
  const del = async (a: any) => {
    if (!(await confirmDialog('删除这篇文章？'))) return;
    try { await api.delete(`/articles/${a.id}`); toast.ok('已删除'); load(); } catch (e: any) { toast.err(e.message); }
  };
  if (list === null) return <RowSkeleton rows={6} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="ui-card" style={{ padding: 14 }}>
        <div className="row gap-8">
          <AdminSearch value={q} onChange={setQ} onSearch={() => load(q)} placeholder="搜索文章标题…" />
        </div>
      </div>
      <div className="ui-card" style={{ padding: 0, overflow: 'hidden' }}>
      <ListHead title="专栏文章" count={list.length} />
      {list.length === 0 ? <Empty text={q.trim() ? '没有匹配的文章' : '还没有文章'} /> : list.map((a, i) => (
        <div key={a.id}>
          {i > 0 && <div className="divider" />}
          <div className="row gap-12" style={{ padding: '12px 18px', alignItems: 'flex-start' }}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row gap-6" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                {a.featured && <span className="ui-badge" style={{ background: 'var(--brand-soft)', color: 'var(--brand-strong)' }}>精选</span>}
                <span className="ui-badge">{a.category}</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{a.title}</span>
              </div>
              <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>{a.author?.nickname} · {fmtNum(a.views)} 阅读 · {fmtNum(a.likeCount)} 赞</div>
            </div>
            <Button size="sm" variant="flat" className="haha-btn-app" onClick={() => feature(a, !a.featured)}>{a.featured ? '取消精选' : '设精选'}</Button>
            <Button size="sm" variant="flat" className="haha-btn-app danger" onClick={() => del(a)}><Icon name="trash" size={14} style={{ width: 14, height: 14 }} /> 删除</Button>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}
