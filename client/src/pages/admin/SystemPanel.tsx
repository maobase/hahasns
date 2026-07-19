import { useState, useEffect } from 'react';
import Icon from '../../components/Icon';
import { RowSkeleton } from '../../components/States';
import { Spinner, Button } from '../../components/heroui';
import { useToast } from '../../context/ToastContext';
import api from '../../api/client';
import { confirmDialog } from '../../components/confirm';
import { APP_VERSION } from '../../version';

// 系统更新：检测新版 + 半自动一键升级（详见 UPGRADE.md）。
export default function SystemPanel() {
  const toast = useToast();
  const [st, setSt] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const load = async (manual?: boolean) => {
    if (manual) setChecking(true);
    try { const { data } = await api.get('/admin/system/status'); setSt(data); }
    catch { setSt({ error: true }); }
    finally { if (manual) setChecking(false); }
  };
  useEffect(() => {
    load();
    // GitHub 最新版检测在后端后台异步刷新，首拉可能未就绪 → 3.5s 后自动再拉一次拿到结果
    const t = setTimeout(() => load(), 3500);
    return () => clearTimeout(t);
    /* eslint-disable-next-line */
  }, []);
  useEffect(() => {
    if (!st?.upgrading) return;
    const t = setInterval(async () => {
      try { const { data } = await api.get('/admin/system/status'); setSt(data); if (!data.upgrading) { toast.ok('升级已完成，请刷新页面加载新版本 🎉'); clearInterval(t); } } catch { /* 重启中短暂不可达，忽略 */ }
    }, 12000);
    return () => clearInterval(t);
    /* eslint-disable-next-line */
  }, [st?.upgrading]);
  const doUpgrade = async () => {
    if (!(await confirmDialog('升级会拉取最新代码、迁移数据库并重启服务（约数分钟，其间可能短暂不可用）。建议先确认已备份数据库。确定现在升级？', { title: '一键升级到最新版', confirmText: '开始升级', danger: true }))) return;
    try { const { data } = await api.post('/admin/system/upgrade'); if (data.started) { toast.ok(data.message); load(); } else toast.err(data.message); }
    catch (e: any) { toast.err(e.message); }
  };
  if (!st) return <RowSkeleton rows={4} />;
  const up = !!(st.latestVersion && st.latestVersion !== APP_VERSION);
  return (
    <div className="flex flex-col gap-4">
      <div className="ui-card" style={{ padding: 18 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>版本信息</div>
            <div className="faint" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.7 }}>
              当前版本：<b className="num">{APP_VERSION}</b>{st.currentCommit && <> · commit <span className="num">{st.currentCommit}</span></>}<br />
              最新版本：{st.canCheck ? <span className="num">{st.latestVersion || '—'}</span> : <span className="faint">（GitHub 检测暂不可用）</span>}
            </div>
          </div>
          <Button size="sm" variant="flat" className="haha-btn-app" isDisabled={checking} onClick={() => load(true)}><Icon name="rocket" size={14} style={{ width: 14, height: 14 }} /> {checking ? '检查中…' : '检查更新'}</Button>
        </div>
        <div style={{ marginTop: 14 }}>
          {st.upgrading ? (
            <div className="row gap-8" style={{ alignItems: 'center', color: 'var(--brand)', fontWeight: 600 }}><Spinner size="sm" /> 升级进行中，完成后服务会自动重启，请稍候…</div>
          ) : up ? (
            <div className="row gap-8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--like)', fontWeight: 700 }}>● 有新版本可用</span>
              {st.upgradeEnabled
                ? <Button color="primary" className="haha-btn-app" onClick={doUpgrade}><Icon name="rocket" size={15} style={{ width: 15, height: 15 }} /> 一键升级</Button>
                : <span className="faint" style={{ fontSize: 12.5 }}>（后台升级未启用，见下方说明）</span>}
              <a className="haha-btn-app haha-btn-app--ghost haha-btn-app--sm" href="/changelog" target="_blank" rel="noreferrer">查看更新日志</a>
            </div>
          ) : (
            <span style={{ color: 'var(--ok, #16a34a)', fontWeight: 700 }}>✓ 已是最新版本</span>
          )}
        </div>
      </div>
      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>升级说明</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.85 }}>
          {!st.upgradeEnabled && <>后台一键升级默认关闭（安全，且仅适用于宿主机直跑的部署）。启用：给运行 app 的账号配好执行 <code>upgrade.sh</code> 的权限后，设环境变量 <code>ALLOW_ADMIN_UPGRADE=true</code> 并重启服务。<br /></>}
          任何部署形态都可在服务器仓库根目录手动运行 <code>./upgrade.sh</code>（自动备份 → 拉取 → 迁移 → 重建 → 重启；Docker 部署设 <code>DEPLOY_MODE=docker</code>）。完整说明见仓库 <code>UPGRADE.md</code>。
        </div>
      </div>
    </div>
  );
}
