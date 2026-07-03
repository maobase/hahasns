import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

/**
 * 兜底错误边界：任一子组件 render/生命周期抛错时，展示友好提示 + 刷新按钮，
 * 而不是整页白屏。放两处：main.tsx 顶层(catch-all，兜住导航栏/Provider) +
 * Layout 页面内容(key=路由，换页自动恢复，且崩的是单页时导航栏仍在)。
 * 组件本身零外部依赖（只用全局 CSS 类 + window.location），避免兜底 UI 自己再崩。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    // 仅记录到 console，便于线上排查；不外发第三方。
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="center" style={{ flexDirection: 'column', gap: 14, padding: '64px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 44, lineHeight: 1 }}>😵</div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>页面出了点问题</div>
        <div className="faint" style={{ fontSize: 13.5, maxWidth: 320, lineHeight: 1.6 }}>刷新一下通常就好了；如果反复出现，请稍后再试。</div>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>刷新页面</button>
      </div>
    );
  }
}
