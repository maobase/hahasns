import { useState } from 'react';
import Modal from '../Modal';
import Icon from '../Icon';
import { Button } from '../heroui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api from '../../api/client';

// 打赏弹窗：预设金额选择 + 自定义积分 + 确认打赏。受控 open/onClose；
// rewardAmt 为弹窗局部 state（组件常驻挂载，跨开关保留，与抽离前行为一致）。
export interface TipModalProps {
  open: boolean;
  onClose: () => void;
  postId: number;
  nickname?: string;
}

export default function TipModal({ open, onClose, postId, nickname }: TipModalProps) {
  const { user, patchUser } = useAuth();
  const toast = useToast();
  const [rewardAmt, setRewardAmt] = useState<any>(18);

  const doReward = async () => {
    const amt = Math.max(1, Number(rewardAmt) || 0);
    if (amt > (user?.points || 0)) return toast.err('积分不足，先去签到赚积分吧');
    try {
      await api.post(`/posts/${postId}/reward`, { amount: amt });
      patchUser({ points: (user?.points || 0) - amt });
      onClose();
      toast.ok(`已打赏 ${amt} 积分 🎁`);
    } catch (e: any) { toast.err(e.message); }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-head"><div className="modal-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="gift" size={18} /> 打赏 {nickname}</div><div className="modal-sub">你当前有 {user?.points ?? 0} 积分</div></div>
      <div className="modal-body">
        <div className="row gap-8" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
          {[6, 18, 66, 188, 520].map((a) => (
            <Button key={a} color="primary" variant={Number(rewardAmt) === a ? 'solid' : 'bordered'} className="haha-btn-app" onClick={() => setRewardAmt(a)}>{a}</Button>
          ))}
        </div>
        <div className="field">
          <label>自定义积分</label>
          <input type="number" min={1} value={rewardAmt} onChange={(e) => setRewardAmt(e.target.value)} />
        </div>
        <Button size="lg" color="primary" fullWidth className="haha-btn-app" onClick={doReward}>确认打赏 {rewardAmt} 积分</Button>
      </div>
    </Modal>
  );
}
