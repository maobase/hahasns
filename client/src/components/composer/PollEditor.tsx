import Icon from '../Icon';

// 投票编辑器：选项增删 + 多选开关 + 截止时间。受控组件，state 留在 Composer。
export interface PollValue {
  options: string[];
  multi: boolean;
  days: number;
}

export default function PollEditor({ value, onChange }: { value: PollValue; onChange: (v: PollValue | null) => void }) {
  return (
    <div className="poll-editor">
      <div className="poll-editor-head">
        <span><Icon name="poll" size={15} /> 发起投票</span>
        <button className="faint" style={{ fontSize: 12.5 }} onClick={() => onChange(null)}>移除</button>
      </div>
      {value.options.map((opt: any, i: number) => (
        <div className="poll-editor-row" key={i}>
          <input value={opt} maxLength={60} placeholder={`选项 ${i + 1}`}
            onChange={(e) => onChange({ ...value, options: value.options.map((o: any, j: number) => j === i ? e.target.value : o) })} />
          {value.options.length > 2 && (
            <button className="poll-editor-rm" title="删除选项"
              onClick={() => onChange({ ...value, options: value.options.filter((_: any, j: number) => j !== i) })}>
              <Icon name="close" size={15} />
            </button>
          )}
        </div>
      ))}
      {value.options.filter((o: any) => (o || '').trim()).length < 2 && (
        <div style={{ fontSize: 12, color: 'var(--danger, #d64545)', padding: '2px 2px 6px' }}>至少填写 2 个选项才能发起投票</div>
      )}
      <div className="poll-editor-foot">
        {value.options.length < 6 && (
          <button className="poll-add" onClick={() => onChange({ ...value, options: [...value.options, ''] })}>
            <Icon name="plus" size={14} /> 添加选项
          </button>
        )}
        <div className="spacer" />
        <label className="poll-multi"><input type="checkbox" checked={value.multi}
          onChange={(e) => onChange({ ...value, multi: e.target.checked })} /> 多选</label>
        <select className="vis-select" value={value.days}
          onChange={(e) => onChange({ ...value, days: Number(e.target.value) })} title="截止时间">
          <option value={0}>长期</option>
          <option value={1}>1 天</option>
          <option value={3}>3 天</option>
          <option value={7}>7 天</option>
        </select>
      </div>
    </div>
  );
}
