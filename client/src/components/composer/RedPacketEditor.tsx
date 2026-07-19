import Icon from '../Icon';
import { Input } from '../heroui';

// 积分红包编辑器：总积分 / 个数 / 祝福语 + 实时校验提示。受控组件，state 留在 Composer。
export interface RedPacketValue {
  points: any;
  count: any;
  blessing: string;
}

export default function RedPacketEditor({ value, onChange, userPoints }: { value: RedPacketValue; onChange: (v: RedPacketValue | null) => void; userPoints: number }) {
  return (
    <div className="rp-editor">
      <div className="rp-editor-head">
        <span><Icon name="redpacket" size={15} /> 积分红包</span>
        <button className="faint" style={{ fontSize: 12.5 }} onClick={() => onChange(null)}>移除</button>
      </div>
      <div className="rp-editor-row">
        <label className="rp-ef"><span>总积分</span>
          <Input type="number" min={1} value={value.points} onChange={(e: any) => onChange({ ...value, points: e.target.value })} className="haha-inp haha-inp-sm" /></label>
        <label className="rp-ef"><span>红包个数</span>
          <Input type="number" min={1} max={100} value={value.count} onChange={(e: any) => onChange({ ...value, count: e.target.value })} className="haha-inp haha-inp-sm" /></label>
      </div>
      <Input className="haha-inp haha-inp-sm rp-ef-bless" maxLength={30} placeholder="祝福语（选填）" value={value.blessing}
        onChange={(e: any) => onChange({ ...value, blessing: e.target.value })} />
      <div className="rp-editor-hint">
        {Number(value.count) > 0 && `${value.count} 个红包随机分配 ${Number(value.points) || 0} 积分，先到先得 · `}
        你当前 {userPoints} 积分
      </div>
      {(() => {
        const c = Number(value.count) || 0, p = Number(value.points) || 0;
        const err = c < 1 ? '红包个数至少 1 个' : p < c ? `${c} 个红包至少需要 ${c} 积分` : userPoints < p ? '积分不足，发不出这么大的红包' : '';
        return err ? <div style={{ fontSize: 12, color: 'var(--danger, #d64545)', padding: '2px 2px 0' }}>{err}</div> : null;
      })()}
    </div>
  );
}
