import { useState, useEffect } from 'react';
import { Input, Button } from '../../components/heroui';
import { RowSkeleton } from '../../components/States';
import { useToast } from '../../context/ToastContext';
import { confirmDialog } from '../../components/confirm';
import api from '../../api/client';

type Source = 'site' | 'env' | 'default';
type Status = {
  driver: 'local' | 's3';
  sources: Record<string, Source>;
  endpoint: string;
  bucket: string;
  region: string;
  publicUrl: string;
  forcePathStyle: boolean;
  hasAccessKey: boolean;
  hasSecretKey: boolean;
  uploadsDir: string;
  sampleUrl: string;
  localFiles: number;
  localFilesCapped: boolean;
  hasSiteConfig: boolean;
  warnings: string[];
};

const SOURCE_TEXT: Record<Source, string> = {
  site: '后台设置',
  env: '环境变量',
  default: '默认值',
};

/** 来源徽标：让站长一眼看出这个值是自己填的、.env 带进来的，还是内置兜底 */
function SourceTag({ source }: { source?: Source }) {
  if (!source) return null;
  const env = source === 'env';
  return (
    <span
      style={{
        fontSize: 11,
        padding: '1px 6px',
        borderRadius: 4,
        marginLeft: 6,
        whiteSpace: 'nowrap',
        background: env ? 'var(--gold-soft)' : 'var(--surface-2)',
        color: env ? 'var(--gold-deep)' : 'var(--ink-3)',
      }}
    >
      {SOURCE_TEXT[source]}
    </span>
  );
}

function StatusRow({ label, value, source }: { label: string; value: string; source?: Source }) {
  return (
    <div className="row gap-8" style={{ alignItems: 'baseline', fontSize: 12.5, marginTop: 5 }}>
      <span className="faint" style={{ minWidth: 92, flexShrink: 0 }}>{label}</span>
      <span style={{ wordBreak: 'break-all' }}>
        {value}
        <SourceTag source={source} />
      </span>
    </div>
  );
}

