import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Modal from './Modal';
import Icon from './Icon';
import { Spinner } from './heroui';
import { useToast } from '../context/ToastContext';
import api from '../api/client';

// 「加入专题」选择器：列出我的专题，点选即把目标(post/article)收录进去。
export default function CollectModal({
  open,
  onClose,
  targetType,
  targetId,
}: {
  open: boolean;
  onClose: () => void;
  targetType: 'post' | 'article';
  targetId: number;
}) {
  const toast = useToast();
  const [colls, setColls] = useState<any[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setColls(null);
    api.get('/collections/mine').then(({ data }) => setColls(data.collections)).catch(() => setColls([]));
  }, [open]);

  const add = async (cid: number) => {
    try { await api.post(`/collections/${cid}/items`, { targetType, targetId }); onClose(); toast.ok('已加入专题'); }
    catch (e: any) { toast.err(e.message); }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-head"><div className="modal-title">加入专题</div></div>
      <div className="modal-body">
        {colls === null ? (
          <div style={{ padding: 16, textAlign: 'center' }}><Spinner /></div>
        ) : colls.length === 0 ? (
          <div className="faint" style={{ textAlign: 'center', padding: '8px 0 14px', fontSize: 14 }}>
            你还没有专题。<Link to="/collections" onClick={onClose} style={{ color: 'var(--brand)' }}>去创建一个</Link>
          </div>
        ) : (
          <div className="coll-pick">
            {colls.map((c: any) => (
              <button key={c.id} className="coll-pick-row" onClick={() => add(c.id)}>
                <span className="coll-pick-cover" style={c.cover ? { backgroundImage: `url(${c.cover})` } : {}}>{!c.cover && <Icon name="grid" size={16} />}</span>
                <span className="coll-pick-title nowrap">{c.title}</span>
                <span className="faint" style={{ fontSize: 12 }}>{c.itemCount} 篇</span>
              </button>
            ))}
          </div>
        )}
        <Link to="/collections" onClick={onClose} className="haha-btn-app haha-btn-app--ghost haha-btn-app--block" style={{ marginTop: 10 }}><Icon name="plus" size={15} /> 新建专题</Link>
      </div>
    </Modal>
  );
}
