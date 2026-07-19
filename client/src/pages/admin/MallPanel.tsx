import { useState, useEffect } from 'react';
import Icon from '../../components/Icon';
import { Empty, RowSkeleton } from '../../components/States';
import { Input, Button } from '../../components/heroui';
import { useToast } from '../../context/ToastContext';
import api from '../../api/client';
import { fmtNum, timeAgo } from '../../lib/format';
import { confirmDialog } from '../../components/confirm';
import { SaveBtn, AdminSearch, ListHead, downloadCSV } from './ui';

// 积分商城后台：商品上架 / 搜索 / 行内编辑 / 下架 + 兑换记录统计与导出 CSV（前台 /mall 展示）。
// 第 8 刀自 Admin.tsx 整体抽离：PRODUCT_CATS / ProductEditForm / MALL_CAT / MallOrders / Products 一并迁出，
// 组件自取自存、无外部 props，实现逐字不变。
const PRODUCT_CATS = [['title', '头衔'], ['frame', '头像框'], ['item', '道具'], ['physical', '实物']];

// 商品编辑（行内展开）：改 图标/名称/分类/价格/库存/说明。后端 PUT /admin/products/:id（库存 -1=不限）。
function ProductEditForm({ product, onSaved, onCancel }: { product: any; onSaved: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ icon: product.icon || '', name: product.name || '', category: product.category || 'item', price: String(product.price ?? 0), stock: String(product.stock ?? -1), description: product.description || '' });
  const save = async () => {
    if (!f.name.trim()) return toast.err('名称必填');
    try {
      await api.put(`/admin/products/${product.id}`, { name: f.name, icon: f.icon, category: f.category, price: Math.max(0, Math.round(Number(f.price) || 0)), stock: Math.max(-1, Math.round(Number(f.stock))), description: f.description });
      toast.ok('商品已更新'); onSaved();
    } catch (e: any) { toast.err(e.message); }
  };
  return (
    <div style={{ padding: '0 16px 16px', background: 'var(--surface-2)' }}>
      <div className="row gap-8" style={{ flexWrap: 'wrap', paddingTop: 14 }}>
        <Input className="haha-inp" value={f.icon} onChange={(e: any) => setF((s) => ({ ...s, icon: e.target.value }))} style={{ width: 56, textAlign: 'center' }} />
        <Input className="haha-inp" value={f.name} onChange={(e: any) => setF((s) => ({ ...s, name: e.target.value }))} placeholder="商品名（必填）" style={{ flex: 1, minWidth: 120 }} />
        <select className="haha-inp" value={f.category} onChange={(e) => setF((s) => ({ ...s, category: e.target.value }))} style={{ width: 'auto' }}>
          {PRODUCT_CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="row gap-8" style={{ flexWrap: 'wrap', marginTop: 8 }}>
        <label className="sec-field" style={{ width: 130 }}><span className="sec-label">价格（积分）</span><Input className="haha-inp" type="number" min={0} value={f.price} onChange={(e: any) => setF((s) => ({ ...s, price: e.target.value }))} /></label>
        <label className="sec-field" style={{ width: 150 }}><span className="sec-label">库存（-1 不限）</span><Input className="haha-inp" type="number" min={-1} value={f.stock} onChange={(e: any) => setF((s) => ({ ...s, stock: e.target.value }))} /></label>
      </div>
      <Input className="haha-inp" value={f.description} onChange={(e: any) => setF((s) => ({ ...s, description: e.target.value }))} placeholder="商品说明（可选）" style={{ width: '100%', marginTop: 8 }} />
      <div className="row gap-4" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
        <Button size="sm" variant="flat" className="haha-btn-app" onClick={onCancel}>取消</Button>
        <SaveBtn onSave={save} />
      </div>
    </div>
  );
}

