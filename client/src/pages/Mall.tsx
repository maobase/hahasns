import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Tabs, Tab, Input, Button } from '../components/heroui';
import Shell from '../components/Shell';
import Icon from '../components/Icon';
import { Loading, Empty, CardGridSkeleton } from '../components/States';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useLayout, useSite } from '../context/SiteContext';
import api from '../api/client';
import { fmtNum, timeAgo } from '../lib/format';

const CAT: Record<string, string> = { title: '头衔', frame: '头像框', item: '道具', physical: '实物周边' };
const CAT_STYLE: Record<string, { color: string; icon: string }> = {
  item: { color: '#2b54f0', icon: 'gift' },
  title: { color: '#d99e1f', icon: 'shield' },
  frame: { color: '#7c3aed', icon: 'image' },
  physical: { color: '#0e9f6e', icon: 'shop' },
};
// Map each virtual good to a real SVG icon (name-based — robust to emoji encoding),
// falling back to its category icon. Replaces the seeded emoji glyphs (anti-slop).
function productIcon(p: any) {
  const n = p.name || '';
  if (n.includes('改名')) return 'edit';
  if (n.includes('置顶')) return 'pin';
  if (n.includes('彩虹')) return 'palette';
  if (n.includes('夜猫')) return 'moon';
  if (n.includes('元老')) return 'shield';
  if (n.includes('锦鲤')) return 'fire';
  if (n.includes('贴纸')) return 'gift';
  if (n.includes('杯')) return 'shop';
  return CAT_STYLE[p.category]?.icon || 'gift';
}
function MallIcon({ p, size = 52 }: { p: any; size?: number }) {
  const color = (CAT_STYLE[p.category] || {}).color || 'var(--brand)';
  return (
    <div className="mall-ico" style={{ width: size, height: size, borderRadius: size > 46 ? 14 : 12, '--mc': color } as React.CSSProperties}>
      <Icon name={productIcon(p)} size={size > 46 ? 26 : 20} style={{ color }} />
    </div>
  );
}

