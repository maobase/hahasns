import { useState, useEffect } from 'react';
import { RowSkeleton } from '../../components/States';
import { Button } from '../../components/heroui';
import { useToast } from '../../context/ToastContext';
import api from '../../api/client';
import { Toggle } from './ui';

// 布局市场：站长为各页面选择布局（默认三栏 / 宽屏 / 居中）。key=layout_<page>，缺省=该页内置默认。
// 第 8 刀自 Admin.tsx 整体抽离：LAYOUT_PAGE_LIST / LAYOUT_OPTS / Layouts 一并迁出，
// 组件自取自存、无外部 props，实现逐字不变。
const LAYOUT_PAGE_LIST: [string, string, string][] = [
  ['collections', '专题合集', 'wide'],
  ['nav', '网址导航', 'wide'],
  ['mall', '积分商城', 'wide'],
  ['circles', '圈子', 'wide'],
  ['achievements', '任务 / 成就', 'default'],
  ['member', '会员中心', 'default'],
  ['bookmarks', '我的收藏', 'default'],
  ['history', '浏览足迹', 'default'],
  ['settings', '编辑资料', 'narrow'],
  ['changelog', '更新日志', 'narrow'],
  ['thread', '帖子详情', 'narrow'],
];
const LAYOUT_OPTS: [string, string][] = [['default', '三栏（默认）'], ['wide', '宽屏铺满'], ['narrow', '居中阅读']];

export default function LayoutPanel() {
  const toast = useToast();
  const [cfg, setCfg] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get('/admin/config').then(({ data }) => setCfg(data.config)).catch(() => setCfg({})); }, []);
  const setK = (k: string, v: string) => setCfg((c) => ({ ...(c || {}), [k]: v }));
  const save = async () => {
    setSaving(true);
    try { await api.put('/admin/config', { config: cfg }); toast.ok('页面布局已保存，刷新对应页面查看'); }
    catch (e: any) { toast.err(e.message); }
    finally { setSaving(false); }
  };
  if (cfg === null) return <RowSkeleton rows={6} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>页面布局</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>为各页面选择布局：三栏（带右侧栏）、宽屏（内容铺满、适合网格）、居中（舒适阅读宽度、适合长文/表单）。Feed 类首页保持三栏。</div>
        <div className="sec-toggles" style={{ marginTop: 14 }}>
          {LAYOUT_PAGE_LIST.map(([k, label, def]) => (
            <div className="row" style={{ justifyContent: 'space-between', gap: 12 }} key={k}>
              <span style={{ fontSize: 13.5 }}>{label}</span>
              <select className="haha-inp" style={{ width: 150, flex: 'none' }} value={cfg[`layout_${k}`] || def} onChange={(e) => setK(`layout_${k}`, e.target.value)}>
                {LAYOUT_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>首页信息流布局</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>list = 现状单列；waterfall = 多列瀑布流（吸收右栏，左栏宽度不变）。默认 list。</div>
        <select className="haha-inp" style={{ marginTop: 12, maxWidth: 280 }} value={cfg.feed_layout || 'list'} onChange={(e) => setK('feed_layout', e.target.value)}>
          <option value="list">列表（默认）</option>
          <option value="waterfall">瀑布流</option>
        </select>
      </div>
      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>首页信息流标签</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>隐藏不需要的可选信息流标签（「推荐 / 最新」为核心，始终显示）。</div>
        <div className="sec-toggles" style={{ marginTop: 14 }}>
          {([['home_tab_following', '关注'], ['home_tab_video', '视频'], ['home_tab_samecity', '同城']] as [string, string][]).map(([k, label]) => (
            <div className="row" style={{ justifyContent: 'space-between', gap: 12 }} key={k}>
              <span style={{ fontSize: 13.5 }}>{label}</span>
              <Toggle on={(cfg[k] ?? '1') !== '0'} onChange={(v) => setK(k, v ? '1' : '0')} />
            </div>
          ))}
        </div>
      </div>
      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>右栏挂件</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>控制首页右侧栏各挂件的显示（与模块开关叠加：对应模块关闭时挂件也会自动隐藏）。</div>
        <div className="sec-toggles" style={{ marginTop: 14 }}>
          {([['widget_hottopics', '热门话题'], ['widget_qa', '问答'], ['widget_circle', '圈子'], ['widget_flash', '快讯'], ['widget_whotofollow', '谁值得关注'], ['widget_checkin', '签到榜'], ['widget_trending', '热搜']] as [string, string][]).map(([k, label]) => (
            <div className="row" style={{ justifyContent: 'space-between', gap: 12 }} key={k}>
              <span style={{ fontSize: 13.5 }}>{label}</span>
              <Toggle on={(cfg[k] ?? '1') !== '0'} onChange={(v) => setK(k, v ? '1' : '0')} />
            </div>
          ))}
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button color="primary" className="haha-btn-app" onClick={save} isDisabled={saving}>{saving ? '保存中…' : '保存布局'}</Button>
      </div>
    </div>
  );
}
