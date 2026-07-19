import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Input, Tabs, Tab, Spinner } from '../components/heroui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useSite } from '../context/SiteContext';
import { BrandMark, BrandName, logoHeightOf, showBrandText } from '../components/Navbar';
import Icon from '../components/Icon';
import { showAuthAboutLink } from '../lib/pageEntries';
import { APP_VERSION } from '../version';

const FEATURES = [
  ['edit', '轻社交动态', '文字 / 图片 / 视频 / 音乐，随手记录'],
  ['forum', '社区论坛', '版块讨论、内联看帖、版主管理'],
  ['coin', '积分体系', '签到赚积分，商城兑换专属装扮'],
];

export default function AuthLanding() {
  const { login, register, enterGuest } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', password: '', nickname: '', inviteCode: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const site = useSite();
  // 登出落地页也把标签标题设成配置的品牌（否则显示 index.html 写死的「HahaSNS」）
  useEffect(() => { document.title = `${site.name} · ${site.slogan}`; }, [site.name, site.slogan]);
  const set = (k: string) => (v: any) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: any) => {
    e?.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (mode === 'login') {
        const u = await login(form.username.trim(), form.password);
        toast.ok(`欢迎回来，${u.nickname}`);
      } else {
        const u = await register({ username: form.username.trim(), password: form.password, nickname: form.nickname.trim(), inviteCode: form.inviteCode.trim() || undefined });
        toast.ok(`注册成功，欢迎加入，${u.nickname}！`);
      }
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth-landing">
      <div className="auth-landing-hero">
        <div className="auth-hero-inner">
          <div className="row gap-8" style={{ marginBottom: 26, alignItems: 'center' }}>
            <BrandMark size={logoHeightOf(site.logoHeight) + 7} logo={site.logo} />
            {showBrandText(site.logo, site.logoOnly) && (
              <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.02em' }}><BrandName name={site.name} /></span>
            )}
          </div>
          <h1 className="auth-hero-title" style={{ whiteSpace: 'pre-line' }}>{site.landingTitle || '连接有趣的人\n与值得分享的内容'}</h1>
          <p className="auth-hero-sub">{site.landingSubtitle || '轻社交 · 轻论坛 · 轻社区'}</p>
          <div className="auth-hero-features">
            {FEATURES.map(([ic, t, d]) => (
              <div className="row gap-12" key={t} style={{ marginTop: 16 }}>
                <div className="auth-feat-ico"><Icon name={ic} size={22} /></div>
                <div><div style={{ fontWeight: 700 }}>{t}</div><div style={{ opacity: .82, fontSize: 13 }}>{d}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="auth-landing-form">
        <div className="auth-mobile-intro">
          <BrandMark size={46} logo={site.logo} />
          <h2 className="auth-mi-title" style={{ whiteSpace: 'pre-line' }}>{site.landingTitle || '连接有趣的人\n与值得分享的内容'}</h2>
          <p className="auth-mi-sub">{site.landingSubtitle || '轻社交 · 轻论坛 · 轻社区'}</p>
        </div>
        <div className="auth-form-card">
          <div className="auth-form-brand"><BrandMark size={34} logo={site.logo} />{showBrandText(site.logo, site.logoOnly) && <BrandName name={site.name} />}</div>

          <Tabs
            aria-label="登录或注册"
            selectedKey={mode}
            onSelectionChange={(k: any) => { setMode(k); setErr(''); }}
            color="primary" radius="lg" fullWidth size="lg"
            classNames={{ base: 'mb-4', tabList: 'bg-default-100' }}
          >
            <Tab key="login" title="登录" />
            <Tab key="register" title="注册" />
          </Tabs>

          <p className="muted" style={{ fontSize: 13.5, marginBottom: 16 }}>
            {mode === 'login' ? '登录后即可浏览动态、参与社区' : '注册一个账号，开启你的轻社交之旅'}
          </p>
          {err && <div className="form-err">{err}</div>}

          <form onSubmit={submit} className="flex flex-col gap-4">
            {mode === 'register' && (
              <Input label="昵称（可选）" labelPlacement="outside" variant="bordered" radius="md"
                value={form.nickname} onValueChange={set('nickname')} maxLength={20} placeholder="想让大家怎么称呼你？" />
            )}
            <Input label="用户名" labelPlacement="outside" variant="bordered" radius="md" autoFocus
              value={form.username} onValueChange={set('username')} placeholder="字母、数字、下划线或中文" />
            <Input label="密码" labelPlacement="outside" variant="bordered" radius="md"
              type={showPw ? 'text' : 'password'} value={form.password} onValueChange={set('password')} placeholder="至少 6 位"
              endContent={
                <button type="button" className="text-default-400 hover:text-default-600" onClick={() => setShowPw((s) => !s)} aria-label="显示密码">
                  <Icon name="eye" size={18} />
                </button>
              } />
            {mode === 'login' && (
              <div style={{ textAlign: 'right', marginTop: -6 }}>
                <button type="button" onClick={() => setShowForgot((s) => !s)} style={{ fontSize: 12.5, color: 'var(--ink-4)', background: 'none', border: 0, cursor: 'pointer', padding: 0 }}>忘记密码？</button>
              </div>
            )}
            {mode === 'login' && showForgot && (
              <div className="faint" style={{ fontSize: 12.5, lineHeight: 1.65, border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px' }}>
                本站暂未开放邮箱自助找回。如忘记密码，请联系站点管理员协助重置——管理员可在「后台 → 用户」中为任意账号重置登录密码。
              </div>
            )}
            {mode === 'register' && (
              <Input label={site.inviteRequired ? '邀请码（必填）' : '邀请码（可选）'} labelPlacement="outside" variant="bordered" radius="md"
                value={form.inviteCode} onValueChange={set('inviteCode')} maxLength={64} placeholder={site.inviteRequired ? '本站需要邀请码，填邀请人用户名' : '填邀请人用户名，双方得积分'} />
            )}
            {mode === 'register' && !site.registrationEnabled && (
              <div className="faint" style={{ fontSize: 13, textAlign: 'center', color: 'var(--ink-3)' }}>本站暂未开放注册</div>
            )}
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy || (mode === 'register' && !site.registrationEnabled)} style={{ marginTop: 4, fontWeight: 700 }}>
              {busy ? <Spinner size="sm" color="current" /> : (mode === 'login' ? '登录' : '注册')}
            </button>
          </form>
          {site.allowGuest && (
            <button
              type="button"
              className="btn btn-ghost btn-block"
              style={{ marginTop: 12, fontWeight: 600 }}
              onClick={() => { enterGuest(); toast.show('已进入游客浏览（只读）'); }}
            >
              游客浏览
            </button>
          )}
        </div>
        <div className="faint" style={{ fontSize: 12, textAlign: 'center', marginTop: 18 }}>
          {showAuthAboutLink(site) && (
            <><Link to="/about" className="auth-about-link">了解功能</Link> · </>
          )}
          {site.footerText || `© 2026 ${site.name} · 轻社交社区`} · <span className="num">{APP_VERSION}</span>
        </div>
        {site.icpBeian && <div className="faint" style={{ fontSize: 12, textAlign: 'center', marginTop: 6 }}><a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer noopener" style={{ color: 'inherit' }}>{site.icpBeian}</a></div>}
      </div>
    </div>
  );
}
