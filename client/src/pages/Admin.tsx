import { useState, useEffect, Fragment } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { Loading } from '../components/States';
import { Input, Button } from '../components/heroui';
import { useAuth } from '../context/AuthContext';
import { useSite } from '../context/SiteContext';
import OverviewPanel from './admin/OverviewPanel';
import UsersPanel from './admin/UsersPanel';
import BoardsPanel from './admin/BoardsPanel';
import TopicsPanel from './admin/TopicsPanel';
import ReportsPanel from './admin/ReportsPanel';
import NoticesPanel from './admin/NoticesPanel';
import StoragePanel from './admin/StoragePanel';
import PagesPanel from './admin/PagesPanel';
import AppearancePanel from './admin/AppearancePanel';
import SystemPanel from './admin/SystemPanel';
import PaymentPanel from './admin/PaymentPanel';
import LotteryPanel from './admin/LotteryPanel';
import CheckinPanel from './admin/CheckinPanel';
import FlashPanel from './admin/FlashPanel';
import NavPanel from './admin/NavPanel';
import ArticlesPanel from './admin/ArticlesPanel';
import EventsPanel from './admin/EventsPanel';
import CirclesPanel from './admin/CirclesPanel';
import QaPanel from './admin/QaPanel';
import MallPanel from './admin/MallPanel';
import SecurityPanel from './admin/SecurityPanel';
import ModulesPanel from './admin/ModulesPanel';
import LayoutPanel from './admin/LayoutPanel';
import LogsPanel from './admin/LogsPanel';
// 后台壳：tab 状态 / 侧栏分组导航 / 路由深链 / 登录墙。24 个面板已全部抽至 ./admin/*.tsx（第 1-10 刀）；
// 共享小组件（Toggle/ListHead/downloadCSV/SaveBtn/AdminSearch）在 ./admin/ui.tsx，由各面板直接引用，壳不再经手。

const TABS = [
  { k: 'overview', l: '概览', icon: 'trend', d: '站点数据总览与今日动态' },
  { k: 'users', l: '用户', icon: 'user', d: '管理用户身份、VIP 等级、积分与封禁' },
  { k: 'boards', l: '板块', icon: 'forum', d: '论坛板块的新建、编辑与版主设置' },
  { k: 'topics', l: '话题', icon: 'fire', d: '话题增删改与发现页热度权重' },
  { k: 'reports', l: '举报', icon: 'flag', d: '处理用户举报、删除违规内容' },
  { k: 'notices', l: '公告', icon: 'bell', d: '全站公告横幅的发布与管理' },
  { k: 'flash', l: '快报', icon: 'fire', d: '资讯快报的发布、置顶与编辑' },
  { k: 'nav', l: '导航', icon: 'link', d: '站点推荐目录的分类与链接' },
  { k: 'articles', l: '文章', icon: 'edit', d: '专栏文章的精选与管理' },
  { k: 'events', l: '活动', icon: 'ticket', d: '社区活动的查看与下架' },
  { k: 'circles', l: '圈子', icon: 'users', d: '圈子的查看与解散' },
  { k: 'qa', l: '问答', icon: 'help', d: '问答与悬赏内容管理' },
  { k: 'mall', l: '商城', icon: 'shop', d: '积分商品的上架、编辑与下架' },
  { k: 'payment', l: '支付', icon: 'coin', d: '支付网关配置与充值订单对账' },
  { k: 'lottery', l: '抽奖', icon: 'gift', d: '奖品配置与中奖记录' },
  { k: 'checkin', l: '签到', icon: 'calendar', d: '签到奖励配置与活跃统计' },
  { k: 'security', l: '安全', icon: 'shield', d: '注册验证、频率限制与权限门控' },
  { k: 'modules', l: '模块', icon: 'grid', d: '前台功能模块的开关' },
  { k: 'layout', l: '布局', icon: 'compass', d: '各页面布局（三栏 / 宽屏 / 居中）' },
  { k: 'appearance', l: '外观', icon: 'image', d: '站点品牌、Logo 与自定义 CSS' },
  { k: 'pages', l: '页面内容', icon: 'book', d: '关于 / 路线图 / 更新日志 可编辑与开关' },
  { k: 'storage', l: '存储', icon: 'image', d: '本地 / S3 兼容对象存储（七牛等）' },
  { k: 'audit', l: '日志', icon: 'book', d: '管理操作审计记录' },
  { k: 'system', l: '系统更新', icon: 'rocket', d: '版本检测与一键升级' },
];
// 侧边导航分组（design.md B 端高密度 nav 分区）：21 个 tab 按职能归到 5 组，桌面侧栏显示分组小标题；移动端横向 nav 隐藏标题。
const NAV_GROUPS: { l: string; keys: string[] }[] = [
  { l: '数据', keys: ['overview'] },
  { l: '内容', keys: ['boards', 'topics', 'articles', 'flash', 'events', 'circles', 'qa', 'nav'] },
  { l: '运营', keys: ['notices', 'mall', 'payment', 'lottery', 'checkin'] },
  { l: '用户', keys: ['users', 'reports'] },
  { l: '系统', keys: ['security', 'modules', 'layout', 'appearance', 'pages', 'storage', 'audit', 'system'] },
];
const TAB_BY_K = Object.fromEntries(TABS.map((t) => [t.k, t]));
// tab key → 所属分组名（顶栏面包屑用）
const GROUP_OF: Record<string, string> = {};
NAV_GROUPS.forEach((g) => g.keys.forEach((k) => { GROUP_OF[k] = g.l; }));

