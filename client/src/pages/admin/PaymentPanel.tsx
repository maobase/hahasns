import { useState, useEffect } from 'react';
import Icon from '../../components/Icon';
import { Empty, RowSkeleton } from '../../components/States';
import { Input, Textarea, Button } from '../../components/heroui';
import { useToast } from '../../context/ToastContext';
import api from '../../api/client';
import { fmtNum, timeAgo } from '../../lib/format';
import { Toggle, ListHead, downloadCSV } from './ui';

// 充值订单后台查看：汇总(已支付笔数/金额/积分) + 近 50 笔订单（用户/渠道/金额/积分/状态）。
function PayOrders() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api.get('/pay/admin/orders').then(({ data }) => setData(data)).catch(() => setData({ stats: {}, orders: [] })); }, []);
  if (data === null) return <RowSkeleton rows={4} />;
  const s = data.stats || {};
  const ST: Record<string, [string, string]> = {
    paid: ['已支付', 'var(--good)'], pending: ['待支付', 'var(--gold-deep)'], failed: ['失败', 'var(--like)'],
  };
  const CH: Record<string, string> = { alipay: '支付宝', wxpay: '微信', wechat: '微信' };
  const STAT_CARDS: [string, string][] = [
    ['已支付笔数', `${(s.paidCount || 0).toLocaleString()} / ${(s.total || 0).toLocaleString()}`],
    ['到账金额', `¥${s.paidAmount || '0.00'}`],
    ['发放积分', (s.paidPoints || 0).toLocaleString()],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {STAT_CARDS.map(([k, v]) => (
          <div className="ui-card stat-card" key={k} style={{ padding: 16 }}>
            <span className="muted" style={{ fontSize: 12.5 }}>{k}</span>
            <div className="num" style={{ fontWeight: 700, marginTop: 8, fontSize: 22 }}>{v}</div>
          </div>
        ))}
      </div>
      <div className="ui-card" style={{ padding: 0, overflow: 'hidden' }}>
        <ListHead title="充值订单" count={data.orders.length} action={
          <Button size="sm" variant="flat" className="haha-btn-app" isDisabled={!data.orders.length} onClick={() => downloadCSV('充值订单.csv', [
            { label: '订单号', get: (o) => o.outTradeNo }, { label: '用户', get: (o) => o.user?.nickname || '' }, { label: '渠道', get: (o) => o.channel },
            { label: '金额', get: (o) => o.amount }, { label: '积分', get: (o) => o.points }, { label: '状态', get: (o) => o.status }, { label: '时间', get: (o) => o.createdAt },
          ], data.orders)}>导出 CSV</Button>
        } />
        {data.orders.length === 0 ? <Empty text="还没有充值订单" /> : data.orders.map((o: any, i: number) => {
          const st = ST[o.status] || [o.status, 'var(--ink-3)'];
          return (
            <div key={o.outTradeNo}>
              {i > 0 && <div className="divider" />}
              <div className="row gap-12" style={{ padding: '12px 18px', alignItems: 'center' }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row gap-6" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{o.user?.nickname || '已删除用户'}</span>
                    <span className="ui-badge">{CH[o.channel] || o.channel}</span>
                  </div>
                  <div className="faint num" style={{ fontSize: 12, marginTop: 3, wordBreak: 'break-all' }}>{o.outTradeNo} · {timeAgo(o.createdAt)}</div>
                </div>
                <div style={{ textAlign: 'right', flex: 'none' }}>
                  <div className="num" style={{ fontWeight: 700, fontSize: 15 }}>¥{o.amount}</div>
                  <div className="faint num" style={{ fontSize: 12 }}>+{fmtNum(o.points)} 分</div>
                </div>
                <span className="ui-badge" style={{ background: `color-mix(in srgb, ${st[1]} 13%, transparent)`, color: st[1], flex: 'none' }}>{st[0]}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 支付配置：支付宝 / 微信 / 易支付 三家网关开关 + 凭据（凭据仅 admin 可读写，公开接口不暴露）。
export default function PaymentPanel() {
  const toast = useToast();
  const [cfg, setCfg] = useState<Record<string, string> | null>(null);
  const [secretsSet, setSecretsSet] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get('/admin/config').then(({ data }) => { setCfg(data.config); setSecretsSet(data.secretsSet || {}); }).catch(() => setCfg({})); }, []);
  const setK = (k: string, v: string) => setCfg((c) => ({ ...(c || {}), [k]: v }));
  const save = async () => { setSaving(true); try { await api.put('/admin/config', { config: cfg }); toast.ok('支付配置已保存'); } catch (e: any) { toast.err(e.message); } finally { setSaving(false); } };
  if (cfg === null) return <RowSkeleton rows={6} />;
  // secret=true 的字段为敏感凭据：后端不回显原值；已配置时占位提示「留空保持不变」
  const fld = (k: string, label: string, ph: string, area = false, secret = false) => {
    const isSet = secret && secretsSet[k];
    const placeholder = isSet ? '已配置 ••••••（留空保持不变，重填则更新）' : ph;
    return (
      <label className="sec-field" style={area ? { gridColumn: '1 / -1' } : undefined}>
        <span className="sec-label">{label}{secret ? <Icon name="shield" size={12} style={{ color: 'var(--ink-4)', verticalAlign: '-1px', marginLeft: 4 }} /> : null}</span>
        {area
          ? <Textarea className="haha-inp" minRows={2} value={cfg[k] ?? ''} onChange={(e: any) => setK(k, e.target.value)} placeholder={placeholder} />
          : <Input className="haha-inp" value={cfg[k] ?? ''} onChange={(e: any) => setK(k, e.target.value)} placeholder={placeholder} />}
      </label>
    );
  };
  const gw = (enableKey: string, name: string, fields: React.ReactNode) => {
    const on = cfg[enableKey] === '1';
    return (
      <div className="ui-card" style={{ padding: 18 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="row gap-8" style={{ fontWeight: 700, fontSize: 14.5, alignItems: 'center' }}>
            {name}
            <span className="ui-badge" style={on
              ? { background: 'var(--good-soft)', color: 'var(--good)' }
              : { background: 'var(--surface-2)', color: 'var(--ink-3)' }}>{on ? '已启用' : '未启用'}</span>
          </span>
          <Toggle on={on} onChange={(v) => setK(enableKey, v ? '1' : '0')} />
        </div>
        {/* 未启用时淡化配置区，给出清晰的启停视觉状态（仍可编辑，方便启用前预填凭据） */}
        <div className="sec-grid" style={{ marginTop: 14, opacity: on ? 1 : 0.6, transition: 'opacity var(--dur-fast) var(--ease-out)' }}>{fields}</div>
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="faint" style={{ fontSize: 12.5, lineHeight: 1.6 }}>配置三家支付网关用于会员充值 / 积分购买。密钥等凭据仅服务端保存、仅管理员可见，公开接口只暴露「是否启用」。开启后将在充值页展示对应支付方式。</div>
      {gw('pay_alipay_enabled', '支付宝', <>{fld('pay_alipay_appid', 'App ID', '支付宝应用 AppID')}{fld('pay_alipay_key', '应用私钥', '商户应用私钥（PKCS8，可粘裸 base64）', true, true)}{fld('pay_alipay_public_key', '支付宝公钥', '支付宝公钥（验回调签名，可粘裸 base64）', true)}{fld('pay_alipay_gateway', '网关地址', 'https://openapi.alipay.com/gateway.do')}</>)}
      {gw('pay_wechat_enabled', '微信支付', <>{fld('pay_wechat_appid', 'AppID', '公众号/小程序/APP AppID')}{fld('pay_wechat_mchid', '商户号 MchID', '微信支付商户号')}{fld('pay_wechat_key', 'APIv3 密钥', 'APIv3 密钥（32 位）', false, true)}{fld('pay_wechat_private_key', '商户 API 私钥', '商户 API 私钥（PKCS8，可粘裸 base64）', true, true)}{fld('pay_wechat_serial', '证书序列号', '商户 API 证书序列号')}</>)}
      {gw('pay_epay_enabled', '易支付', <>{fld('pay_epay_pid', '商户 PID', '易支付商户 ID')}{fld('pay_epay_key', '商户密钥', '易支付商户密钥', false, true)}{fld('pay_epay_url', '网关地址', 'https://pay.example.com/')}</>)}
      {/* 演示充值开关：默认开（未配置视为开）。开=会员页可「模拟充值/开通会员」免真实支付（适合体验/演示）；关=必须走上方真实支付渠道，杜绝免费刷余额/会员。正式收款上线后建议关闭。 */}
      {(() => {
        const demoOn = (cfg['demo_recharge_enabled'] ?? '1') !== '0';
        return (
          <div className="ui-card" style={{ padding: 18 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="row gap-8" style={{ fontWeight: 700, fontSize: 14.5, alignItems: 'center' }}>
                演示充值
                <span className="ui-badge" style={demoOn
                  ? { background: 'var(--warn-soft, var(--surface-2))', color: 'var(--warn, var(--ink-3))' }
                  : { background: 'var(--good-soft)', color: 'var(--good)' }}>{demoOn ? '开启（可免费充值）' : '已关闭（仅真实支付）'}</span>
              </span>
              <Toggle on={demoOn} onChange={(v) => setK('demo_recharge_enabled', v ? '1' : '0')} />
            </div>
            <div className="faint" style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 10 }}>
              开启时「会员中心」可模拟充值余额、开通会员，不产生真实扣费——适合体验与演示。<b>正式收款上线后请关闭</b>，否则用户可绕过支付渠道免费获取余额 / 会员。关闭后模拟充值将被拒绝，需通过上方已启用的支付网关充值。
            </div>
          </div>
        );
      })()}
      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>充值档位</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>会员中心充值页展示的金额按钮（单位：分，逗号分隔，最多 8 档；留空用内置默认 1000,3000,6800,19800）。例如 1000 显示为 ¥10。</div>
        <Input className="haha-inp" value={cfg.recharge_tiers ?? ''} onChange={(e: any) => setK('recharge_tiers', e.target.value)} placeholder="1000,3000,6800,19800" maxLength={200} style={{ marginTop: 10 }} />
        <div style={{ fontWeight: 700, fontSize: 14.5, marginTop: 16 }}>付费内容价格上限</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>用户发「付费解锁」动态时允许的最高积分价格（留空用默认 100000）。</div>
        <label className="sec-field" style={{ marginTop: 10 }}><span className="sec-num"><input type="number" min={1} value={cfg.paid_price_max ?? ''} placeholder="100000" onChange={(e) => setK('paid_price_max', e.target.value)} /><i>积分</i></span></label>
        <div style={{ fontWeight: 700, fontSize: 14.5, marginTop: 16 }}>VIP 档位月价</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>会员页展示的各 VIP 档位月价（单位：分；留空用内置默认 1200 / 3600 / 9800，即 ¥12 / 36 / 98）。仅影响会员页展示文案。</div>
        <div className="sec-grid" style={{ marginTop: 10 }}>
          {([['vip1_price', '青铜 VIP1', 1200], ['vip2_price', '黄金 VIP2', 3600], ['vip3_price', '黑钻 VIP3', 9800]] as [string, string, number][]).map(([k, label, def]) => (
            <label className="sec-field" key={k}>
              <span className="sec-label">{label}</span>
              <span className="sec-num"><input type="number" min={0} value={cfg[k] ?? ''} placeholder={String(def)} onChange={(e) => setK(k, e.target.value)} /><i>分</i></span>
            </label>
          ))}
        </div>
        <div style={{ fontWeight: 700, fontSize: 14.5, marginTop: 16 }}>VIP 档位名称与标语</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>自定义各档位显示名称与一句话标语（留空用内置默认：青铜 / 黄金 / 黑钻会员）。</div>
        <div className="sec-grid" style={{ marginTop: 10 }}>
          {([['vip1_name', 'VIP1 名称', '青铜会员'], ['vip1_tagline', 'VIP1 标语', '入门尊享，畅快互动'], ['vip2_name', 'VIP2 名称', '黄金会员'], ['vip2_tagline', 'VIP2 标语', '高频活跃用户之选'], ['vip3_name', 'VIP3 名称', '黑钻会员'], ['vip3_tagline', 'VIP3 标语', '至尊体验，全部解锁']] as [string, string, string][]).map(([k, label, ph]) => (
            <label className="sec-field" key={k}>
              <span className="sec-label">{label}</span>
              <Input className="haha-inp" value={cfg[k] ?? ''} placeholder={ph} onChange={(e: any) => setK(k, e.target.value)} maxLength={k.includes('tagline') ? 60 : 40} />
            </label>
          ))}
        </div>
        <div style={{ fontWeight: 700, fontSize: 14.5, marginTop: 16 }}>VIP 档位权益</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>各档位权益清单，每行一条（留空用内置默认）。建议与上方积分加成等实际配置保持一致。</div>
        <div className="flex flex-col gap-3" style={{ marginTop: 10 }}>
          {([['vip1_perks', '青铜 VIP1 权益'], ['vip2_perks', '黄金 VIP2 权益'], ['vip3_perks', '黑钻 VIP3 权益']] as [string, string][]).map(([k, label]) => (
            <label className="sec-field" key={k}>
              <span className="sec-label">{label}</span>
              <Textarea className="haha-inp" minRows={4} value={cfg[k] ?? ''} maxLength={600} onChange={(e: any) => setK(k, e.target.value)} placeholder="每行一条权益" style={{ lineHeight: 1.6 }} />
            </label>
          ))}
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button color="primary" className="haha-btn-app" onClick={save} isDisabled={saving}>{saving ? '保存中…' : '保存支付配置'}</Button>
      </div>
      <div className="sec-head" style={{ marginTop: 6 }}>充值订单</div>
      <PayOrders />
    </div>
  );
}
