import Icon from '../Icon';
import { Input } from '../heroui';

// 高级选项行：解锁价格（付费可见）/ 访问密码（密码可见）/ 所在位置。受控组件，state 留在 Composer。
export interface AdvancedFieldsProps {
  vis: string;
  price: any;
  onPriceChange: (v: any) => void;
  paidPriceMax: number;
  password: string;
  onPasswordChange: (v: string) => void;
  showLoc: boolean;
  location: string;
  onLocationChange: (v: string) => void;
  onLocationClear: () => void;
}

export default function AdvancedFields({ vis, price, onPriceChange, paidPriceMax, password, onPasswordChange, showLoc, location, onLocationChange, onLocationClear }: AdvancedFieldsProps) {
  return (
    <>
      {vis === 'paid' && (
        <div className="row gap-8" style={{ marginTop: 10, fontSize: 13 }}>
          <span className="muted">解锁价格</span>
          <Input type="number" min={1} max={paidPriceMax} value={price} onChange={(e: any) => onPriceChange(e.target.value)}
            className="haha-inp haha-inp-sm" style={{ width: 96 }} />
          <span className="muted">积分</span>
        </div>
      )}
      {vis === 'password' && (
        <div className="row gap-8" style={{ marginTop: 10, fontSize: 13 }}>
          <span className="muted">访问密码</span>
          <Input value={password} onChange={(e: any) => onPasswordChange(e.target.value)} placeholder="设置查看密码"
            className="haha-inp haha-inp-sm" style={{ width: 170 }} />
        </div>
      )}
      {showLoc && (
        <div className="row gap-8" style={{ marginTop: 10, fontSize: 13 }}>
          <Icon name="location" size={15} style={{ color: 'var(--brand)' }} />
          <Input value={location} onChange={(e: any) => onLocationChange(e.target.value)} placeholder="所在城市，如：上海" maxLength={20}
            className="haha-inp haha-inp-sm" style={{ width: 210 }} />
          {location && <button className="faint" style={{ fontSize: 12 }} onClick={onLocationClear}>清除</button>}
        </div>
      )}
    </>
  );
}