function AdminLogin() {
  const { login } = useAuth();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e: any) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const usr = await login(u.trim(), p);
      if (usr.role !== 'admin') setErr('该账号不是管理员，无法进入后台');
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="admin-center">
      <form className="admin-login-card" onSubmit={submit}>
        <span className="admin-logo lg"><Icon name="shield" size={26} /></span>
        <div style={{ fontWeight: 800, fontSize: 19, marginTop: 12 }}>HahaSNS 管理后台</div>
        <div className="muted" style={{ fontSize: 13, marginTop: 4, marginBottom: 18 }}>请使用管理员账号登录</div>
        {err && <div className="form-err">{err}</div>}
        <Input className="haha-inp" placeholder="管理员用户名" value={u} onChange={(e: any) => setU(e.target.value)} autoFocus />
        <Input className="haha-inp" type="password" placeholder="密码" value={p} onChange={(e: any) => setP(e.target.value)} style={{ marginTop: 10 }} />
        <Button type="submit" size="lg" color="primary" fullWidth className="haha-btn-app" isDisabled={busy} style={{ marginTop: 14, fontWeight: 700 }}>
          {busy ? '登录中…' : '登录'}
        </Button>
        <Link to="/" className="faint" style={{ fontSize: 12.5, marginTop: 16, display: 'inline-block' }}>← 返回前台</Link>
      </form>
    </div>
  );
}

