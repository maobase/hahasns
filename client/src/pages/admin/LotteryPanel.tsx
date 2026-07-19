import { useState, useEffect } from 'react';
import Icon from '../../components/Icon';
import { Empty, RowSkeleton } from '../../components/States';
import { Input, Button } from '../../components/heroui';
import { useToast } from '../../context/ToastContext';
import api from '../../api/client';
import { timeAgo } from '../../lib/format';
import { confirmDialog } from '../../components/confirm';
import { ListHead, downloadCSV, SaveBtn } from './ui';

// 抽奖奖品后台：配置转盘 8 格奖品（名称/类型/值/权重）。weight 为中奖权重，前台不暴露。
const LOT_TYPES: [string, string][] = [['points', '积分'], ['title', '头衔'], ['frame', '头像框'], ['thanks', '谢谢参与']];
// 抽奖记录后台：汇总(总抽奖/实际中奖/谢谢参与) + 近 50 次抽奖（用户/奖品/类型）。便于核对发放与排查异常。
const LOT_TYPE_LABEL: Record<string, string> = { points: '积分', title: '头衔', frame: '头像框', thanks: '谢谢参与' };
function LotteryDraws() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api.get('/lottery/admin/draws').then(({ data }) => setData(data)).catch(() => setData({ stats: {}, draws: [] })); }, []);
  if (data === null) return <RowSkeleton rows={3} />;
  const s = data.stats || {};
  const bt = s.byType || {};
  const STAT_CARDS: [string, string][] = [
    ['总抽奖次数', (s.total || 0).toLocaleString()],
    ['实际中奖', (s.realWins || 0).toLocaleString()],
    ['谢谢参与', (bt.thanks || 0).toLocaleString()],
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
        <ListHead title="中奖记录" count={data.draws.length} action={
          <Button size="sm" variant="flat" className="haha-btn-app" isDisabled={!data.draws.length} onClick={() => downloadCSV('抽奖记录.csv', [
            { label: '用户', get: (d) => d.user?.nickname || '' }, { label: '奖品', get: (d) => d.prizeName }, { label: '类型', get: (d) => d.prizeType }, { label: '时间', get: (d) => d.createdAt },
          ], data.draws)}>导出 CSV</Button>
        } />
        {data.draws.length === 0 ? <Empty text="还没有抽奖记录" /> : data.draws.map((d: any, i: number) => {
          const real = d.prizeType !== 'thanks';
          return (
            <div key={d.id}>
              {i > 0 && <div className="divider" />}
              <div className="row gap-12" style={{ padding: '12px 18px', alignItems: 'center' }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row gap-6" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{d.user?.nickname || '已删除用户'}</span>
                    <span className="ui-badge" style={real ? { background: 'var(--brand-soft)', color: 'var(--brand-strong)' } : undefined}>{LOT_TYPE_LABEL[d.prizeType] || d.prizeType}</span>
                  </div>
                  <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>{d.prizeName} · {timeAgo(d.createdAt)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LotteryPanel() {
  const toast = useToast();
  const [list, setList] = useState<any[] | null>(null);
  const [cfg, setCfg] = useState<Record<string, string> | null>(null);
  const [savingCfg, setSavingCfg] = useState(false);
  const load = () => api.get('/lottery/prizes').then(({ data }) => setList(data.prizes)).catch(() => setList([]));
  useEffect(() => { load(); api.get('/admin/config').then(({ data }) => setCfg(data.config)).catch(() => setCfg({})); }, []);
  const setKcfg = (k: string, v: string) => setCfg((c) => ({ ...(c || {}), [k]: v }));
  const saveCfg = async () => { setSavingCfg(true); try { await api.put('/admin/config', { config: cfg }); toast.ok('抽奖配置已保存'); } catch (e: any) { toast.err(e.message); } finally { setSavingCfg(false); } };
  const setField = (i: number, k: string, v: any) => setList((l) => (l || []).map((p, j) => (j === i ? { ...p, [k]: v } : p)));
  const save = async (p: any) => {
    if (!p.name?.trim()) return toast.err('奖品名必填');
    try { await api.post('/lottery/prizes', p); toast.ok('已保存'); load(); } catch (e: any) { toast.err(e.message); }
  };
  const del = async (p: any, i: number) => {
    if (!p.id) { setList((l) => (l || []).filter((_, j) => j !== i)); return; }
    if (!(await confirmDialog('删除该奖品？'))) return;
    try { await api.delete(`/lottery/prizes/${p.id}`); toast.ok('已删除'); load(); } catch (e: any) { toast.err(e.message); }
  };
  const add = () => setList((l) => [...(l || []), { name: '', type: 'thanks', value: '', icon: 'gift', color: '', weight: 10, position: (l?.length || 0) }]);
  if (list === null) return <RowSkeleton rows={6} />;
  // 实时按权重算各奖品中奖概率（随权重输入即时更新，方便调转盘）
  const totalW = list.reduce((s, p) => s + Math.max(0, Number(p.weight) || 0), 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="faint" style={{ fontSize: 12.5, lineHeight: 1.6 }}>配置转盘奖品。<b>权重</b>越大越容易抽中（前台不展示）；类型：积分=自动加分、头衔/头像框=发放对应物品、谢谢参与=不发奖。建议保留 8 个奖品。</div>
      {cfg && (
        <div className="ui-card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>抽奖规则</div>
          <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>每次抽奖消耗的积分，以及每人每天的免费抽奖次数（留空用默认：88 积分 / 每日 1 次）。</div>
          <div className="sec-grid" style={{ marginTop: 12 }}>
            <label className="sec-field"><span className="sec-label">单次消耗</span><span className="sec-num"><input type="number" min={0} value={cfg.lottery_cost ?? ''} placeholder="88" onChange={(e) => setKcfg('lottery_cost', e.target.value)} /><i>积分</i></span></label>
            <label className="sec-field"><span className="sec-label">每日免费次数</span><span className="sec-num"><input type="number" min={0} value={cfg.lottery_free_daily ?? ''} placeholder="1" onChange={(e) => setKcfg('lottery_free_daily', e.target.value)} /><i>次</i></span></label>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            <Button size="sm" color="primary" className="haha-btn-app" onClick={saveCfg} isDisabled={savingCfg}>{savingCfg ? '保存中…' : '保存规则'}</Button>
          </div>
        </div>
      )}
      {list.map((p, i) => (
        <div className="ui-card" style={{ padding: 14 }} key={p.id ?? 'new' + i}>
          <div className="sec-grid">
            <label className="sec-field"><span className="sec-label">奖品名 <i className="sec-req">*</i></span><Input className="haha-inp" value={p.name} onChange={(e: any) => setField(i, 'name', e.target.value)} placeholder="如 100 积分" /></label>
            <label className="sec-field"><span className="sec-label">类型</span><select className="haha-inp" value={p.type} onChange={(e) => setField(i, 'type', e.target.value)}>{LOT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="sec-field"><span className="sec-label">奖品值（积分数 / 物品标识）</span><Input className="haha-inp" value={p.value} onChange={(e: any) => setField(i, 'value', e.target.value)} placeholder="积分填数字，如 100" /></label>
            <label className="sec-field"><span className="sec-label">权重</span><Input className="haha-inp" type="number" min={0} value={p.weight} onChange={(e: any) => setField(i, 'weight', e.target.value)} /></label>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <span className="faint" style={{ marginRight: 'auto', fontSize: 12.5 }}>中奖概率 <b className="num" style={{ color: 'var(--brand)' }}>{totalW > 0 ? ((Math.max(0, Number(p.weight) || 0) / totalW) * 100).toFixed(1) : '0.0'}%</b></span>
            <Button size="sm" variant="flat" className="haha-btn-app danger" onClick={() => del(p, i)}><Icon name="trash" size={14} style={{ width: 14, height: 14 }} /> 删除</Button>
            <SaveBtn onSave={() => save(p)} />
          </div>
        </div>
      ))}
      <Button variant="flat" fullWidth className="haha-btn-app" onClick={add}><Icon name="plus" size={15} style={{ width: 15, height: 15 }} /> 新增奖品</Button>
      <div className="sec-head" style={{ marginTop: 6 }}>抽奖记录</div>
      <LotteryDraws />
    </div>
  );
}
