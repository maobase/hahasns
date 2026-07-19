import { useState, useEffect } from 'react';
import { Input, Button } from '../../components/heroui';
import { RowSkeleton } from '../../components/States';
import { useToast } from '../../context/ToastContext';
import api from '../../api/client';

export default function StoragePanel() {
  const toast = useToast();
  const [cfg, setCfg] = useState<Record<string, string> | null>(null);
  const [secrets, setSecrets] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testWarnings, setTestWarnings] = useState<string[]>([]);
  useEffect(() => {
    api.get('/admin/config').then(({ data }) => {
      setCfg(data.config || {});
      setSecrets(data.secretsSet || {});
    }).catch(() => setCfg({}));
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
    } catch (e: any) { toast.err(e.message); }
    finally { setSaving(false); }
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
  return (
    <div className="flex flex-col gap-4">
      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>对象存储</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>
          支持 S3 兼容网关（含七牛 Kodo：endpoint 如 https://s3-cn-east-1.qiniucs.com，public_url 填 CDN 域名）。凭据仅后台可见且掩码，绝不进入公开站点配置。留空密钥 = 保留原值。未配时回退环境变量。
        </div>
        <div className="sec-grid" style={{ marginTop: 14 }}>
          <label className="sec-field">
            <span className="sec-label">存储驱动</span>
            <select className="haha-inp" value={cfg.storage_driver || 'local'} onChange={(e) => setK('storage_driver', e.target.value)}>
              <option value="local">本地磁盘</option>
              <option value="s3">S3 兼容</option>
            </select>
          </label>
          <label className="sec-field">
            <span className="sec-label">S3 Endpoint</span>
            <Input className="haha-inp" value={cfg.s3_endpoint ?? ''} onChange={(e: any) => setK('s3_endpoint', e.target.value)} placeholder="https://s3-cn-east-1.qiniucs.com" />
          </label>
          <label className="sec-field">
            <span className="sec-label">Bucket</span>
            <Input className="haha-inp" value={cfg.s3_bucket ?? ''} onChange={(e: any) => setK('s3_bucket', e.target.value)} placeholder="hahasns" />
          </label>
          <label className="sec-field">
            <span className="sec-label">Region</span>
            <Input className="haha-inp" value={cfg.s3_region ?? ''} onChange={(e: any) => setK('s3_region', e.target.value)} placeholder="cn-east-1" />
          </label>
          <label className="sec-field">
            <span className="sec-label">Public URL（CDN）</span>
            <Input className="haha-inp" value={cfg.s3_public_url ?? ''} onChange={(e: any) => setK('s3_public_url', e.target.value)} placeholder="https://cdn.example.com" />
          </label>
          <label className="sec-field row gap-8" style={{ alignItems: 'center' }}>
            {/* 生效默认开（后端 env 未设时按 true）：仅显式 '0' 显示关；保存时未配置键不落库（undefined 不入 JSON），用户勾选后才是显式选择 */}
            <input type="checkbox" checked={cfg.s3_force_path_style !== '0'} onChange={(e) => setK('s3_force_path_style', e.target.checked ? '1' : '0')} />
            <span className="sec-label" style={{ margin: 0 }}>Force path style（部分 MinIO 需要；七牛通常关）</span>
          </label>
          <label className="sec-field">
            <span className="sec-label">Access Key {secrets.s3_access_key ? '（已配置）' : ''}</span>
            <Input className="haha-inp" type="password" autoComplete="new-password"
              value={cfg.s3_access_key ?? ''} onChange={(e: any) => setK('s3_access_key', e.target.value)}
              placeholder={secrets.s3_access_key ? '••••（留空保留）' : 'Access Key'} />
          </label>
          <label className="sec-field">
            <span className="sec-label">Secret Key {secrets.s3_secret_key ? '（已配置）' : ''}</span>
            <Input className="haha-inp" type="password" autoComplete="new-password"
              value={cfg.s3_secret_key ?? ''} onChange={(e: any) => setK('s3_secret_key', e.target.value)}
              placeholder={secrets.s3_secret_key ? '••••（留空保留）' : 'Secret Key'} />
          </label>
        </div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.6 }}>
          存量迁移（默认 dry-run）：
          <code style={{ display: 'block', marginTop: 6, padding: 8, background: 'var(--surface-2)', borderRadius: 6 }}>
            node server-nest/scripts/migrate-uploads-to-s3.mjs{'\n'}
            node server-nest/scripts/migrate-uploads-to-s3.mjs --execute --yes
          </code>
        </div>
      </div>
      {testWarnings.length > 0 && (
        <div className="ui-card" style={{ padding: '12px 18px', background: 'var(--gold-soft)' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--gold-deep)' }}>配置预警</div>
          {testWarnings.map((w, i) => (
            <div key={i} style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.6, color: 'var(--gold-deep)' }}>{w}</div>
          ))}
        </div>
      )}
      <div className="row gap-8" style={{ justifyContent: 'flex-end' }}>
        <Button variant="bordered" className="haha-btn-app" onClick={test} isDisabled={testing}>{testing ? '测试中…' : '测试连接'}</Button>
        <Button color="primary" className="haha-btn-app" onClick={save} isDisabled={saving}>{saving ? '保存中…' : '保存存储配置'}</Button>
      </div>
    </div>
  );
}
