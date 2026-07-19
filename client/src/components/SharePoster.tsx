import { useState, useEffect, useRef } from 'react';
import { toPng } from 'html-to-image';
import QRCode from 'qrcode';
import Modal from './Modal';
import Icon from './Icon';
import { Spinner } from './heroui';
import { useSite } from '../context/SiteContext';
import { useToast } from '../context/ToastContext';

const GRADS = ['linear-gradient(140deg,#7c5cff,#5b8def)', 'linear-gradient(140deg,#22b8cf,#0ca678)', 'linear-gradient(140deg,#ff922b,#f76707)', 'linear-gradient(140deg,#f06595,#e64980)', 'linear-gradient(140deg,#20c997,#12b886)', 'linear-gradient(140deg,#cc5de8,#ae3ec9)'];
function gradOf(s = '') { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return GRADS[Math.abs(h) % GRADS.length]; }

// 分享海报：把一条动态生成一张带二维码的品牌海报图（前端 html-to-image，纯 CSS+二维码，无跨域图）。
export default function SharePoster({ open, onClose, post }: { open: boolean; onClose: () => void; post: any }) {
  const site = useSite();
  const toast = useToast();
  const posterRef = useRef<HTMLDivElement | null>(null);
  const [img, setImg] = useState<string>('');
  const [qr, setQr] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const author = post?.author || {};
  const name = author.nickname || author.username || '匿名用户';
  const initial = (name.trim()[0] || '?').toUpperCase();
  const url = `${window.location.origin}/post/${post?.id}`;
  const rawContent = (post?.content || '').replace(/[#@]/g, '').trim();
  const content = (rawContent.length > 110 ? rawContent.slice(0, 110) + '…' : rawContent) || '分享一条动态';

  // 生成二维码
  useEffect(() => {
    if (!open) return;
    setImg(''); setQr('');
    QRCode.toDataURL(url, { margin: 1, width: 160, color: { dark: '#1b2030', light: '#ffffff' } })
      .then(setQr).catch(() => setQr(''));
  }, [open, url]);

  // 二维码就绪后把海报 DOM 截成 PNG
  useEffect(() => {
    if (!open || !qr || !posterRef.current) return;
    setBusy(true);
    const t = setTimeout(() => {
      toPng(posterRef.current as HTMLElement, { pixelRatio: 2, cacheBust: true, backgroundColor: '#eef1f6' })
        .then(setImg)
        .catch(() => toast.err('海报生成失败，请重试'))
        .finally(() => setBusy(false));
    }, 120);
    return () => clearTimeout(t);
  }, [open, qr]);

  const download = () => {
    if (!img) return;
    const a = document.createElement('a');
    a.href = img; a.download = `hahasns-${post?.id || 'post'}.png`; a.click();
    toast.ok('海报已保存');
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-head"><div className="modal-title">分享海报</div></div>
      <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        {/* 离屏海报 DOM（用于截图，内联样式确保 html-to-image 稳定捕获） */}
        <div style={{ position: 'fixed', left: -9999, top: 0 }} aria-hidden>
          <div ref={posterRef} style={{ width: 360, padding: 28, boxSizing: 'border-box', background: 'linear-gradient(160deg,#f7f9fc,#eef1f6)', fontFamily: 'inherit' }}>
            <div style={{ background: '#fff', borderRadius: 20, padding: 26, boxShadow: '0 10px 30px rgba(20,30,55,.10)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(140deg,#3b6cff,#2b53e6)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 16 }}>H</span>
                <span style={{ fontWeight: 800, fontSize: 17, color: '#1b2030' }}>{site.name}</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9aa3b2' }}>{site.slogan}</span>
              </div>
              <div style={{ fontSize: 34, lineHeight: 1, color: '#3b6cff', fontWeight: 800, marginBottom: 2 }}>&ldquo;</div>
              <div style={{ fontSize: 17, lineHeight: 1.7, color: '#222a3a', fontWeight: 500, minHeight: 80 }}>{content}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 22, paddingTop: 18, borderTop: '1px solid #eef0f4' }}>
                <span style={{ width: 40, height: 40, borderRadius: '32%', background: gradOf(name), color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18 }}>{initial}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#1b2030' }}>{name}</div>
                  {author.username && <div style={{ fontSize: 12.5, color: '#9aa3b2' }}>@{author.username}</div>}
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'center' }}>
                  {qr && <img src={qr} width={66} height={66} alt="" style={{ display: 'block', borderRadius: 6 }} />}
                  <div style={{ fontSize: 10, color: '#9aa3b2', marginTop: 3 }}>扫码查看</div>
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'center', fontSize: 11.5, color: '#9aa3b2', marginTop: 14 }}>来自 {site.name} · 长按识别二维码</div>
          </div>
        </div>

        {/* 预览 + 保存 */}
        {img ? (
          <img src={img} alt="分享海报" style={{ width: 280, borderRadius: 14, boxShadow: 'var(--shadow-pop)' }} />
        ) : (
          <div style={{ width: 280, height: 360, display: 'grid', placeItems: 'center' }}>
            <Spinner />
          </div>
        )}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy || !img} onClick={download}>
          <Icon name="share" size={16} /> 保存海报
        </button>
        <div className="faint" style={{ fontSize: 12, textAlign: 'center' }}>保存到相册后即可分享到微信/朋友圈，好友扫码即可查看</div>
      </div>
    </Modal>
  );
}
