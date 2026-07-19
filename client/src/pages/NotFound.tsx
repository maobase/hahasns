import { Link, useNavigate } from 'react-router-dom';
import Shell from '../components/Shell';
import { Button } from '../components/heroui';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <Shell right={false}>
      <div className="ui-card">
        <div className="empty" style={{ padding: '72px 20px' }}>
          <div className="e-ico" style={{ fontSize: 56 }}>🧭</div>
          <div style={{ fontSize: 19, fontWeight: 800, marginTop: 12 }}>页面走丢了</div>
          <div className="muted" style={{ fontSize: 14, marginTop: 6 }}>你访问的页面可能已被删除，或链接有误</div>
          {/* 失效页面多由旧链接（如已删动态）进来：优先「返回上一页」更省事；无历史时只显示回首页 */}
          <div className="row gap-8" style={{ justifyContent: 'center', marginTop: 22, flexWrap: 'wrap' }}>
            {window.history.length > 1 && (
              <Button type="button" size="lg" variant="flat" className="haha-btn-app" onClick={() => navigate(-1)}>返回上一页</Button>
            )}
            <Link to="/" className="haha-btn-app haha-btn-app--primary haha-btn-app--lg">返回首页</Link>
          </div>
        </div>
      </div>
    </Shell>
  );
}
