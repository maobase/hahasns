import { useState } from 'react';
import { Input, Button, Tabs, Tab } from '../components/heroui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { BrandMark } from '../components/Navbar';
import Icon from '../components/Icon';

const FEATURES = [
  ['edit', '轻社交动态', '文字 / 图片 / 视频 / 音乐，随手记录'],
  ['forum', '社区论坛', '版块讨论、内联看帖、版主管理'],
  ['coin', '积分体系', '签到赚积分，商城兑换专属装扮'],
];

export default function AuthLanding() {
  const { login, register } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', password: '', nickname: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e?.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (mode === 'login') {
        const u = await login(form.username.trim(), form.password);
        toast.ok(`欢迎回来，${u.nickname}`);
      } else {
        const u = await register({ username: form.username.trim(), password: form.password, nickname: form.nickname.trim() });
        toast.ok(`注册成功，欢迎加入，${u.nickname}！`);
      }
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth-landing">
      <div className="auth-landing-hero">
        <div className="auth-hero-inner">
          <div className="row gap-8" style={{ marginBottom: 26 }}>
            <BrandMark size={40} />
            <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.02em' }}>HahaSNS</span>
          </div>
          <h1 className="auth-hero-title">连接有趣的人<br />与值得分享的内容</h1>
          <p className="auth-hero-sub">轻社交 · 轻论坛 · 轻社区</p>
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
        <div className="auth-form-card">
          <div className="auth-form-brand"><BrandMark size={34} /><span className="brand-name"><b>Haha</b><span>SNS</span></span></div>

          <Tabs
            aria-label="登录或注册"
            selectedKey={mode}
            onSelectionChange={(k) => { setMode(k); setErr(''); }}
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
            <Button type="submit" color="primary" size="lg" fullWidth radius="md" isLoading={busy} className="font-bold mt-1">
              {mode === 'login' ? '登 录' : '注 册'}
            </Button>
          </form>
        </div>
        <div className="faint" style={{ fontSize: 12, textAlign: 'center', marginTop: 18 }}>© 2026 HahaSNS · 轻社交社区</div>
      </div>
    </div>
  );
}
