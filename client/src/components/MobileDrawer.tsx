import { useEffect } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import Avatar from './Avatar';
import Icon from './Icon';
import { Badges } from './Identity';
import { useAuth } from '../context/AuthContext';
import { useCompose } from '../context/ComposeContext';
import { useTheme } from '../context/ThemeContext';
import { RAIL_ITEMS } from './LeftRail';
import { useSite, moduleOn } from '../context/SiteContext';

// Mobile-only slide-in drawer that surfaces the full LeftRail navigation
// (圈子/问答/快报/专栏/活动/导航/排行榜/任务/签到/抽奖/商城/会员…), which is
// otherwise unreachable on phones because the left rail is hidden ≤880px.
export default function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, setAuthOpen } = useAuth();
  const { openCompose } = useCompose();
  const { theme, toggle, skin, setSkin, skins, style, setStyle, styles } = useTheme();
  const { modules, customNavLinks, navLabels } = useSite();
  const loc = useLocation();

  // close when the route changes (e.g. back button / programmatic nav)
  useEffect(() => { onClose(); }, [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // lock background scroll + close on Escape while open
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);

  const guard = (e: React.MouseEvent, auth?: boolean) => {
    if (auth && !user) { e.preventDefault(); setAuthOpen(true); }
    onClose();
  };

  return (
    <div className={`mdrawer-root${open ? ' open' : ''}`} aria-hidden={!open}>
      <div className="mdrawer-backdrop" onClick={onClose} />
      <aside className="mdrawer" role="dialog" aria-label="导航菜单">
        <div className="mdrawer-head">
          <span className="brand-name" style={{ fontSize: 18 }}><b>Haha</b><span>SNS</span></span>
          <button className="mdrawer-close" onClick={onClose} aria-label="关闭菜单"><Icon name="close" size={20} /></button>
        </div>

        {user ? (
          <Link to={`/u/${user.username}`} className="mdrawer-me" onClick={onClose}>
            <Avatar user={user} size={46} showV ring />
            <div className="nowrap" style={{ minWidth: 0 }}>
              <div className="uname" style={{ fontSize: 15 }}>{user.nickname} <Badges user={user} showLevel={false} /></div>
              <div className="faint" style={{ fontSize: 12.5 }}>@{user.username} · Lv.{user.level} · {user.points} 积分</div>
            </div>
          </Link>
        ) : (
          <button className="btn btn-primary btn-block" style={{ margin: '2px 0 6px' }} onClick={() => { setAuthOpen(true); onClose(); }}>登录 / 注册</button>
        )}

        <nav className="mdrawer-nav">
          {RAIL_ITEMS.filter((it) => moduleOn(modules, it.module)).map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end}
              onClick={(e) => guard(e, it.auth)}
              className={({ isActive }) => `mdrawer-item${isActive ? ' active' : ''}`}>
              <span className="ico"><Icon name={it.icon} size={20} /></span> {navLabels[it.to] || it.label}
            </NavLink>
          ))}
          {user?.role === 'admin' && (
            <NavLink to="/admin" onClick={onClose} className={({ isActive }) => `mdrawer-item${isActive ? ' active' : ''}`}>
              <span className="ico"><Icon name="shield" size={20} /></span> 管理后台
            </NavLink>
          )}
          {customNavLinks.map((l) => (
            /^https?:\/\//.test(l.url) ? (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" onClick={onClose} className="mdrawer-item">
                <span className="ico"><Icon name="compass" size={20} /></span> {l.label}
              </a>
            ) : (
              <NavLink key={l.url} to={l.url} onClick={onClose} className={({ isActive }) => `mdrawer-item${isActive ? ' active' : ''}`}>
                <span className="ico"><Icon name="compass" size={20} /></span> {l.label}
              </NavLink>
            )
          ))}
        </nav>

        <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 10 }} onClick={() => { openCompose(); onClose(); }}>
          <Icon name="edit" size={17} /> 发布动态
        </button>

        <div className="mdrawer-appearance">
          <div className="ts-title">外观与配色</div>
          <div className="ts-modes">
            <button className={`ts-mode${theme === 'light' ? ' on' : ''}`} onClick={() => theme !== 'light' && toggle()}><Icon name="sun" size={15} /> 浅色</button>
            <button className={`ts-mode${theme === 'dark' ? ' on' : ''}`} onClick={() => theme !== 'dark' && toggle()}><Icon name="moon" size={15} /> 深色</button>
          </div>
          <div className="ts-skins">
            {skins.map((s: any) => (
              <button key={s.key} className={`ts-skin${skin === s.key ? ' on' : ''}`} onClick={() => setSkin(s.key)} title={s.label}>
                <span className="ts-dot" style={{ background: s.color }}>{skin === s.key && <Icon name="check" size={12} />}</span>
                <span className="ts-label">{s.label}</span>
              </button>
            ))}
          </div>
          <div className="ts-title" style={{ marginTop: 14 }}>视觉风格</div>
          <div className="ts-styles">
            {styles.map((st: any) => (
              <button key={st.key} className={`ts-style${style === st.key ? ' on' : ''}`} onClick={() => setStyle(st.key)}>
                <span className="ts-style-name">{st.label}{style === st.key && <Icon name="check" size={12} />}</span>
                <span className="ts-style-desc">{st.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
