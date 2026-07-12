import { Outlet, useLocation, Link } from 'react-router-dom';
import { useEffect, Suspense } from 'react';
import { useSite, moduleOn } from '../context/SiteContext';
import { useAuth } from '../context/AuthContext';
import Navbar from './Navbar';
import ErrorBoundary from './ErrorBoundary';
import TabBar from './TabBar';
import AuthModal from './AuthModal';
import BackToTop from './BackToTop';
import ComposeFab from './ComposeFab';
import Shell from './Shell';
import { Empty } from './States';

type TitleLabel = string | ((m: RegExpMatchArray) => string);

// 模块市场 (C)：路径 → 模块 key。后台关闭模块后，直接访问其 URL 也拦截（route 守卫，闭环 v2.83）。
// collections 归入 articles；ai 补齐，关模块后直链也拦。
export const MODULE_PATHS: [RegExp, string][] = [
  [/^\/discover|^\/topic\//, 'discover'],
  [/^\/circles|^\/circle\//, 'circles'],
  [/^\/qa/, 'qa'],
  [/^\/flash/, 'flash'],
  [/^\/articles|^\/article\/|^\/write|^\/collections|^\/collection\//, 'articles'],
  [/^\/events|^\/event\//, 'events'],
  [/^\/nav/, 'nav'],
  [/^\/forum|^\/thread\//, 'forum'],
  [/^\/leaderboard/, 'leaderboard'],
  [/^\/achievements/, 'achievements'],
  [/^\/checkin/, 'checkin'],
  [/^\/lottery/, 'lottery'],
  [/^\/mall/, 'mall'],
  [/^\/ai/, 'ai'],
];
export function moduleForPath(path: string): string | null {
  for (const [re, k] of MODULE_PATHS) if (re.test(path)) return k;
  return null;
}

function ModuleClosed() {
  return (
    <Shell right={false}>
      <div className="ui-card" style={{ padding: 8 }}>
        <Empty icon="🚧" text="该功能暂未开放" />
        <div className="center" style={{ paddingBottom: 18 }}>
          <Link to="/" className="btn btn-primary btn-sm">返回首页</Link>
        </div>
      </div>
    </Shell>
  );
}

const TITLES: [RegExp, TitleLabel][] = [
  [/^\/$/, '首页'],
  [/^\/discover/, '发现话题'],
  [/^\/circles/, '圈子'],
  [/^\/circle\//, '圈子'],
  [/^\/qa\/[^/]+/, '问题详情'],
  [/^\/qa/, '问答 · 悬赏求助'],
  [/^\/flash/, '资讯快报'],
  [/^\/write/, '写文章'],
  [/^\/articles/, '专栏'],
  [/^\/article\//, '文章'],
  [/^\/events/, '社区活动'],
  [/^\/event\//, '活动详情'],
  [/^\/collections/, '专题合集'],
  [/^\/collection\//, '专题'],
  [/^\/nav/, '网址导航'],
  [/^\/achievements/, '任务中心'],
  [/^\/checkin/, '每日签到'],
  [/^\/lottery/, '幸运抽奖'],
  [/^\/leaderboard/, '排行榜'],
  [/^\/changelog/, '更新日志'],
  [/^\/forum\/[^/]+/, '板块'],
  [/^\/forum/, '社区论坛'],
  [/^\/thread\//, '帖子详情'],
  [/^\/post\//, '动态详情'],
  [/^\/u\/([^/]+)/, (m) => `@${decodeURIComponent(m[1])}`],
  [/^\/topic\/([^/]+)/, (m) => `#${decodeURIComponent(m[1])}#`],
  [/^\/messages/, '私信'],
  [/^\/notifications/, '通知'],
  [/^\/member/, '会员中心'],
  [/^\/mall/, '积分商城'],
  [/^\/bookmarks/, '我的收藏'],
  [/^\/history/, '浏览足迹'],
  [/^\/admin/, '管理后台'],
  [/^\/search/, '搜索'],
  [/^\/settings/, '编辑资料'],
];

function titleFor(path: string): string | null {
  for (const [re, label] of TITLES) {
    const m = path.match(re);
    if (m) return typeof label === 'function' ? label(m) : label;
  }
  return null;
}

export default function Layout() {
  const loc = useLocation();
  const site = useSite();
  const { isGuest, setAuthOpen } = useAuth();
  useEffect(() => {
    window.scrollTo(0, 0);
    const t = titleFor(loc.pathname);
    document.title = t ? `${t} · ${site.name}` : `${site.name} · ${site.slogan}`;
  }, [loc.pathname, site.name, site.slogan]);
  // 页面切换不再整页 keyed 淡入——之前 motion.div key=pathname 会把整棵子树(含左侧栏)卸载重挂并淡入，
  // 视觉上像「整体刷新闪一下」。SPA 局部替换直接渲染 Outlet，侧栏/导航稳定不动、内容即时切换。
  // 内容入场的细腻感由各页自身的骨架屏 / 列表项 react-rise 动画承担，无需整页动画。
  // 被关闭模块的路径 → 显示「未开启」而非正常页面（默认放行，仅显式 false 才拦截）
  const mk = moduleForPath(loc.pathname);
  const blocked = mk ? !moduleOn(site.modules, mk) : false;
  return (
    <>
      <Navbar />
      {isGuest && (
        <div className="guest-strip">
          <span>你正在游客浏览 · 登录后可发帖、评论、私信</span>
          <button className="btn btn-primary btn-sm" onClick={() => setAuthOpen(true)}>登录 / 注册</button>
        </div>
      )}
      {/* 单一 Suspense 边界兜住所有路由级懒加载的二级页；ErrorBoundary(key=路由)兜住页面组件崩溃，
          换页自动恢复、导航栏保持在位，而不是整页白屏。 */}
      {blocked ? <ModuleClosed /> : (
        <ErrorBoundary key={loc.pathname}>
          <Suspense fallback={<div className="center" style={{ padding: 48 }}><div className="ui-spinner" /></div>}><Outlet /></Suspense>
        </ErrorBoundary>
      )}
      {/* 全局 ICP 条：移动端/无右栏页也能看到备案号；空值不占位 */}
      {site.icpBeian ? (
        <div className="site-icp-bar">
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer noopener">{site.icpBeian}</a>
        </div>
      ) : null}
      <TabBar />
      <AuthModal />
      <BackToTop />
      <ComposeFab />
    </>
  );
}
