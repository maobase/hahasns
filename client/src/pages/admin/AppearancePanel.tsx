import { useState, useEffect } from 'react';
import Icon from '../../components/Icon';
import { RowSkeleton } from '../../components/States';
import { Input, Textarea, Button } from '../../components/heroui';
import { useToast } from '../../context/ToastContext';
import { SKINS, STYLES } from '../../context/ThemeContext';
import api from '../../api/client';
import { parseCustomThemes, validateThemePackage, type ThemePackage } from '../../lib/themePackage';
import { Toggle } from './ui';

// 站点外观自定义 (W)：站名 / 副标题 / Logo / 全站自定义 CSS。类 WP 的二开能力，升级不覆盖。
export default function AppearancePanel() {
  const toast = useToast();
  const [cfg, setCfg] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get('/admin/config').then(({ data }) => setCfg(data.config)).catch(() => setCfg({})); }, []);
  const setK = (k: string, v: string) => setCfg((c) => ({ ...(c || {}), [k]: v }));
  // 品牌图片上传：走通用 /upload（→ StorageService → 配了 S3 就进对象存储，否则本地持久卷），
  // 拿到 URL 自动填进对应字段。管理员无需自己找图床。
  const uploadBrand = async (k: string, e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.append('files', file);
    try {
      const { data } = await api.post('/upload', fd);
      const url = data.files?.[0]?.url;
      if (url) { setK(k, url); toast.ok('已上传，别忘了点「保存」'); }
    } catch (err: any) { toast.err(err.message); }
    e.target.value = '';
  };
  const save = async () => {
    setSaving(true);
    try {
      await api.put('/admin/config', { config: cfg });
      toast.ok('站点外观已保存，刷新页面查看效果');
    } catch (e: any) { toast.err(e.message); }
    finally { setSaving(false); }
  };
  if (cfg === null) return <RowSkeleton rows={5} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>站点品牌</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>显示在导航栏、浏览器标题与登录页。Logo 留空则用内置「H」标记。</div>
        <div className="sec-grid" style={{ marginTop: 14 }}>
          <label className="sec-field">
            <span className="sec-label">站点名称</span>
            <Input className="haha-inp" maxLength={40} value={cfg.site_name ?? ''} onChange={(e: any) => setK('site_name', e.target.value)} placeholder="HahaSNS" />
          </label>
          <label className="sec-field">
            <span className="sec-label">副标题 / Slogan</span>
            <Input className="haha-inp" maxLength={60} value={cfg.site_slogan ?? ''} onChange={(e: any) => setK('site_slogan', e.target.value)} placeholder="轻社交社区" />
          </label>
          <label className="sec-field">
            <span className="sec-label">页脚版权文案</span>
            <Input className="haha-inp" maxLength={200} value={cfg.footer_text ?? ''} onChange={(e: any) => setK('footer_text', e.target.value)} placeholder="© 2026 HahaSNS · 轻社交 · 轻论坛 · 轻社区（留空用默认）" />
          </label>
          <label className="sec-field">
            <span className="sec-label">ICP 备案号（页脚显示，链到工信部）</span>
            <Input className="haha-inp" maxLength={100} value={cfg.icp_beian ?? ''} onChange={(e: any) => setK('icp_beian', e.target.value)} placeholder="如：京ICP备12345678号（留空不显示）" />
          </label>
          <label className="sec-field">
            <span className="sec-label">登录页主标题（可用换行，留空用默认）</span>
            <Textarea className="haha-inp" maxLength={80} value={cfg.landing_title ?? ''} onChange={(e: any) => setK('landing_title', e.target.value)} minRows={2} placeholder={'连接有趣的人\n与值得分享的内容'} style={{ lineHeight: 1.5 }} />
          </label>
          <label className="sec-field">
            <span className="sec-label">登录页副标题（留空用默认）</span>
            <Input className="haha-inp" maxLength={60} value={cfg.landing_subtitle ?? ''} onChange={(e: any) => setK('landing_subtitle', e.target.value)} placeholder="轻社交 · 轻论坛 · 轻社区" />
          </label>
          <label className="sec-field">
            <span className="sec-label">默认皮肤（新访客，用户可自选覆盖）</span>
            <select className="haha-inp" value={cfg.default_skin ?? ''} onChange={(e) => setK('default_skin', e.target.value)}>
              <option value="">内置默认（经典蓝）</option>
              {SKINS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <label className="sec-field">
            <span className="sec-label">默认亮暗（新访客）</span>
            <select className="haha-inp" value={cfg.default_mode ?? ''} onChange={(e) => setK('default_mode', e.target.value)}>
              <option value="">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </label>
          <label className="sec-field">
            <span className="sec-label">默认视觉风格（新访客）</span>
            <select className="haha-inp" value={cfg.default_style ?? ''} onChange={(e) => setK('default_style', e.target.value)}>
              <option value="">内置默认（现代）</option>
              {STYLES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
        </div>
        <label className="sec-field" style={{ marginTop: 12 }}>
          <span className="sec-label">Logo 图片</span>
          <div className="row gap-8" style={{ alignItems: 'center' }}>
            {cfg.site_logo
              ? <img src={cfg.site_logo} alt="" width={36} height={36} style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
              : <span className="admin-logo" style={{ width: 36, height: 36, flexShrink: 0 }}><Icon name="image" size={18} /></span>}
            <Input className="haha-inp" maxLength={500} value={cfg.site_logo ?? ''} onChange={(e: any) => setK('site_logo', e.target.value)} placeholder="上传或粘贴 URL（留空用内置标记）" style={{ flex: 1 }} />
            <label className="haha-btn-app haha-btn-app--sm" style={{ cursor: 'pointer', flexShrink: 0, display: 'inline-flex' }}>上传<input type="file" accept="image/*" hidden onChange={(e) => uploadBrand('site_logo', e)} /></label>
          </div>
        </label>
        <div className="sec-grid" style={{ marginTop: 12 }}>
          <label className="sec-field row gap-8" style={{ alignItems: 'center' }}>
            <input type="checkbox" checked={cfg.site_logo_only === '1'} onChange={(e) => setK('site_logo_only', e.target.checked ? '1' : '0')} />
            <span className="sec-label" style={{ margin: 0 }}>仅显示 Logo（隐藏站名文字；需已设 Logo）</span>
          </label>
          <label className="sec-field">
            <span className="sec-label">Logo 高度（px，24–64，默认 33）</span>
            <Input className="haha-inp" type="number" min={24} max={64} value={cfg.site_logo_height ?? '33'}
              onChange={(e: any) => setK('site_logo_height', e.target.value)} />
          </label>
        </div>
        <label className="sec-field" style={{ marginTop: 12 }}>
          <span className="sec-label">Favicon（浏览器标签图标）</span>
          <div className="row gap-8" style={{ alignItems: 'center' }}>
            {cfg.site_favicon
              ? <img src={cfg.site_favicon} alt="" width={36} height={36} style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
              : <span className="admin-logo" style={{ width: 36, height: 36, flexShrink: 0 }}><Icon name="image" size={18} /></span>}
            <Input className="haha-inp" maxLength={500} value={cfg.site_favicon ?? ''} onChange={(e: any) => setK('site_favicon', e.target.value)} placeholder="上传或粘贴 URL（留空用内置图标）" style={{ flex: 1 }} />
            <label className="haha-btn-app haha-btn-app--sm" style={{ cursor: 'pointer', flexShrink: 0, display: 'inline-flex' }}>上传<input type="file" accept="image/*" hidden onChange={(e) => uploadBrand('site_favicon', e)} /></label>
          </div>
        </label>
        <label className="sec-field" style={{ marginTop: 12 }}>
          <span className="sec-label">新用户默认头像</span>
          <div className="row gap-8" style={{ alignItems: 'center' }}>
            {cfg.default_avatar && /^(https?:|\/uploads)/.test(cfg.default_avatar)
              ? <img src={cfg.default_avatar} alt="" width={36} height={36} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
              : <span className="admin-logo" style={{ width: 36, height: 36, flexShrink: 0 }}><Icon name="image" size={18} /></span>}
            <Input className="haha-inp" maxLength={500} value={cfg.default_avatar ?? ''} onChange={(e: any) => setK('default_avatar', e.target.value)} placeholder="上传/粘贴 URL（留空按昵称生成渐变头像）" style={{ flex: 1 }} />
            <label className="haha-btn-app haha-btn-app--sm" style={{ cursor: 'pointer', flexShrink: 0, display: 'inline-flex' }}>上传<input type="file" accept="image/*" hidden onChange={(e) => uploadBrand('default_avatar', e)} /></label>
          </div>
        </label>
      </div>

      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>自定义 CSS</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>全站注入到页面 <code>&lt;head&gt;</code>，可覆盖任意样式做二次开发装饰；系统升级不会重置此处内容。请谨慎使用，错误的 CSS 可能影响页面显示。</div>
        <Textarea className="haha-inp" value={cfg.site_custom_css ?? ''} maxLength={20000} spellCheck={false}
          onChange={(e: any) => setK('site_custom_css', e.target.value)}
          placeholder={'/* 例如：把主按钮换成圆角胶囊 */\n.haha-btn-app--primary { border-radius: 999px; }'}
          style={{ marginTop: 12, minHeight: 220, fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: 12.5, lineHeight: 1.6, resize: 'vertical' }} />
      </div>

      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>自定义导航链接</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>在左栏与移动抽屉导航底部追加自定义链接，每行一条「标题|网址」，最多 8 条。网址以 http(s):// 开头为外链（新标签打开），以 / 开头为站内路径。例：<code>官网|https://example.com</code></div>
        <Textarea className="haha-inp" value={cfg.custom_nav_links ?? ''} maxLength={800} spellCheck={false}
          onChange={(e: any) => setK('custom_nav_links', e.target.value)}
          placeholder={'官网|https://example.com\n帮助中心|https://help.example.com'}
          style={{ marginTop: 12, minHeight: 100, fontSize: 13, lineHeight: 1.6, resize: 'vertical' }} />
      </div>

      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>导航项改名</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>重命名内置导航项，每行一条「/路径|新名称」。常见路径：/discover 发现、/forum 论坛、/qa 问答、/circles 圈子、/flash 快报、/articles 专栏、/mall 积分商城、/leaderboard 排行榜、/member 会员中心。例：<code>/forum|讨论区</code></div>
        <Textarea className="haha-inp" value={cfg.nav_labels ?? ''} maxLength={600} spellCheck={false}
          onChange={(e: any) => setK('nav_labels', e.target.value)}
          placeholder={'/forum|讨论区\n/discover|发现精选'}
          style={{ marginTop: 12, minHeight: 100, fontSize: 13, lineHeight: 1.6, resize: 'vertical' }} />
      </div>

      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>访问与游客</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>关闭时强制登录（现状）；开启后登录页出现「游客浏览」按钮，游客可只读公开内容，写操作仍需登录。</div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
          <span style={{ fontSize: 13.5 }}>允许游客浏览</span>
          <Toggle on={cfg.allow_guest === '1'} onChange={(v) => setK('allow_guest', v ? '1' : '0')} />
        </div>
        {cfg.allow_guest === '1' && (
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 13.5 }}>游客信息流上限<span className="faint" style={{ fontSize: 12 }}>（0 = 不限；游客刷到此条数后出「注册解锁」卡）</span></span>
            <Input className="haha-inp" style={{ width: 88, textAlign: 'right' }} type="number" min={0} max={200}
              value={cfg.guest_feed_limit ?? ''} placeholder="8"
              onChange={(e: any) => setK('guest_feed_limit', e.target.value)} />
          </div>
        )}
      </div>

      <ThemePackagesPanel cfg={cfg} setK={setK} />

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button color="primary" className="haha-btn-app" onClick={save} isDisabled={saving}>{saving ? '保存中…' : '保存外观'}</Button>
      </div>
    </div>
  );
}