export default function Admin() {
  const { user, loading, logout } = useAuth();
  const { name: siteName } = useSite();
  const navigate = useNavigate();
  const location = useLocation();
  // tab 以 URL 为准（/admin/<tab>）→ 可深链 + 浏览器前进/后退；非法 tab 回退 overview
  const rawTab = location.pathname.replace(/^\/admin\/?/, '').split('/')[0];
  const tab = TAB_BY_K[rawTab] ? rawTab : 'overview';
  const setTab = (k: string) => navigate('/admin/' + k);
  // 后台独立的浅/深主题（与前台主题互不影响），持久化到 localStorage。design.md 深色变体。
  const [adminTheme, setAdminTheme] = useState<string>(() => {
    try { return localStorage.getItem('haha_admin_theme') || 'light'; } catch { return 'light'; }
  });
  const toggleTheme = () => setAdminTheme((t) => {
    const n = t === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('haha_admin_theme', n); } catch { /* ignore */ }
    return n;
  });

  // 移动端横向 nav：切 tab 后把选中项滚动到可见（block:nearest 避免带动整页竖滚）。桌面竖向侧栏同样受益。
  useEffect(() => {
    document.querySelector('.admin-nav-item.active')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [tab]);

  if (loading) return <div className="admin-center"><Loading /></div>;
  if (!user) return <AdminLogin />;
  if (user.role !== 'admin')
    return (
      <div className="admin-center">
        <div className="ui-card" style={{ padding: 40, textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: 42 }}>🛡️</div>
          <div style={{ fontWeight: 800, fontSize: 18, marginTop: 10 }}>需要管理员权限</div>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>该后台仅对管理员开放</div>
          <Link to="/" className="haha-btn-app haha-btn-app--primary haha-btn-app--lg" style={{ marginTop: 18 }}>返回前台首页</Link>
        </div>
      </div>
    );

  const current = TABS.find((t) => t.k === tab) || TABS[0];
  return (
    <>
    <div className="admin-shell" data-admin-theme={adminTheme}>
      <aside className="admin-side">
        <div className="admin-brand">
          <span className="admin-logo"><Icon name="shield" size={18} /></span>
          <div className="admin-brand-txt"><b>{siteName}</b><span>管理后台</span></div>
        </div>
        <nav className="admin-nav">
          {NAV_GROUPS.map((grp) => (
            <Fragment key={grp.l}>
              <div className="admin-nav-group-head">{grp.l}</div>
              {grp.keys.map((k) => {
                const t = TAB_BY_K[k];
                return t ? (
                  <button key={k} className={`admin-nav-item${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>
                    <Icon name={t.icon} size={18} /> {t.l}
                  </button>
                ) : null;
              })}
            </Fragment>
          ))}
        </nav>
        <div className="admin-side-foot">
          <Link to="/" className="admin-nav-item"><Icon name="back" size={18} /> 返回前台</Link>
          <button className="admin-nav-item danger" onClick={logout}><Icon name="logout" size={18} /> 退出登录</button>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-top">
          <div className="admin-top-head">
            <span className="admin-crumb">管理后台 <span className="admin-crumb-sep">/</span> {GROUP_OF[tab] || '概览'}</span>
            <h1><Icon name={current.icon} size={17} /> {current.l}</h1>
            {current.d && <span className="admin-top-sub">{current.d}</span>}
          </div>
          <div className="row gap-8" style={{ alignItems: 'center' }}>
            <button className="admin-theme-btn" onClick={toggleTheme} title={adminTheme === 'dark' ? '切换浅色后台' : '切换深色后台'} aria-label="切换后台主题"><Icon name={adminTheme === 'dark' ? 'sun' : 'moon'} size={17} /></button>
            <Avatar user={user} size={34} showV /><span style={{ fontWeight: 600 }}>{user.nickname}</span>
          </div>
        </header>
        <div className="admin-content">
          {tab === 'overview' && <OverviewPanel onNav={setTab} />}
          {tab === 'users' && <UsersPanel />}
          {tab === 'boards' && <BoardsPanel />}
          {tab === 'topics' && <TopicsPanel />}
          {tab === 'reports' && <ReportsPanel />}
          {tab === 'notices' && <NoticesPanel />}
          {tab === 'flash' && <FlashPanel />}
          {tab === 'nav' && <NavPanel />}
          {tab === 'articles' && <ArticlesPanel />}
          {tab === 'events' && <EventsPanel />}
          {tab === 'circles' && <CirclesPanel />}
          {tab === 'qa' && <QaPanel />}
          {tab === 'payment' && <PaymentPanel />}
          {tab === 'lottery' && <LotteryPanel />}
          {tab === 'checkin' && <CheckinPanel />}
          {tab === 'mall' && <MallPanel />}
          {tab === 'security' && <SecurityPanel />}
          {tab === 'modules' && <ModulesPanel />}
          {tab === 'layout' && <LayoutPanel />}
          {tab === 'appearance' && <AppearancePanel />}
          {tab === 'pages' && <PagesPanel />}
          {tab === 'storage' && <StoragePanel />}
          {tab === 'audit' && <LogsPanel />}
          {tab === 'system' && <SystemPanel />}
        </div>
      </main>
    </div>
    </>
  );
}
