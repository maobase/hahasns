import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import LeftRail from './LeftRail';
import { useSite, moduleOn, widgetOn } from '../context/SiteContext';
import { HotTopics, CheckinRank, WhoToFollow, TrendingSearch, FlashWidget, CircleWidget, QAWidget, Footer } from './Widgets';

// 右栏小组件随模块开关隐藏（与导航/路由一致，闭环 C 模块市场）；通用组件(关注/热搜/页脚)始终显示。
function DefaultRight() {
  const { modules, widgets } = useSite();
  return (
    <>
      {moduleOn(modules, 'discover') && widgetOn(widgets, 'hottopics') && <HotTopics />}
      {moduleOn(modules, 'qa') && widgetOn(widgets, 'qa') && <QAWidget />}
      {moduleOn(modules, 'circles') && widgetOn(widgets, 'circle') && <CircleWidget />}
      {moduleOn(modules, 'flash') && widgetOn(widgets, 'flash') && <FlashWidget />}
      {widgetOn(widgets, 'whotofollow') && <WhoToFollow />}
      {moduleOn(modules, 'checkin') && widgetOn(widgets, 'checkin') && <CheckinRank />}
      {widgetOn(widgets, 'trending') && <TrendingSearch />}
      <Footer />
    </>
  );
}

interface ShellProps {
  children?: ReactNode;
  right?: ReactNode | boolean;
  wide?: boolean;
  narrow?: boolean;
  // 后台可配置布局：'default' | 'wide' | 'narrow'（优先于 wide/narrow 布尔；来自 useLayout()）
  layout?: string;
  onCompose?: () => void;
}

// Three-column shell. Pass `right={false}` to hide widgets, or a custom node.
// Pass `wide` for surfaces that need the full width (e.g. browse grids / AI chat).
// Pass `narrow` for reading / form pages: no right rail, content capped at a
// comfortable reading width and CENTERED in the area beside the nav rail
// (avoids the left-shifted "narrow content + empty right gap" look).
export default function Shell({ children, right, wide = false, narrow = false, layout, onCompose }: ShellProps) {
  const nav = useNavigate();
  const compose = onCompose || (() => nav('/', { state: { compose: true } }));
  // layout prop（后台配置）优先；否则回落到 wide/narrow 布尔
  const mode = layout === 'wide' || layout === 'narrow' || layout === 'default'
    ? layout
    : (wide ? 'wide' : narrow ? 'narrow' : 'default');
  const noRight = mode === 'wide' || mode === 'narrow' || right === false;
  const cls = mode === 'wide' ? 'shell shell-wide' : mode === 'narrow' ? 'shell shell-read' : `shell${noRight ? ' shell-2col' : ''}`;
  return (
    <div className={cls}>
      <LeftRail onCompose={compose} />
      <main className="col-center">{children}</main>
      {!noRight && <aside className="col-right">{right || <DefaultRight />}</aside>}
    </div>
  );
}