export default function Mall() {
  const { user, setAuthOpen, patchUser, refresh } = useAuth();
  const toast = useToast();
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [payOrders, setPayOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('shop');
  const [pending, setPending] = useState<any>(null); // 待确认兑换的商品（统一 Modal 替代原生 confirm）
  const [busy, setBusy] = useState(false);
  const site = useSite();
  const epayOn = !!site.payments?.epay;
  const alipayOn = !!site.payments?.alipay; // 支付宝官方直连
  const wechatOn = !!site.payments?.wechat; // 微信支付 v3 Native 扫码
  const payOn = epayOn || alipayOn || wechatOn;
  const [rechargeAmt, setRechargeAmt] = useState('10');
  const [rechargeCh, setRechargeCh] = useState(epayOn ? 'alipay' : alipayOn ? 'alipay_direct' : 'wechat_native');
  // 微信扫码二维码弹窗：{ img: dataURL, outTradeNo, money }
  const [wxQr, setWxQr] = useState<{ img: string; outTradeNo: string; money: string } | null>(null);
  const recharge = async () => {
    if (!user) return setAuthOpen(true);
    const amt = Number(rechargeAmt);
    if (!(amt >= 1)) return toast.err('请输入充值金额（元）');
    try {
      if (rechargeCh === 'wechat_native') {
        // 微信 Native：下单拿 code_url → 渲染二维码 → 轮询订单状态自动到账
        const { data } = await api.post('/pay/wechat/create', { amount: amt });
        const img = await QRCode.toDataURL(data.codeUrl, { margin: 1, width: 220 });
        setWxQr({ img, outTradeNo: data.outTradeNo, money: data.money });
        return;
      }
      // 支付宝官方直连走 /pay/alipay/create；其余渠道走易支付聚合（皆为跳转支付）
      const { data } = rechargeCh === 'alipay_direct'
        ? await api.post('/pay/alipay/create', { amount: amt })
        : await api.post('/pay/epay/create', { amount: amt, channel: rechargeCh });
      window.location.href = data.payUrl;
    } catch (e: any) { toast.err(e.message); }
  };

  // 微信扫码弹窗开启时，轮询订单状态；支付成功(回调到账)后关闭弹窗 + 刷新余额
  useEffect(() => {
    if (!wxQr) return;
    let stop = false;
    const timer = setInterval(async () => {
      try {
        const { data } = await api.get('/pay/orders');
        const o = (data.orders || []).find((x: any) => x.outTradeNo === wxQr.outTradeNo);
        if (o && o.status === 'paid' && !stop) {
          stop = true;
          clearInterval(timer);
          setWxQr(null);
          await refresh();
          toast.ok('充值成功 🎉 积分已到账');
        }
      } catch { /* 网络抖动忽略，下次轮询继续 */ }
    }, 3000);
    const giveUp = setTimeout(() => clearInterval(timer), 5 * 60 * 1000); // 5 分钟后停止轮询
    return () => { stop = true; clearInterval(timer); clearTimeout(giveUp); };
  }, [wxQr]);

  const load = async () => {
    const [p, o, r] = await Promise.all([
      api.get('/mall/products'),
      user ? api.get('/mall/orders') : Promise.resolve({ data: { orders: [] } }),
      user ? api.get('/pay/orders').catch(() => ({ data: { orders: [] } })) : Promise.resolve({ data: { orders: [] } }),
    ]);
    setProducts(p.data.products); setOrders(o.data.orders); setPayOrders(r.data.orders || []);
  };
  useEffect(() => { setLoading(true); load().finally(() => setLoading(false)); }, [user?.id]);

  const redeem = (p: any) => {
    if (!user) return setAuthOpen(true);
    setPending(p);
  };
  const confirmRedeem = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/mall/products/${pending.id}/redeem`);
      patchUser(data.user);
      toast.ok('兑换成功 🎉');
      setPending(null);
      load();
    } catch (e: any) { toast.err(e.message); }
    finally { setBusy(false); }
  };
  const affordable = pending ? (user?.points || 0) >= pending.price : true;

  const layout = useLayout('mall', 'wide');
  return (
    <Shell layout={layout}>
      <div className="ui-card section-head">
        <h2 className="row gap-8"><Icon name="shop" size={19} style={{ color: 'var(--gold)' }} /> 积分商城</h2>
        {user && <div className="row gap-6 num" style={{ fontWeight: 700, color: 'var(--gold-deep)' }}><Icon name="coin" size={16} /> {fmtNum(user.points)}</div>}
      </div>

      <Tabs aria-label="商城" className="ui-card haha-feed-tabs"
        selectedKey={tab} onSelectionChange={(k: any) => setTab(k)}>
        <Tab key="shop" title="商品" />
        <Tab key="orders" title={<>我的兑换 {orders.length > 0 && `(${orders.length})`}</>} />
      </Tabs>

      {tab === 'shop' && payOn && (
        <div className="ui-card" style={{ padding: 16, marginBottom: 'var(--gap)' }}>
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}><Icon name="coin" size={16} /> 充值积分</div>
              <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>1 元 = 100 积分，支付成功后自动到账</div>
            </div>
            <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
              <Input className="haha-inp" type="number" min={1} value={rechargeAmt} onChange={(e: any) => setRechargeAmt(e.target.value)} style={{ maxWidth: 110 }} placeholder="金额(元)" />
              <select className="haha-inp" value={rechargeCh} onChange={(e) => setRechargeCh(e.target.value)} style={{ maxWidth: 130 }}>
                {epayOn && <option value="alipay">支付宝</option>}
                {epayOn && <option value="wxpay">微信</option>}
                {alipayOn && <option value="alipay_direct">支付宝（官方）</option>}
                {wechatOn && <option value="wechat_native">微信（扫码）</option>}
              </select>
              <Button color="primary" className="haha-btn-app" onClick={recharge}>去支付</Button>
            </div>
          </div>
        </div>
      )}

      {loading ? <CardGridSkeleton count={6} minWidth={200} /> : tab === 'shop' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--gap)' }}>
          {products.map((p) => (
            <div className="ui-card" key={p.id} style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <MallIcon p={p} size={52} />
                <span className="ui-badge" style={{ background: `color-mix(in srgb, ${(CAT_STYLE[p.category]||{}).color || 'var(--brand)'} 13%, transparent)`, color: (CAT_STYLE[p.category]||{}).color || 'var(--brand-strong)' }}>{CAT[p.category]}</span>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15.5 }}>{p.name}</div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>{p.description}</div>
              </div>
              {/* 限量行 + 价格行打包进 marginTop:auto 块，价格/兑换永远在卡片最底 —— 同排有无限量的卡片按钮对齐 */}
              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {p.stock >= 0 && <div className="faint" style={{ fontSize: 11 }}>限量 {p.stock} · 已兑 {p.sold}</div>}
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div className="row gap-4 num" style={{ fontWeight: 800, color: 'var(--gold-deep)' }}>
                    <Icon name="coin" size={16} /> {fmtNum(p.price)}
                  </div>
                  <Button
                    size="sm" color="primary"
                    variant={p.owned && p.category !== 'item' ? 'flat' : p.soldOut ? 'flat' : 'solid'}
                    className="haha-btn-app"
                    isDisabled={p.soldOut || (p.owned && p.category !== 'item')}
                    onClick={() => redeem(p)}>
                    {p.owned && p.category !== 'item' ? '已拥有' : p.soldOut ? '已售罄' : '兑换'}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (<>
        {payOrders.length > 0 && (
          <div className="ui-card" style={{ overflow: 'hidden', marginBottom: 'var(--gap)' }}>
            <div style={{ padding: '12px 18px', fontWeight: 700, fontSize: 14, borderBottom: '1px solid var(--line)' }}>充值记录</div>
            {payOrders.map((o: any, i: number) => (
              <div key={o.outTradeNo}>
                {i > 0 && <div className="divider" />}
                <div className="row gap-12" style={{ padding: '14px 18px', alignItems: 'center' }}>
                  <span style={{ width: 42, display: 'grid', placeItems: 'center' }}><Icon name="coin" size={22} style={{ color: 'var(--gold-deep)' }} /></span>
                  <div className="grow"><div style={{ fontWeight: 700 }}>充值 ¥{o.amount}</div><div className="faint" style={{ fontSize: 12 }}>{timeAgo(o.createdAt)} · {o.status === 'paid' ? '已到账' : '待支付'}</div></div>
                  <div className="num" style={{ color: o.status === 'paid' ? 'var(--good)' : 'var(--ink-3)', fontWeight: 700 }}>{o.status === 'paid' ? '+' : ''}{o.points} 积分</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="ui-card" style={{ overflow: 'hidden' }}>
          {!user ? <Empty icon="🔒" text="登录后查看兑换记录" />
            : orders.length === 0 ? <Empty icon="🛍️" text="还没有兑换记录，去逛逛吧" />
            : orders.map((o, i) => (
              <div key={o.id}>
                {i > 0 && <div className="divider" />}
                <div className="row gap-12" style={{ padding: '14px 18px' }}>
                  <MallIcon p={o} size={42} />
                  <div className="grow"><div style={{ fontWeight: 700 }}>{o.name}</div><div className="faint" style={{ fontSize: 12 }}>{timeAgo(o.created_at)}</div></div>
                  <div className="num" style={{ color: 'var(--gold-deep)', fontWeight: 700 }}>-{o.price}</div>
                </div>
              </div>
            ))}
        </div>
      </>)}

      <Modal isOpen={!!wxQr} onClose={() => setWxQr(null)} placement="center" size="sm">
        <ModalContent>
          <ModalHeader>微信扫码支付</ModalHeader>
          <ModalBody>
            {wxQr && (
              <div className="flex flex-col items-center gap-3" style={{ paddingBottom: 8, textAlign: 'center' }}>
                <img src={wxQr.img} alt="微信支付二维码" width={200} height={200} style={{ borderRadius: 12, border: '1px solid var(--line)' }} />
                <div style={{ fontWeight: 700, fontSize: 16 }}>¥{wxQr.money}</div>
                <div className="faint" style={{ fontSize: 13 }}>请用微信扫一扫完成支付</div>
                <div className="muted" style={{ fontSize: 12 }}>支付成功后积分自动到账，此窗口会自动关闭</div>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" fullWidth className="haha-btn-app" onClick={() => setWxQr(null)}>关闭</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={!!pending} onClose={() => !busy && setPending(null)} placement="center" size="sm">
        <ModalContent>
          <ModalHeader>确认兑换</ModalHeader>
          <ModalBody>
            {pending && (
              <div className="flex flex-col gap-3">
                <div className="row gap-12">
                  <MallIcon p={pending} size={48} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15.5 }}>{pending.name}</div>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.5 }}>{pending.description}</div>
                  </div>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', padding: '11px 14px', background: 'var(--surface-2)', borderRadius: 'var(--r-md)' }}>
                  <span className="muted" style={{ fontSize: 13 }}>需消耗积分</span>
                  <span className="row gap-4 num" style={{ fontWeight: 800, color: 'var(--gold-deep)' }}><Icon name="coin" size={16} /> {fmtNum(pending.price)}</span>
                </div>
                <div className="row" style={{ justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span className="faint">兑换后剩余</span>
                  <span className="num" style={{ fontWeight: 600, color: affordable ? 'var(--ink-2)' : 'var(--like)' }}>
                    {affordable ? fmtNum((user?.points || 0) - pending.price) : '积分不足'}
                  </span>
                </div>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" className="haha-btn-app" onClick={() => setPending(null)} isDisabled={busy}>取消</Button>
            <Button color="primary" className="haha-btn-app" onClick={confirmRedeem} isDisabled={busy || !affordable}>
              {busy ? '兑换中…' : affordable ? '确认兑换' : '积分不足'}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Shell>
  );
}
