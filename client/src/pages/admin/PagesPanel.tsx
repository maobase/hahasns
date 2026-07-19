import { useState, useEffect } from 'react';
import { Textarea, Button } from '../../components/heroui';
import { RowSkeleton } from '../../components/States';
import { useToast } from '../../context/ToastContext';
import api from '../../api/client';
import { Toggle } from './ui';

export default function PagesPanel() {
  const toast = useToast();
  const [cfg, setCfg] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get('/admin/config').then(({ data }) => setCfg(data.config)).catch(() => setCfg({})); }, []);
  const setK = (k: string, v: string) => setCfg((c) => ({ ...(c || {}), [k]: v }));
  const save = async () => {
    setSaving(true);
    try { await api.put('/admin/config', { config: cfg }); toast.ok('页面内容已保存'); }
    catch (e: any) { toast.err(e.message); }
    finally { setSaving(false); }
  };
  if (cfg === null) return <RowSkeleton rows={6} />;
  const pages: [string, string, string, string][] = [
    ['about', '关于页', 'about_content', 'page_about_on'],
    ['changelog', '更新日志', 'changelog_content', 'page_changelog_on'],
    ['roadmap', '开发计划', 'roadmap_content', 'page_roadmap_on'],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>页面内容与开关</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>
          Markdown 内容非空则覆盖内置；留空回退内置。关闭开关会隐藏入口并拦截路由。支持安全 markdown，禁止裸 HTML。
        </div>
        {pages.map(([, label, contentKey, toggleKey]) => (
          <div key={contentKey} style={{ marginTop: 18 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>{label}</span>
              <label className="row gap-8" style={{ fontSize: 13 }}>
                启用
                <Toggle on={(cfg[toggleKey] ?? '1') !== '0'} onChange={(v) => setK(toggleKey, v ? '1' : '0')} />
              </label>
            </div>
            <Textarea className="haha-inp" maxLength={20000} minRows={8} value={cfg[contentKey] ?? ''}
              onChange={(e: any) => setK(contentKey, e.target.value)}
              placeholder={`${label} Markdown（留空用内置）`}
              style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5, lineHeight: 1.55 }} />
          </div>
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button color="primary" className="haha-btn-app" onClick={save} isDisabled={saving}>{saving ? '保存中…' : '保存页面内容'}</Button>
      </div>
    </div>
  );
}
