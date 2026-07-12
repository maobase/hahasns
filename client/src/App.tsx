import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useSite } from './context/SiteContext';
import AuthLanding from './pages/AuthLanding';
import Layout from './components/Layout';
import { RAIL_ITEMS } from './components/LeftRail';
import Home from './pages/Home';
import Discover from './pages/Discover';
import Topic from './pages/Topic';
import Forum from './pages/Forum';
import Board from './pages/Board';
import ThreadDetail from './pages/ThreadDetail';
import PostDetail from './pages/PostDetail';
import Profile from './pages/Profile';
import Messages from './pages/Messages';
import Notifications from './pages/Notifications';
import Member from './pages/Member';
import Search from './pages/Search';
import Settings from './pages/Settings';
const Mall = lazy(() => import('./pages/Mall'));
import Bookmarks from './pages/Bookmarks';
import History from './pages/History';
const Changelog = lazy(() => import('./pages/Changelog'));
import QA from './pages/QA';
import QADetail from './pages/QADetail';
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const Flash = lazy(() => import('./pages/Flash'));
const Circles = lazy(() => import('./pages/Circles'));
const CircleDetail = lazy(() => import('./pages/CircleDetail'));
const Achievements = lazy(() => import('./pages/Achievements'));
const Lottery = lazy(() => import('./pages/Lottery'));
const Checkin = lazy(() => import('./pages/Checkin'));
const AIChat = lazy(() => import('./pages/AIChat'));
const Articles = lazy(() => import('./pages/Articles'));
const ArticleDetail = lazy(() => import('./pages/ArticleDetail'));
const Collections = lazy(() => import('./pages/Collections'));
const CollectionDetail = lazy(() => import('./pages/CollectionDetail'));
const WriteArticle = lazy(() => import('./pages/WriteArticle'));
const Events = lazy(() => import('./pages/Events'));
const EventDetail = lazy(() => import('./pages/EventDetail'));
const Nav = lazy(() => import('./pages/Nav'));
const Admin = lazy(() => import('./pages/Admin'));
import About from './pages/About';
import NotFound from './pages/NotFound';
import { ConfirmHost } from './components/confirm';
import { ReportHost } from './components/report';
import { PromptHost } from './components/prompt';

// 游客不可访问（跳登录墙）：左栏所有 auth:true 项（AI/签到/任务/会员）+ 非左栏的个人页。
// 从 RAIL_ITEMS 派生，避免与左栏 auth 标记漂移（此前 /checkin·/achievements 漏进 → 游客直链看到半坏页）。
const LOGIN_REQUIRED_PATHS = [
  ...RAIL_ITEMS.filter((it) => it.auth).map((it) => it.to),
  '/settings', '/messages', '/notifications', '/bookmarks', '/history', '/write',
];
function loginRequired(pathname: string): boolean {
  return LOGIN_REQUIRED_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

function GuestLoginGate({ children }: { children: React.ReactNode }) {
  const { user, isGuest, setAuthOpen } = useAuth();
  const loc = useLocation();
  useEffect(() => {
    if (!user && isGuest && loginRequired(loc.pathname)) {
      setAuthOpen(true);
    }
  }, [user, isGuest, loc.pathname, setAuthOpen]);
  if (!user && isGuest && loginRequired(loc.pathname)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function PageGate({ on, children }: { on: boolean; children: React.ReactNode }) {
  if (!on) {
    return (
      <div className="center" style={{ padding: 48 }}>
        <div className="ui-card" style={{ padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>该页面暂未开放</div>
          <a href="/" className="btn btn-primary btn-sm" style={{ marginTop: 14 }}>返回首页</a>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading, isGuest, exitGuest } = useAuth();
  const site = useSite();
  // 站长关闭游客浏览后，清掉本地残留的游客标记，避免日后重新开启时静默再入游客态（须点「游客浏览」重新进入）
  useEffect(() => {
    if (site.loaded && !site.allowGuest && isGuest) exitGuest();
  }, [site.loaded, site.allowGuest, isGuest, exitGuest]);
  if (loading) return <div className="auth-splash"><div className="ui-spinner" /></div>;

  // allow_guest 关 → 与现状一致：未登录整树 AuthLanding
  // allow_guest 开 + 游客态 → Layout 只读；未进游客仍 AuthLanding
  const canBrowse = !!user || (site.allowGuest && isGuest);

  return (
    <Routes>
      <Route path="/admin/*" element={<Suspense fallback={<div className="auth-splash"><div className="ui-spinner" /></div>}><Admin /></Suspense>} />
      <Route path="/about" element={
        <PageGate on={site.pageAboutOn}><About /></PageGate>
      } />
      {!canBrowse ? (
        <Route path="*" element={<AuthLanding />} />
      ) : (
      <Route element={<GuestLoginGate><Layout /></GuestLoginGate>}>
        <Route path="/" element={<Home />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/topic/:name" element={<Topic />} />
        <Route path="/forum" element={<Forum />} />
        <Route path="/forum/:slug" element={<Board />} />
        <Route path="/thread/:id" element={<ThreadDetail />} />
        <Route path="/post/:id" element={<PostDetail />} />
        <Route path="/u/:username" element={<Profile />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/messages/:peerId" element={<Messages />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/member" element={<Member />} />
        <Route path="/ai" element={<Suspense fallback={<div className="center" style={{ padding: 48 }}><div className="ui-spinner" /></div>}><AIChat /></Suspense>} />
        <Route path="/mall" element={<Suspense fallback={<div className="center" style={{ padding: 48 }}><div className="ui-spinner" /></div>}><Mall /></Suspense>} />
        <Route path="/bookmarks" element={<Bookmarks />} />
        <Route path="/history" element={<History />} />
        <Route path="/changelog" element={
          <PageGate on={site.pageChangelogOn || site.pageRoadmapOn}>
            <Suspense fallback={<div className="center" style={{ padding: 48 }}><div className="ui-spinner" /></div>}><Changelog /></Suspense>
          </PageGate>
        } />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/flash" element={<Flash />} />
        <Route path="/circles" element={<Circles />} />
        <Route path="/circle/:slug" element={<CircleDetail />} />
        <Route path="/qa" element={<QA />} />
        <Route path="/qa/:id" element={<QADetail />} />
        <Route path="/achievements" element={<Achievements />} />
        <Route path="/lottery" element={<Lottery />} />
        <Route path="/checkin" element={<Checkin />} />
        <Route path="/articles" element={<Articles />} />
        <Route path="/article/:id" element={<ArticleDetail />} />
        <Route path="/write" element={<WriteArticle />} />
        <Route path="/events" element={<Events />} />
        <Route path="/event/:id" element={<EventDetail />} />
        <Route path="/collections" element={<Collections />} />
        <Route path="/collection/:id" element={<CollectionDetail />} />
        <Route path="/nav" element={<Nav />} />
        <Route path="/search" element={<Search />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      )}
    </Routes>
  );
}

export default function App() {
  return (
    <>
    <ConfirmHost />
    <ReportHost />
    <PromptHost />
    <AppRoutes />
    </>
  );
}