function ThemePackagesPanel({ cfg, setK }: { cfg: Record<string, string>; setK: (k: string, v: string) => void }) {
  const toast = useToast();
  const list = parseCustomThemes(cfg.custom_themes || '[]');
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState<ThemePackage | null>(null);
  const [editErr, setEditErr] = useState('');

  const persist = (next: ThemePackage[]) => {
    setK('custom_themes', JSON.stringify(next));
  };

  const importJson = () => {
    setEditErr('');
    let parsed: unknown;
    try { parsed = JSON.parse(draft); } catch { setEditErr('JSON 无法解析'); return; }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    const next = [...list];
    for (const item of items) {
      const r = validateThemePackage(item);
      if (!r.ok || !r.value) { setEditErr(r.error || '主题包无效'); return; }
      const i = next.findIndex((t) => t.id === r.value!.id);
      if (i >= 0) next[i] = r.value; else next.push(r.value);
    }
    persist(next);
    setDraft('');
    toast.ok('主题已导入（记得点保存外观）');
  };

  const exportOne = (p: ThemePackage) => {
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `theme-${p.id}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const remove = (id: string) => persist(list.filter((t) => t.id !== id));

  const applyPreview = () => {
    setEditErr('');
    try {
      const r = validateThemePackage(JSON.parse(draft));
      if (!r.ok || !r.value) { setEditErr(r.error || '无效'); setPreview(null); return; }
      setPreview(r.value);
      // 沙箱预览：仅注入临时 style，确认后再导入
      let el = document.getElementById('theme-admin-preview') as HTMLStyleElement | null;
      if (!el) { el = document.createElement('style'); el.id = 'theme-admin-preview'; document.head.appendChild(el); }
      const decls = Object.entries(r.value.tokens).map(([k, v]) => `${k}:${v}`).join(';');
      el.textContent = `.admin-shell{${decls}}`;
    } catch { setEditErr('JSON 无法解析'); setPreview(null); }
  };

  return (
    <div className="ui-card" style={{ padding: 18 }}>
      <div style={{ fontWeight: 700, fontSize: 14.5 }}>自定义主题包</div>
      <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>
        导入 JSON 主题包后会出现在前台主题切换器。须含 id / name / version / tokens（至少 --brand）。坏数据会被拒绝。
      </div>
      {list.length > 0 && (
        <div className="sec-toggles" style={{ marginTop: 12 }}>
          {list.map((p) => (
            <div className="row" style={{ justifyContent: 'space-between', gap: 8 }} key={p.id}>
              <span className="row gap-8" style={{ fontSize: 13.5 }}>
                <span style={{ width: 14, height: 14, borderRadius: 4, background: p.color || p.tokens['--brand'] }} />
                {p.name} <span className="faint">({p.id} v{p.version})</span>
              </span>
              <span className="row gap-6">
                <Button type="button" size="sm" variant="flat" className="haha-btn-app" onClick={() => exportOne(p)}>导出</Button>
                <Button type="button" size="sm" variant="flat" className="haha-btn-app danger" onClick={() => remove(p.id)}>删除</Button>
              </span>
            </div>
          ))}
        </div>
      )}
      <Textarea className="haha-inp" value={draft} onChange={(e: any) => setDraft(e.target.value)} minRows={8} spellCheck={false}
        placeholder={'{\n  "id": "ocean",\n  "name": "深海蓝",\n  "version": "1.0.0",\n  "tokens": { "--brand": "#0e7490", "--brand-strong": "#155e75", "--page": "#f0f9ff" }\n}'}
        style={{ marginTop: 12, fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5, lineHeight: 1.5 }} />
      {editErr && <div className="form-err" style={{ marginTop: 8 }}>{editErr}</div>}
      {preview && <div className="faint" style={{ marginTop: 8, fontSize: 12.5 }}>预览中：{preview.name}（仅后台沙箱，点「导入」再保存）</div>}
      <div className="row gap-8" style={{ marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" className="haha-btn-app haha-btn-app--sm" style={{ display: 'inline-flex' }} onClick={applyPreview}>预览</button>
        <Button type="button" size="sm" color="primary" className="haha-btn-app" onClick={importJson} isDisabled={!draft.trim()}>导入到列表</Button>
        <Button type="button" size="sm" variant="flat" className="haha-btn-app" onClick={() => {
          const el = document.getElementById('theme-admin-preview');
          if (el) el.textContent = '';
          setPreview(null);
        }}>清除预览</Button>
      </div>
    </div>
  );
}