// 商城兑换记录：累计兑换 / 消耗积分 + 近 50 笔（实物商品标红「需发货」，便于履约）。
const MALL_CAT: Record<string, string> = { title: '头衔', frame: '头像框', item: '道具', physical: '实物' };
function MallOrders() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api.get('/mall/admin/orders').then(({ data }) => setData(data)).catch(() => setData({ stats: {}, orders: [] })); }, []);
  if (data === null) return <RowSkeleton rows={3} />;
  const s = data.stats || {};
  const STAT: [string, string][] = [['累计兑换', (s.total || 0).toLocaleString()], ['消耗积分', (s.pointsSpent || 0).toLocaleString()]];
  return (
    <div className="flex flex-col gap-4">
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        {STAT.map(([k, v]) => (
          <div className="ui-card stat-card" key={k} style={{ padding: 16 }}>
            <span className="muted" style={{ fontSize: 12.5 }}>{k}</span>
            <div className="num" style={{ fontWeight: 700, marginTop: 8, fontSize: 22 }}>{v}</div>
          </div>
        ))}
      </div>
      <div className="ui-card" style={{ padding: 0, overflow: 'hidden' }}>
        <ListHead title="兑换记录" count={data.orders.length} action={
          <Button size="sm" variant="flat" className="haha-btn-app" isDisabled={!data.orders.length} onClick={() => downloadCSV('兑换记录.csv', [
            { label: '用户', get: (o) => o.user?.nickname || '' }, { label: '商品', get: (o) => o.product?.name || '' }, { label: '分类', get: (o) => MALL_CAT[o.product?.category] || o.product?.category || '' }, { label: '积分', get: (o) => o.price }, { label: '时间', get: (o) => o.createdAt },
          ], data.orders)}>导出 CSV</Button>
        } />
        {data.orders.length === 0 ? <Empty text="还没有兑换记录" /> : data.orders.map((o: any, i: number) => {
          const phys = o.product?.category === 'physical';
          return (
            <div key={o.id}>
              {i > 0 && <div className="divider" />}
              <div className="row gap-12" style={{ padding: '12px 18px', alignItems: 'center' }}>
                <span style={{ fontSize: 20 }}>{o.product?.icon || '🎁'}</span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row gap-6" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{o.product?.name || '已下架商品'}</span>
                    <span className="ui-badge" style={phys ? { background: 'color-mix(in srgb, var(--like) 13%, transparent)', color: 'var(--like)' } : undefined}>{MALL_CAT[o.product?.category] || o.product?.category || '—'}</span>
                    {phys && <span className="faint" style={{ fontSize: 11.5, color: 'var(--like)' }}>需发货</span>}
                  </div>
                  <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>{o.user?.nickname || '已删除用户'} · {timeAgo(o.createdAt)}</div>
                </div>
                <span className="num" style={{ fontSize: 13, color: 'var(--ink-2)' }}>-{fmtNum(o.price)} 分</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MallPanel() {
  const toast = useToast();
  const [products, setProducts] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ name: '', icon: '🎁', category: 'item', price: 100, description: '', payload: '' });
  const [editId, setEditId] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const load = (query = q) => api.get('/mall/products', { params: { q: query || undefined } }).then(({ data }) => setProducts(data.products));
  useEffect(() => { load(); }, []);
  const create = async () => { if (!form.name || !form.price) return toast.err('名称和价格必填'); try { await api.post('/admin/products', form); toast.ok('商品已上架'); setForm({ name: '', icon: '🎁', category: 'item', price: 100, description: '', payload: '' }); load(); } catch (e: any) { toast.err(e.message); } };
  const del = async (p: any) => { if (!(await confirmDialog(`下架「${p.name}」?`))) return; try { await api.delete(`/admin/products/${p.id}`); toast.ok('已下架'); load(); } catch (e: any) { toast.err(e.message); } };
  return (
    <>
      <div className="ui-card" style={{ padding: 16, marginBottom: 'var(--gap)' }}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>上架商品</div>
        <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
          <Input className="haha-inp" value={form.icon} onChange={(e: any) => setForm((f: any) => ({ ...f, icon: e.target.value }))} style={{ width: 56, textAlign: 'center' }} />
          <Input className="haha-inp" value={form.name} onChange={(e: any) => setForm((f: any) => ({ ...f, name: e.target.value }))} placeholder="商品名（必填）" style={{ flex: 1, minWidth: 120 }} />
          <select className="haha-inp" value={form.category} onChange={(e) => setForm((f: any) => ({ ...f, category: e.target.value }))} style={{ width: 'auto' }}>
            {PRODUCT_CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <Input className="haha-inp" type="number" value={form.price} onChange={(e: any) => setForm((f: any) => ({ ...f, price: e.target.value }))} placeholder="积分" style={{ width: 100 }} />
          <Button color="primary" className="haha-btn-app" onClick={create} isDisabled={!form.name.trim() || !form.price}>上架</Button>
        </div>
      </div>
      <div className="ui-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: 14, borderBottom: '1px solid var(--line)' }}>
          <div className="row gap-8"><AdminSearch value={q} onChange={setQ} onSearch={() => load(q)} placeholder="搜索商品名…" /></div>
        </div>
        {products.length === 0 ? <Empty text={q.trim() ? '没有匹配的商品' : '还没有商品'} /> : products.map((p, i) => (
          <div key={p.id}>{i > 0 && <div className="divider" />}
            <div className="row gap-12" style={{ padding: '12px 16px' }}>
              <span style={{ fontSize: 22 }}>{p.icon}</span>
              <div className="grow" style={{ minWidth: 0 }}><b>{p.name}</b> <span className="faint" style={{ fontSize: 12 }}>{p.price}积分 · 已售{p.sold}{p.stock >= 0 ? ` · 余${Math.max(0, p.stock - p.sold)}` : ''}</span></div>
              <Button size="sm" variant="flat" className="haha-btn-app" onClick={() => setEditId(editId === p.id ? null : p.id)}>{editId === p.id ? '收起' : '编辑'}</Button>
              <Button size="sm" variant="flat" className="haha-btn-app danger" onClick={() => del(p)}><Icon name="trash" size={14} style={{ width: 14, height: 14 }} /> 下架</Button>
            </div>
            {editId === p.id && <ProductEditForm product={p} onSaved={() => { setEditId(null); load(); }} onCancel={() => setEditId(null)} />}
          </div>
        ))}
      </div>
      <div className="sec-head" style={{ marginTop: 6 }}>兑换记录</div>
      <MallOrders />
    </>
  );
}
