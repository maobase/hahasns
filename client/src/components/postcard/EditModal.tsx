import Modal from '../Modal';
import { Button } from '../heroui';

// 编辑弹窗：纯受控组件。editText 会被操作菜单在打开前重置为当前正文（属共享 state），
// 故 value / onChange / onSave 全部由 PostCard 下传。
export interface EditModalProps {
  open: boolean;
  onClose: () => void;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
}

export default function EditModal({ open, onClose, value, onChange, onSave }: EditModalProps) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-head"><div className="modal-title">编辑动态</div></div>
      <div className="modal-body">
        <textarea className="field" style={{ width: '100%', minHeight: 110, padding: 12, border: '1.5px solid var(--line-2)', borderRadius: 10, background: 'var(--surface)', color: 'var(--ink)' }}
          value={value} onChange={(e) => onChange(e.target.value)} autoFocus />
        <Button size="lg" color="primary" fullWidth className="haha-btn-app" onClick={onSave} isDisabled={!value.trim()}>保存修改</Button>
      </div>
    </Modal>
  );
}
