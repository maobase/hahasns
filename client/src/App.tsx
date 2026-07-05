import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import AuthLanding from './pages/AuthLanding';
import Layout from './components/Layout';
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
// 懒加载：Changelog(1364行) 与 Admin(2040行) 是最大的两个页面且都不在首屏关键路径，
// 拆成独立 chunk，缩小初始包、加快首屏（首屏只加载社交端核心页）。
const Changelog = lazy(() => import('./pages/Changelog'));
import QA from './pages/QA';
import QADetail from './pages/QADetail';
// 二级页（社区/福利/内容类，非首屏关键路径）路由级懒加载，缩小首屏主包（接 v4.41 SharePoster/Mall）。
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

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="auth-splash"><div className="ui-spinner" /></div>;
  return (
    <>
    <ConfirmHost />
    <ReportHost />
    <PromptHost />
    <Routes>
      {/* 后台是独立入口：/admin 自带登录 + 权限校验，不经过社交端登录墙（即使未登录也能直达后台登录页） */}
      <Route path="/admin/*" element={<Suspense fallback={<div className="auth-splash"><div className="ui-spinner" /></div>}><Admin /></Suspense>} />
      {/* 官网/功能展示页 — 访客（未登录）也能查看 */}
      <Route path="/about" element={<About />} />
      {/* Social app — gated behind the auth wall (registration/login required) */}
      {!user ? (
        <Route path="*" element={<AuthLanding />} />
      ) : (
      <Route element={<Layout />}>
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
        <Route path="/changelog" element={<Suspense fallback={<div className="center" style={{ padding: 48 }}><div className="ui-spinner" /></div>}><Changelog /></Suspense>} />
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
    </>
  );
}
