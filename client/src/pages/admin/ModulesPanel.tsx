import { useState, useEffect, Fragment } from 'react';
import Icon from '../../components/Icon';
import { RowSkeleton } from '../../components/States';
import { Button } from '../../components/heroui';
import { useToast } from '../../context/ToastContext';
import api from '../../api/client';
import { Toggle } from './ui';

// 模块市场 (C)：可开关的功能模块；key 与后端 MODULE_KEYS / 前端导航 module 一致
// [key, label, icon, group] —— 第4项用于在「模块」tab 内按主题分组展示。
// 第 8 刀自 Admin.tsx 整体抽离：MODULE_LIST / Modules 一并迁出，组件自取自存、无外部 props，实现逐字不变。
const MODULE_LIST: [string, string, string, string][] = [
  ['discover', '发现话题', 'compass', '内容与发现'], ['flash', '资讯快报', 'bell', '内容与发现'], ['articles', '专栏文章', 'book', '内容与发现'],
  ['events', '社区活动', 'ticket', '内容与发现'], ['nav', '网址导航', 'grid', '内容与发现'], ['forum', '社区论坛', 'forum', '内容与发现'], ['qa', '问答 · 悬赏', 'help', '内容与发现'],
  ['circles', '圈子', 'users', '互动与成长'], ['leaderboard', '排行榜', 'trend', '互动与成长'], ['achievements', '任务中心', 'checkin', '互动与成长'], ['checkin', '每日签到', 'calendar', '互动与成长'],
  ['lottery', '幸运抽奖', 'gift', '积分与运营'], ['mall', '积分商城', 'shop', '积分与运营'],
  ['ai', 'AI 智能助手', 'spark', '内容与发现'],
];

// 模块市场 (C)：开关各可选功能模块，关闭后从全站导航隐藏（核心功能不在内）。
export default function ModulesPanel() {
  const toast = useToast();
  const [cfg, setCfg] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get('/admin/config').then(({ data }) => setCfg(data.config)).catch(() => setCfg({})); }, []);
  const setK = (k: string, v: string) => setCfg((c) => ({ ...(c || {}), [k]: v }));
  const isOn = (k: string) => cfg?.[`module_${k}`] !== '0'; // 默认开启
  const save = async () => {
    setSaving(true);
    try { await api.put('/admin/config', { config: cfg }); toast.ok('模块设置已保存'); }
    catch (e: any) { toast.err(e.message); }
    finally { setSaving(false); }
  };
  if (cfg === null) return <RowSkeleton rows={6} />;
  const onCount = MODULE_LIST.filter(([k]) => isOn(k)).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>功能模块</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>关闭的模块会从左侧栏、移动端菜单与底部导航中隐藏（已开启 {onCount}/{MODULE_LIST.length}）。首页、私信、通知、会员中心等核心功能始终可用。</div>
        <div className="sec-toggles" style={{ marginTop: 14 }}>
          {(() => { let lastG = ''; return MODULE_LIST.map(([k, label, icon, g]) => {
            const head = g !== lastG ? g : null; lastG = g;
            return (
              <Fragment key={k}>
                {head && <div className="mod-group-head">{head}</div>}
                <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
                  <span className="row gap-8" style={{ fontSize: 13.5 }}><Icon name={icon} size={16} style={{ color: 'var(--ink-3)' }} /> {label}</span>
                  <Toggle on={isOn(k)} onChange={(v) => setK(`module_${k}`, v ? '1' : '0')} />
                </div>
              </Fragment>
            );
          }); })()}
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button color="primary" className="haha-btn-app" onClick={save} isDisabled={saving}>{saving ? '保存中…' : '保存设置'}</Button>
      </div>
    </div>
  );
}
