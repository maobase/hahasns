// 管理后台共享小组件。Toggle 此前是 Admin.tsx 私有组件（其余面板 15+ 处在用），
// 第 2 刀时 PagesPanel 曾内联自带一份；本刀（第 3 刀）上提到此处统一共享，实现逐字不变。
export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} className={`ui-toggle${on ? ' on' : ''}`}
      style={disabled ? { opacity: 0.45, cursor: 'not-allowed' } : undefined} onClick={() => onChange(!on)}>
      <span className="ui-toggle-dot" />
    </button>
  );
}
