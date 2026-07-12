import { Fragment } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import Avatar from './Avatar';
import Icon from './Icon';
import { Badges } from './Identity';
import { useAuth } from '../context/AuthContext';
import { useCompose } from '../context/ComposeContext';
import { useSite, moduleOn } from '../context/SiteContext';

export interface RailItem {
  to: string;
  icon: string;
  label: string;
  end?: boolean;
  auth?: boolean;
  module?: string; // 模块市场 (C)：对应可关模块 key；后台关闭后从导航隐藏。核心项不设。
  section?: string; // 分组小标题（左栏按组显示；核心项不设 → 置顶无标题）
}

// 分组导航：核心(首页/发现) → 社区(内容/互动) → 福利·我的(激励/账户)。
// 私信 / 通知 不再重复列此处——顶栏(桌面)与底部导航/顶部铃铛(移动)已有入口。
export const RAIL_ITEMS: RailItem[] = [
  { to: '/', icon: 'home', label: '首页', end: true },
  { to: '/discover', icon: 'compass', label: '发现', module: 'discover' },
  { to: '/forum', icon: 'forum', label: '论坛', module: 'forum', section: '社区' },
  { to: '/circles', icon: 'users', label: '圈子', module: 'circles', section: '社区' },
  { to: '/qa', icon: 'help', label: '问答', module: 'qa', section: '社区' },
  { to: '/ai', icon: 'spark', label: 'AI 助手', module: 'ai', auth: true, section: '社区' },
  { to: '/flash', icon: 'bell', label: '快报', module: 'flash', section: '社区' },
  { to: '/articles', icon: 'book', label: '专栏', module: 'articles', section: '社区' },
  { to: '/collections', icon: 'grid', label: '专题', module: 'articles', section: '社区' },
  { to: '/events', icon: 'ticket', label: '活动', module: 'events', section: '社区' },
  { to: '/nav', icon: 'grid', label: '导航', module: 'nav', section: '社区' },
  { to: '/checkin', icon: 'calendar', label: '签到', auth: true, module: 'checkin', section: '福利 · 我的' },
  { to: '/achievements', icon: 'checkin', label: '任务', auth: true, module: 'achievements', section: '福利 · 我的' },
  { to: '/lottery', icon: 'gift', label: '抽奖', module: 'lottery', section: '福利 · 我的' },
  { to: '/leaderboard', icon: 'trend', label: '排行榜', module: 'leaderboard', section: '福利 · 我的' },
  { to: '/mall', icon: 'shop', label: '积分商城', module: 'mall', section: '福利 · 我的' },
  { to: '/member', icon: 'coin', label: '会员中心', auth: true, section: '福利 · 我的' },
];

interface LeftRailProps {
  onCompose?: () => void;
}

export default function LeftRail({ onCompose }: LeftRailProps) {
  const { user, setAuthOpen } = useAuth();
  const { openCompose } = useCompose();
  const { modules, customNavLinks, navLabels } = useSite();
  const loc = useLocation();
  // 在「自己的主页」上隐藏左栏「我的」卡片——主页大头部已展示同样的头像/昵称/统计，避免重复
  const onOwnProfile = !!user && decodeURIComponent(loc.pathname) === `/u/${user.username}`;

  return (
    <div className="col-left">
      {user && !onOwnProfile && (
        <Link to={`/u/${user.username}`} className="ui-card" style={{ padding: 14, marginBottom: 14, display: 'block' }}>
          <div className="row gap-12">
            <Avatar user={user} size={48} showV noLink />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="uname" style={{ fontSize: 15, flexWrap: 'wrap', rowGap: 4 }}>
                <span className="nowrap" style={{ maxWidth: '100%' }}>{user.nickname}</span>
                <Badges user={user} showLevel={false} />
              </div>
              <div className="faint nowrap" style={{ fontSize: 12.5 }}>@{user.username}</div>
            </div>
          </div>
          <div className="row" style={{ marginTop: 12, gap: 16, fontSize: 13 }}>
            <span><b className="num" style={{ fontWeight: 800 }}>{user.postCount}</b> <span className="muted">动态</span></span>
            <span><b className="num" style={{ fontWeight: 800 }}>{user.following}</b> <span className="muted">关注</span></span>
            <span><b className="num" style={{ fontWeight: 800 }}>{user.followers}</b> <span className="muted">粉丝</span></span>
          </div>
        </Link>
      )}

      <nav className="rail">
        {RAIL_ITEMS.filter((it) => moduleOn(modules, it.module)).map((it, i, arr) => (
          <Fragment key={it.to}>
            {it.section && it.section !== arr[i - 1]?.section && (
              <div className="rail-section">{it.section}</div>
            )}
            <NavLink
              to={it.to}
              end={it.end}
              onClick={(e: React.MouseEvent) => { if (it.auth && !user) { e.preventDefault(); setAuthOpen(true); } }}
              className={({ isActive }) => `rail-item${isActive ? ' active' : ''}`}
            >
              <span className="ico"><Icon name={it.icon} size={21} /></span> {navLabels[it.to] || it.label}
            </NavLink>
          </Fragment>
        ))}
        {user?.role === 'admin' && (
          <NavLink to="/admin" className={({ isActive }) => `rail-item${isActive ? ' active' : ''}`}>
            <span className="ico"><Icon name="shield" size={21} /></span> 管理后台
          </NavLink>
        )}
        {customNavLinks.length > 0 && <div className="rail-section">更多</div>}
        {customNavLinks.map((l) => (
          /^https?:\/\//.test(l.url) ? (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="rail-item">
              <span className="ico"><Icon name="compass" size={21} /></span> {l.label}
            </a>
          ) : (
            <NavLink key={l.url} to={l.url} className={({ isActive }) => `rail-item${isActive ? ' active' : ''}`}>
              <span className="ico"><Icon name="compass" size={21} /></span> {l.label}
            </NavLink>
          )
        ))}
      </nav>

      <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 14 }} onClick={openCompose}>
        <Icon name="edit" size={17} /> 发布动态
      </button>
    </div>
  );
}