export default function StoragePanel() {
  const toast = useToast();
  const [cfg, setCfg] = useState<Record<string, string> | null>(null);
  const [secrets, setSecrets] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<Status | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [testWarnings, setTestWarnings] = useState<string[]>([]);
  const loadStatus = () =>
    api.get('/admin/storage/status').then(({ data }) => setStatus(data)).catch(() => undefined);
  useEffect(() => {
    api.get('/admin/config').then(({ data }) => {
      setCfg(data.config || {});
      setSecrets(data.secretsSet || {});
    }).catch(() => setCfg({}));
    loadStatus();
  }, []);
  const setK = (k: string, v: string) => setCfg((c) => ({ ...(c || {}), [k]: v }));
  const save = async () => {
    setSaving(true);
    try {
      await api.put('/admin/config', { config: cfg });
      toast.ok('存储配置已保存');
      const { data } = await api.get('/admin/config');
      setCfg(data.config || {});
      setSecrets(data.secretsSet || {});
      setTestWarnings([]);
      await loadStatus();
    } catch (e: any) { toast.err(e.message); }
    finally { setSaving(false); }
  };
  // 清掉后台存的存储配置，退回 .env / 内置默认。PUT 留空是「保留原值」，
  // 所以不给这个入口就只能改库才能回退。
  const clearSite = async () => {
    const ok = await confirmDialog(
      '会删掉后台存的存储配置（含 Access Key / Secret Key），之后按环境变量或内置默认生效。\n已上传的文件不受影响，不会被删除或搬家。',
      { title: '清除后台存储设置？', confirmText: '清除' },
    );
    if (!ok) return;
    setClearing(true);
    try {
      const { data } = await api.delete('/admin/storage/site-config');
      toast.ok(data.cleared?.length ? `已清除 ${data.cleared.length} 项，改按环境变量 / 默认值生效` : '后台本来就没存配置');
      const res = await api.get('/admin/config');
      setCfg(res.data.config || {});
      setSecrets(res.data.secretsSet || {});
      setTestWarnings([]);
      await loadStatus();
    } catch (e: any) { toast.err(e.message); }
    finally { setClearing(false); }
  };
  const test = async () => {
    setTesting(true);
    setTestWarnings([]);
    try {
      const { data } = await api.post('/admin/storage/test');
      if (data.ok) toast.ok(data.message || '连接成功');
      else toast.err(data.message || '连接失败');
      if (Array.isArray(data.warnings) && data.warnings.length) setTestWarnings(data.warnings);
    } catch (e: any) { toast.err(e.message); }
    finally { setTesting(false); }
  };
  if (cfg === null) return <RowSkeleton rows={6} />;
  const src = status?.sources || {};
  // 后台未填时按实际生效值显示，避免 env 部署的站点被显示成「本地磁盘」
  const driverValue = cfg.storage_driver || status?.driver || 'local';
  // env 带进来的值填进 placeholder：留空即沿用，填了才覆盖
  const envHint = (key: string, value?: string) =>
    src[key] === 'env' && value ? `${value}（来自环境变量）` : undefined;
  const warnings = testWarnings.length ? testWarnings : status?.warnings || [];
  // 已切到对象存储、但本地目录还有存量文件 = 需要跑一次迁移脚本
  const pendingLocal = status?.driver === 's3' && status.localFiles > 0;
  return (
    <div className="flex flex-col gap-4">
      {status && (
        <div className="ui-card" style={{ padding: 18 }}>
          <div className="row gap-8" style={{ alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 14.5 }}>当前生效</div>
            <span
              style={{
                fontSize: 12,
                padding: '2px 8px',
                borderRadius: 999,
                background: status.driver === 's3' ? 'var(--brand-soft)' : 'var(--surface-2)',
                color: status.driver === 's3' ? 'var(--brand)' : 'var(--ink-3)',
              }}
            >
              {status.driver === 's3' ? '对象存储（S3 兼容）' : '本地磁盘'}
            </span>
            <SourceTag source={src.driver} />
          </div>
          {status.driver === 's3' ? (
            <>
              <StatusRow label="Endpoint" value={status.endpoint} source={src.endpoint} />
              <StatusRow label="Bucket" value={status.bucket} source={src.bucket} />
              <StatusRow label="Region" value={status.region} source={src.region} />
              <StatusRow
                label="Public URL"
                value={status.publicUrl || '未配置'}
                source={status.publicUrl ? src.publicUrl : undefined}
              />
              <StatusRow
                label="Path style"
                value={status.forcePathStyle ? '开' : '关'}
                source={src.forcePathStyle}
              />
              <StatusRow
                label="密钥"
                value={status.hasAccessKey && status.hasSecretKey ? '已配置' : '缺失'}
                source={status.hasAccessKey ? src.accessKey : undefined}
              />
            </>
          ) : (
            <StatusRow label="上传目录" value={status.uploadsDir} />
          )}
          <StatusRow label="文件地址" value={status.sampleUrl} />
          <div className="faint" style={{ fontSize: 12, marginTop: 10, lineHeight: 1.6 }}>
            后台设置优先于环境变量；下方字段留空即沿用环境变量的值。改动即时生效，无需重启。
          </div>
        </div>
      )}
      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>对象存储</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>
          支持 S3 兼容网关（含七牛 Kodo：endpoint 如 https://s3-cn-east-1.qiniucs.com，public_url 填 CDN 域名）。凭据仅后台可见且掩码，绝不进入公开站点配置。留空密钥 = 保留原值。未配时回退环境变量。
        </div>
        <div className="sec-grid" style={{ marginTop: 14 }}>
          <label className="sec-field">
            <span className="sec-label">存储驱动</span>
            <select className="haha-inp" value={driverValue} onChange={(e) => setK('storage_driver', e.target.value)}>
              <option value="local">本地磁盘</option>
              <option value="s3">S3 兼容</option>
            </select>
          </label>
          <label className="sec-field">
            <span className="sec-label">S3 Endpoint</span>
            <Input className="haha-inp" value={cfg.s3_endpoint ?? ''} onChange={(e: any) => setK('s3_endpoint', e.target.value)} placeholder={envHint('endpoint', status?.endpoint) || 'https://s3-cn-east-1.qiniucs.com'} />
          </label>
          <label className="sec-field">
            <span className="sec-label">Bucket</span>
            <Input className="haha-inp" value={cfg.s3_bucket ?? ''} onChange={(e: any) => setK('s3_bucket', e.target.value)} placeholder={envHint('bucket', status?.bucket) || 'hahasns'} />
          </label>
          <label className="sec-field">
            <span className="sec-label">Region</span>
            <Input className="haha-inp" value={cfg.s3_region ?? ''} onChange={(e: any) => setK('s3_region', e.target.value)} placeholder={envHint('region', status?.region) || 'cn-east-1'} />
          </label>
          <label className="sec-field">
            <span className="sec-label">Public URL（CDN）</span>
            <Input className="haha-inp" value={cfg.s3_public_url ?? ''} onChange={(e: any) => setK('s3_public_url', e.target.value)} placeholder={envHint('publicUrl', status?.publicUrl) || 'https://cdn.example.com'} />
          </label>
          <label className="sec-field row gap-8" style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* 生效默认开（后端 env 未设时按 true）：仅显式 '0' 显示关；保存时未配置键不落库（undefined 不入 JSON），用户勾选后才是显式选择 */}
            <input type="checkbox" checked={cfg.s3_force_path_style !== '0'} onChange={(e) => setK('s3_force_path_style', e.target.checked ? '1' : '0')} />
            <span className="sec-label" style={{ margin: 0 }}>Force path style（部分 MinIO 需要；七牛通常关）</span>
          </label>
          <label className="sec-field">
            <span className="sec-label">Access Key {secrets.s3_access_key ? '（已配置）' : ''}</span>
            <Input className="haha-inp" type="password" autoComplete="new-password"
              value={cfg.s3_access_key ?? ''} onChange={(e: any) => setK('s3_access_key', e.target.value)}
              placeholder={secrets.s3_access_key ? '••••（留空保留）' : src.accessKey === 'env' ? '已由环境变量提供' : 'Access Key'} />
          </label>
          <label className="sec-field">
            <span className="sec-label">Secret Key {secrets.s3_secret_key ? '（已配置）' : ''}</span>
            <Input className="haha-inp" type="password" autoComplete="new-password"
              value={cfg.s3_secret_key ?? ''} onChange={(e: any) => setK('s3_secret_key', e.target.value)}
              placeholder={secrets.s3_secret_key ? '••••（留空保留）' : src.secretKey === 'env' ? '已由环境变量提供' : 'Secret Key'} />
          </label>
        </div>
        {/* 切到 S3 后本地目录里还躺着老文件——不提示的话站长会以为「切完就完事了」，
            直到某天删了 uploads 卷才发现老图全裂。有存量才升级成醒目提示。 */}
        {pendingLocal ? (
          <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: 'var(--gold-soft)', color: 'var(--gold-deep)' }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>
              本地还有 {status!.localFiles}{status!.localFilesCapped ? '+' : ''} 个旧文件没迁走
            </div>
            <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.6 }}>
              新上传已走对象存储，之前存在磁盘上的文件仍从本地读。在服务器上跑一次迁移脚本（先 dry-run 看清单，再加 --execute 真迁）：
            </div>
            <code style={{ display: 'block', marginTop: 8, padding: 8, background: 'var(--surface)', color: 'var(--ink-2)', borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap' }}>
              node server-nest/scripts/migrate-uploads-to-s3.mjs{'\n'}
              node server-nest/scripts/migrate-uploads-to-s3.mjs --execute --yes
            </code>
          </div>
        ) : (
          <div className="faint" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.6 }}>
            存量迁移（默认 dry-run）：
            <code style={{ display: 'block', marginTop: 6, padding: 8, background: 'var(--surface-2)', borderRadius: 6, whiteSpace: 'pre-wrap' }}>
              node server-nest/scripts/migrate-uploads-to-s3.mjs{'\n'}
              node server-nest/scripts/migrate-uploads-to-s3.mjs --execute --yes
            </code>
          </div>
        )}
      </div>
      {warnings.length > 0 && (
        <div className="ui-card" style={{ padding: '12px 18px', background: 'var(--gold-soft)' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--gold-deep)' }}>配置预警</div>
          {warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.6, color: 'var(--gold-deep)' }}>{w}</div>
          ))}
        </div>
      )}
      <div className="row gap-8" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {status?.hasSiteConfig && (
          <Button color="danger" variant="light" className="haha-btn-app" onClick={clearSite} isDisabled={clearing}>{clearing ? '清除中…' : '清除后台设置'}</Button>
        )}
        <Button variant="bordered" className="haha-btn-app" onClick={test} isDisabled={testing}>{testing ? '测试中…' : '测试连接'}</Button>
        <Button color="primary" className="haha-btn-app" onClick={save} isDisabled={saving}>{saving ? '保存中…' : '保存存储配置'}</Button>
      </div>
    </div>
  );
}
