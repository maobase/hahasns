import { useState, useEffect, Fragment } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { Badges } from '../components/Identity';
import { Loading, Empty, RowSkeleton } from '../components/States';
import { Input, Button } from '../components/heroui';
import { useAuth } from '../context/AuthContext';
import { useSite } from '../context/SiteContext';
import { useToast } from '../context/ToastContext';
import api from '../api/client';
import { fmtNum, timeAgo } from '../lib/format';
import { confirmDialog } from '../components/confirm';
import UsersPanel from './admin/UsersPanel';
import BoardsPanel from './admin/BoardsPanel';
import TopicsPanel from './admin/TopicsPanel';
import ReportsPanel from './admin/ReportsPanel';
import NoticesPanel from './admin/NoticesPanel';
import StoragePanel from './admin/StoragePanel';
import PagesPanel from './admin/PagesPanel';
import AppearancePanel from './admin/AppearancePanel';
import SystemPanel from './admin/SystemPanel';
import PaymentPanel from './admin/PaymentPanel';
import LotteryPanel from './admin/LotteryPanel';
import CheckinPanel from './admin/CheckinPanel';
import FlashPanel from './admin/FlashPanel';
import NavPanel from './admin/NavPanel';
import MallPanel from './admin/MallPanel';
import SecurityPanel from './admin/SecurityPanel';
import ModulesPanel from './admin/ModulesPanel';
import LayoutPanel from './admin/LayoutPanel';
import { ListHead, downloadCSV, AdminSearch } from './admin/ui';
// 品牌化二次确认已抽到 ../components/confirm（全站共用，<ConfirmHost/> 挂在 App 根）。
// downloadCSV / ListHead 第 5 刀上提 ./admin/ui（支付面板抽离后多处共用）；
// SaveBtn 第 6 刀上提 ./admin/ui（抽奖面板抽离后用户/板块/快报/导航/抽奖多处共用）。
// AdminSearch 第 7 刀上提 ./admin/ui（快报面板抽离后用户/话题/商品/文章/活动/圈子/问答多处共用）。
// 第 9 刀：用户/板块/话题/举报/公告五面板整体抽离（Toggle/SaveBtn 在本文档已无直接使用，仍由 ./admin/ui 供各面板引用）。

const TABS = [
  { k: 'overview', l: '概览', icon: 'trend', d: '站点数据总览与今日动态' },
  { k: 'users', l: '用户', icon: 'user', d: '管理用户身份、VIP 等级、积分与封禁' },
  { k: 'boards', l: '板块', icon: 'forum', d: '论坛板块的新建、编辑与版主设置' },
  { k: 'topics', l: '话题', icon: 'fire', d: '话题增删改与发现页热度权重' },
  { k: 'reports', l: '举报', icon: 'flag', d: '处理用户举报、删除违规内容' },
  { k: 'notices', l: '公告', icon: 'bell', d: '全站公告横幅的发布与管理' },
  { k: 'flash', l: '快报', icon: 'fire', d: '资讯快报的发布、置顶与编辑' },
  { k: 'nav', l: '导航', icon: 'link', d: '站点推荐目录的分类与链接' },
  { k: 'articles', l: '文章', icon: 'edit', d: '专栏文章的精选与管理' },
  { k: 'events', l: '活动', icon: 'ticket', d: '社区活动的查看与下架' },
  { k: 'circles', l: '圈子', icon: 'users', d: '圈子的查看与解散' },
  { k: 'qa', l: '问答', icon: 'help', d: '问答与悬赏内容管理' },
  { k: 'mall', l: '商城', icon: 'shop', d: '积分商品的上架、编辑与下架' },
  { k: 'payment', l: '支付', icon: 'coin', d: '支付网关配置与充值订单对账' },
  { k: 'lottery', l: '抽奖', icon: 'gift', d: '奖品配置与中奖记录' },
  { k: 'checkin', l: '签到', icon: 'calendar', d: '签到奖励配置与活跃统计' },
  { k: 'security', l: '安全', icon: 'shield', d: '注册验证、频率限制与权限门控' },
  { k: 'modules', l: '模块', icon: 'grid', d: '前台功能模块的开关' },
  { k: 'layout', l: '布局', icon: 'compass', d: '各页面布局（三栏 / 宽屏 / 居中）' },
  { k: 'appearance', l: '外观', icon: 'image', d: '站点品牌、Logo 与自定义 CSS' },
  { k: 'pages', l: '页面内容', icon: 'book', d: '关于 / 路线图 / 更新日志 可编辑与开关' },
  { k: 'storage', l: '存储', icon: 'image', d: '本地 / S3 兼容对象存储（七牛等）' },
  { k: 'audit', l: '日志', icon: 'book', d: '管理操作审计记录' },
  { k: 'system', l: '系统更新', icon: 'rocket', d: '版本检测与一键升级' },
];
// 侧边导航分组（design.md B 端高密度 nav 分区）：21 个 tab 按职能归到 5 组，桌面侧栏显示分组小标题；移动端横向 nav 隐藏标题。
const NAV_GROUPS: { l: string; keys: string[] }[] = [
  { l: '数据', keys: ['overview'] },
  { l: '内容', keys: ['boards', 'topics', 'articles', 'flash', 'events', 'circles', 'qa', 'nav'] },
  { l: '运营', keys: ['notices', 'mall', 'payment', 'lottery', 'checkin'] },
  { l: '用户', keys: ['users', 'reports'] },
  { l: '系统', keys: ['security', 'modules', 'layout', 'appearance', 'pages', 'storage', 'audit', 'system'] },
];
const TAB_BY_K = Object.fromEntries(TABS.map((t) => [t.k, t]));
// tab key → 所属分组名（顶栏面包屑用）
const GROUP_OF: Record<string, string> = {};
NAV_GROUPS.forEach((g) => g.keys.forEach((k) => { GROUP_OF[k] = g.l; }));

const AUDIT_ICON: Record<string, string> = {
  'user.update': 'user', 'content.delete': 'trash', 'report.resolve': 'flag',
  'board.create': 'forum', 'board.update': 'forum', 'board.delete': 'trash', 'board.moderator': 'shield',
  'topic.create': 'fire', 'topic.delete': 'trash', 'product.create': 'shop', 'product.delete': 'trash',
  'notice.create': 'bell', 'notice.update': 'bell', 'notice.delete': 'trash',
  'config.update': 'shield',
};

const AUDIT_PREFIX_LABEL: Record<string, string> = {
  user: '用户', content: '内容', report: '举报', board: '板块', topic: '话题', product: '商品', notice: '公告', config: '配置',
};

function AuditLog() {
  const [logs, setLogs] = useState<any[] | null>(null);
  const [filter, setFilter] = useState('all');
  useEffect(() => { api.get('/admin/audit').then(({ data }) => setLogs(data.logs)).catch(() => setLogs([])); }, []);
  if (logs === null) return <RowSkeleton rows={8} />;
  if (!logs.length) return <div className="ui-card"><Empty icon="📋" text="还没有管理操作记录" /></div>;
  const present = [...new Set(logs.map((l) => l.action.split('.')[0]))].filter((p) => AUDIT_PREFIX_LABEL[p]);
  const chips: [string, string][] = [['all', '全部'], ...present.map((p) => [p, AUDIT_PREFIX_LABEL[p]] as [string, string])];
  const shown = filter === 'all' ? logs : logs.filter((l) => l.action.split('.')[0] === filter);
  return (
    <div className="flex flex-col gap-4">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        {chips.length > 2 ? (
          <div className="audit-filters">
            {chips.map(([k, label]) => (
              <button key={k} className={`audit-chip${filter === k ? ' active' : ''}`} onClick={() => setFilter(k)}>
                {label}{k !== 'all' ? <span className="audit-chip-n"> {logs.filter((l) => l.action.split('.')[0] === k).length}</span> : <span className="audit-chip-n"> {logs.length}</span>}
              </button>
            ))}
          </div>
        ) : <span />}
        <Button size="sm" variant="flat" className="haha-btn-app" isDisabled={!shown.length} title="导出当前筛选的操作日志为 CSV" onClick={() => downloadCSV(`管理日志_${filter}.csv`, [
          { label: '时间', get: (l: any) => l.createdAt },
          { label: '管理员', get: (l: any) => l.admin?.nickname || '管理员' },
          { label: '操作', get: (l: any) => l.actionLabel },
          { label: '动作类型', get: (l: any) => l.action },
          { label: '详情', get: (l: any) => l.detail || '' },
        ], shown)}>导出 CSV</Button>
      </div>
      <div className="ui-card" style={{ overflow: 'hidden' }}>
        {shown.length === 0 ? <Empty text="该类型暂无记录" /> : shown.map((l, i) => (
          <div key={l.id}>{i > 0 && <div className="divider" />}
            <div className="row gap-12" style={{ padding: '12px 16px', alignItems: 'flex-start' }}>
              <span className={`audit-ico${l.action.endsWith('.delete') ? ' danger' : ''}`}><Icon name={AUDIT_ICON[l.action] || 'shield'} size={16} /></span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5 }}><b>{l.admin?.nickname || '管理员'}</b><span style={{ color: 'var(--ink-3)' }}> {l.actionLabel}</span></div>
                {l.detail && <div className="faint" style={{ fontSize: 12.5, marginTop: 2, wordBreak: 'break-word' }}>{l.detail}</div>}
              </div>
              <span className="faint nowrap" style={{ fontSize: 11.5, flex: 'none' }}>{timeAgo(l.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Overview({ onNav }: { onNav?: (tab: string) => void }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api.get('/admin/overview').then(({ data }) => setData(data)); }, []);
  if (!data) return (
    <>
      <div className="stat-grid">
        {Array.from({ length: 8 }).map((_, i) => (
          <div className="ui-card" key={i} style={{ padding: 16 }}>
            <div className="skeleton" style={{ width: '45%', height: 12, borderRadius: 6 }} />
            <div className="skeleton" style={{ width: '60%', height: 22, borderRadius: 6, marginTop: 14 }} />
          </div>
        ))}
      </div>
      <div className="ui-card" style={{ marginTop: 'var(--gap)', padding: 18 }}>
        <div className="skeleton" style={{ width: 120, height: 14, borderRadius: 6, marginBottom: 16 }} />
        <div className="skeleton" style={{ width: '100%', height: 140, borderRadius: 8 }} />
      </div>
      <div className="ui-card" style={{ marginTop: 'var(--gap)', overflow: 'hidden' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="row gap-12" style={{ padding: '12px 18px', borderTop: i ? '1px solid var(--line)' : 'none' }}>
            <div className="skeleton" style={{ width: 38, height: 38, borderRadius: '30%', flex: 'none' }} />
            <div className="grow"><div className="skeleton" style={{ width: '40%', height: 13, borderRadius: 6 }} /><div className="skeleton" style={{ width: '24%', height: 10, borderRadius: 6, marginTop: 7 }} /></div>
          </div>
        ))}
      </div>
    </>
  );
  const S = data.stats;
  // 第5项=可跳转的管理 tab（null=纯指标卡，不可点）。让概览成为可操作仪表盘。
  const cards: [string, number, string, string, string | null][] = [
    ['用户', S.users, 'user', 'var(--brand)', 'users'], ['动态', S.posts, 'home', 'var(--good)', null],
    ['帖子', S.threads, 'forum', 'var(--coral)', null], ['评论', S.comments, 'comment', 'var(--verify)', null],
    ['话题', S.topics, 'fire', 'var(--gold)', 'topics'], ['板块', S.boards, 'forum', 'var(--ink-3)', 'boards'],
    ['VIP 会员', S.vip, 'coin', 'var(--gold-deep)', 'users'], ['待处理举报', S.reports, 'flag', 'var(--like)', 'reports'],
  ];
  const today = data.today;
  return (
    <>
      {today && (
        <div className="ui-card" style={{ padding: '12px 16px', marginBottom: 'var(--gap)' }}>
          <div className="row gap-16" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>今日新增</span>
            {([['用户', today.users], ['动态', today.posts], ['评论', today.comments], ['举报', today.reports]] as [string, number][]).map(([l, n]) => (
              <span key={l} className="row gap-4" style={{ fontSize: 13, alignItems: 'baseline' }}>
                <span className="muted">{l}</span>
                <b className="num" style={{ fontSize: 15, color: l === '举报' && n > 0 ? 'var(--like)' : 'var(--ink)' }}>+{fmtNum(n)}</b>
              </span>
            ))}
            {data.recharge && (
              <span className="row gap-4" style={{ fontSize: 13, alignItems: 'baseline', marginLeft: 'auto' }}>
                <span className="muted">今日充值</span>
                <b className="num" style={{ fontSize: 15, color: 'var(--good)' }}>¥{data.recharge.todayAmount}</b>
                <span className="faint" style={{ fontSize: 12 }}>· 累计 ¥{data.recharge.paidAmount}</span>
              </span>
            )}
          </div>
        </div>
      )}
      <div className="stat-grid">
        {cards.map(([k, v, ic, c, target]) => {
          const clickable = !!target && !!onNav;
          const go = () => clickable && onNav!(target!);
          return (
          <div className={`ui-card stat-card${clickable ? ' stat-card-link' : ''}`} key={k} style={{ padding: 16 }}
            {...(clickable ? { role: 'button', tabIndex: 0, title: `查看${k}`, onClick: go, onKeyDown: (e: any) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } } } : {})}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 12.5 }}>{k}{clickable ? <span className="stat-go"> ›</span> : ''}</span>
              <span className="stat-ic" style={{ background: `color-mix(in srgb, ${c} 13%, transparent)`, color: c }}>
                <Icon name={ic} size={15} />
              </span>
            </div>
            {/* 后台仪表盘显示精确计数（带千分位），不做 1k/1w 缩写——运营要准数 */}
            <div className="num" style={{ fontWeight: 700, marginTop: 8 }}>{(v ?? 0).toLocaleString()}</div>
          </div>
        ); })}
      </div>
      {data.activity?.length > 0 && (() => {
        const max = Math.max(1, ...data.activity.map((d: any) => Math.max(d.posts, d.comments, d.users || 0)));
        return (
          <div className="ui-card" style={{ marginTop: 'var(--gap)', padding: 18 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ fontSize: 15 }}>近 7 天活跃度</h2>
              <div className="row gap-12" style={{ fontSize: 12 }}>
                <span className="row gap-4"><i style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--brand)' }} /> 动态</span>
                <span className="row gap-4"><i style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--good)' }} /> 评论</span>
                <span className="row gap-4"><i style={{ width: 9, height: 9, borderRadius: 3, background: 'var(--coral)' }} /> 新增用户</span>
              </div>
            </div>
            <div className="chart">
              {data.activity.map((d: any) => (
                <div className="chart-col" key={d.date} title={`${d.date} · 动态${d.posts} · 评论${d.comments} · 新增用户${d.users || 0}`}>
                  <div className="chart-bars">
                    <div className="chart-bar" style={{ height: `${(d.posts / max) * 100}%`, background: 'var(--brand)' }} />
                    <div className="chart-bar" style={{ height: `${(d.comments / max) * 100}%`, background: 'var(--good)' }} />
                    <div className="chart-bar" style={{ height: `${((d.users || 0) / max) * 100}%`, background: 'var(--coral)' }} />
                  </div>
                  <div className="chart-label">{d.date.slice(5)}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="ui-card" style={{ marginTop: 'var(--gap)', overflow: 'hidden' }}>
        <div className="section-head" style={{ paddingBottom: 12 }}><h2 style={{ fontSize: 15 }}>最新注册</h2></div>
        {data.recentUsers.map((u: any, i: number) => (
          <div key={u.id}>{i > 0 && <div className="divider" />}
            <div className="row gap-12" style={{ padding: '12px 18px' }}>
              <Avatar user={u} size={38} showV />
              <div className="grow"><Link to={`/u/${u.username}`} className="uname">{u.nickname}</Link> <Badges user={u} /></div>
              <span className="faint" style={{ fontSize: 12 }}>{timeAgo(u.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>

      {data.invites && (
        <div className="ui-card" style={{ marginTop: 'var(--gap)', overflow: 'hidden' }}>
          <div className="section-head" style={{ paddingBottom: 12 }}>
            <h2 style={{ fontSize: 15 }}>邀请概况</h2>
            <span className="faint" style={{ fontSize: 12.5 }}>累计被邀请 <b className="num" style={{ color: 'var(--ink)' }}>{fmtNum(data.invites.total)}</b> 人</span>
          </div>
          {(!data.invites.top || data.invites.top.length === 0) ? <Empty text="还没有邀请记录" /> : data.invites.top.map((t: any, i: number) => (
            <div key={t.user?.id ?? i}>{i > 0 && <div className="divider" />}
              <div className="row gap-12" style={{ padding: '12px 18px', alignItems: 'center' }}>
                <span className="num" style={{ width: 22, textAlign: 'center', fontWeight: 700, color: i < 3 ? 'var(--brand)' : 'var(--ink-3)' }}>{i + 1}</span>
                <Avatar user={t.user} size={32} showV />
                <div className="grow" style={{ minWidth: 0 }}><Link to={`/u/${t.user?.username}`} className="uname">{t.user?.nickname}</Link></div>
                <span className="num" style={{ fontSize: 13, color: 'var(--ink-2)' }}>邀请 {fmtNum(t.count)} 人</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// 专栏文章后台：精选 / 取消精选 / 删除（前台 /articles 展示，精选进首页编辑精选位）。
function ArticlesAdmin() {
  const toast = useToast();
  const [list, setList] = useState<any[] | null>(null);
  const [q, setQ] = useState('');
  const load = (query = q) => api.get('/articles', { params: { limit: 40, q: query || undefined } }).then(({ data }) => {
    const seen = new Set<number>(); const out: any[] = [];
    for (const a of [data.featured, ...(data.articles || [])]) { if (a && !seen.has(a.id)) { seen.add(a.id); out.push(a); } }
    setList(out);
  }).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const feature = async (a: any, on: boolean) => {
    try { await api.post(`/articles/${a.id}/feature`, { featured: on }); toast.ok(on ? '已设为精选' : '已取消精选'); load(); } catch (e: any) { toast.err(e.message); }
  };
  const del = async (a: any) => {
    if (!(await confirmDialog('删除这篇文章？'))) return;
    try { await api.delete(`/articles/${a.id}`); toast.ok('已删除'); load(); } catch (e: any) { toast.err(e.message); }
  };
  if (list === null) return <RowSkeleton rows={6} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="ui-card" style={{ padding: 14 }}>
        <div className="row gap-8">
          <AdminSearch value={q} onChange={setQ} onSearch={() => load(q)} placeholder="搜索文章标题…" />
        </div>
      </div>
      <div className="ui-card" style={{ padding: 0, overflow: 'hidden' }}>
      <ListHead title="专栏文章" count={list.length} />
      {list.length === 0 ? <Empty text={q.trim() ? '没有匹配的文章' : '还没有文章'} /> : list.map((a, i) => (
        <div key={a.id}>
          {i > 0 && <div className="divider" />}
          <div className="row gap-12" style={{ padding: '12px 18px', alignItems: 'flex-start' }}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row gap-6" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                {a.featured && <span className="ui-badge" style={{ background: 'var(--brand-soft)', color: 'var(--brand-strong)' }}>精选</span>}
                <span className="ui-badge">{a.category}</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{a.title}</span>
              </div>
              <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>{a.author?.nickname} · {fmtNum(a.views)} 阅读 · {fmtNum(a.likeCount)} 赞</div>
            </div>
            <Button size="sm" variant="flat" className="haha-btn-app" onClick={() => feature(a, !a.featured)}>{a.featured ? '取消精选' : '设精选'}</Button>
            <Button size="sm" variant="flat" className="haha-btn-app danger" onClick={() => del(a)}><Icon name="trash" size={14} style={{ width: 14, height: 14 }} /> 删除</Button>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}

// 社区活动后台：查看 + 删除（活动由用户发起，管理员可下架）。
function EventsAdmin() {
  const toast = useToast();
  const [list, setList] = useState<any[] | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [q, setQ] = useState('');
  const load = (query = q) => api.get('/events', { params: { q: query || undefined } }).then(({ data }) => setList(data.events)).catch(() => setList([]));
  useEffect(() => { load(); api.get('/events/admin/stats').then(({ data }) => setStats(data)).catch(() => {}); }, []);
  const del = async (e: any) => {
    if (!(await confirmDialog('删除这个活动？'))) return;
    try { await api.delete(`/events/${e.id}`); toast.ok('已删除'); load(); } catch (err: any) { toast.err(err.message); }
  };
  if (list === null) return <RowSkeleton rows={6} />;
  const STAT_CARDS: [string, any][] = stats ? [
    ['活动总数', (stats.total ?? 0).toLocaleString()], ['未结束', (stats.active ?? 0).toLocaleString()],
    ['已结束', (stats.ended ?? 0).toLocaleString()], ['总报名', (stats.totalSignups ?? 0).toLocaleString()],
  ] : [];
  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          {STAT_CARDS.map(([k, v]) => (
            <div className="ui-card stat-card" key={k} style={{ padding: 16 }}>
              <span className="muted" style={{ fontSize: 12.5 }}>{k}</span>
              <div className="num" style={{ fontWeight: 700, marginTop: 8, fontSize: 22 }}>{v}</div>
            </div>
          ))}
        </div>
      )}
      <div className="ui-card" style={{ padding: 14 }}>
        <div className="row gap-8">
          <AdminSearch value={q} onChange={setQ} onSearch={() => load(q)} placeholder="搜索活动标题（含已结束）…" />
        </div>
      </div>
      <div className="ui-card" style={{ padding: 0, overflow: 'hidden' }}>
      <ListHead title="社区活动" count={list.length} />
      {list.length === 0 ? <Empty text={q.trim() ? '没有匹配的活动' : '还没有活动'} /> : list.map((e, i) => (
        <div key={e.id}>
          {i > 0 && <div className="divider" />}
          <div className="row gap-12" style={{ padding: '12px 18px', alignItems: 'flex-start' }}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row gap-6" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="ui-badge">{e.category}</span>
                {e.online ? <span className="ui-badge" style={{ background: 'var(--brand-soft)', color: 'var(--brand-strong)' }}>线上</span> : null}
                <span style={{ fontWeight: 600, fontSize: 14 }}>{e.title}</span>
              </div>
              <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>{e.organizer?.nickname} · {(e.startAt || '').slice(0, 16)} · 报名 {e.signupCount}{e.capacity > 0 ? `/${e.capacity}` : ''}</div>
            </div>
            <Button size="sm" variant="flat" className="haha-btn-app danger" onClick={() => del(e)}><Icon name="trash" size={14} style={{ width: 14, height: 14 }} /> 删除</Button>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}

// 圈子后台：查看 + 解散（圈子由用户创建，管理员可解散；解散删成员/聊天，圈内动态保留）。
function CirclesAdmin() {
  const toast = useToast();
  const [list, setList] = useState<any[] | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [q, setQ] = useState('');
  const load = (query = q) => api.get('/circles', { params: { q: query || undefined } }).then(({ data }) => setList(data.circles)).catch(() => setList([]));
  useEffect(() => { load(); api.get('/circles/admin/stats').then(({ data }) => setStats(data)).catch(() => {}); }, []);
  const del = async (c: any) => {
    if (!(await confirmDialog(`解散圈子「${c.name}」？成员与聊天记录会一并删除，圈内动态保留。`))) return;
    try { await api.delete(`/circles/${c.id}`); toast.ok('已解散'); load(); } catch (e: any) { toast.err(e.message); }
  };
  if (list === null) return <RowSkeleton rows={6} />;
  const STAT_CARDS: [string, any][] = stats ? [
    ['圈子总数', (stats.totalCircles ?? 0).toLocaleString()], ['成员总数', (stats.totalMembers ?? 0).toLocaleString()], ['圈内动态', (stats.totalPosts ?? 0).toLocaleString()],
  ] : [];
  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          {STAT_CARDS.map(([k, v]) => (
            <div className="ui-card stat-card" key={k} style={{ padding: 16 }}>
              <span className="muted" style={{ fontSize: 12.5 }}>{k}</span>
              <div className="num" style={{ fontWeight: 700, marginTop: 8, fontSize: 22 }}>{v}</div>
            </div>
          ))}
        </div>
      )}
      <div className="ui-card" style={{ padding: 14 }}>
        <div className="row gap-8">
          <AdminSearch value={q} onChange={setQ} onSearch={() => load(q)} placeholder="搜索圈子名称…" />
        </div>
      </div>
      <div className="ui-card" style={{ padding: 0, overflow: 'hidden' }}>
      <ListHead title="圈子" count={list.length} />
      {list.length === 0 ? <Empty text={q.trim() ? '没有匹配的圈子' : '还没有圈子'} /> : list.map((c, i) => (
        <div key={c.id}>
          {i > 0 && <div className="divider" />}
          <div className="row gap-12" style={{ padding: '12px 18px', alignItems: 'flex-start' }}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row gap-6" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="ui-badge">{c.category}</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</span>
              </div>
              <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>{c.owner?.nickname} · {fmtNum(c.memberCount)} 成员 · {fmtNum(c.postCount)} 动态</div>
            </div>
            <Button size="sm" variant="flat" className="haha-btn-app danger" onClick={() => del(c)}><Icon name="trash" size={14} style={{ width: 14, height: 14 }} /> 解散</Button>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}

// 问答后台：查看 + 删除（删问题连同回答与投票）。
function QAAdmin() {
  const toast = useToast();
  const [list, setList] = useState<any[] | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [q, setQ] = useState('');
  const load = (query = q) => api.get('/qa', { params: { q: query || undefined } }).then(({ data }) => setList(data.questions)).catch(() => setList([]));
  useEffect(() => { load(); api.get('/qa/admin/stats').then(({ data }) => setStats(data)).catch(() => {}); }, []);
  const del = async (item: any) => {
    if (!(await confirmDialog('删除该问题及其全部回答？'))) return;
    try { await api.delete(`/qa/${item.id}`); toast.ok('已删除'); load(); } catch (e: any) { toast.err(e.message); }
  };
  if (list === null) return <RowSkeleton rows={6} />;
  const STAT_CARDS: [string, any][] = stats ? [
    ['总问题', (stats.total || 0).toLocaleString()], ['待解决', (stats.open || 0).toLocaleString()], ['已解决', (stats.solved || 0).toLocaleString()],
    ['总回答', (stats.totalAnswers || 0).toLocaleString()], ['悬赏中积分', (stats.openBounty || 0).toLocaleString()],
  ] : [];
  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          {STAT_CARDS.map(([k, v]) => (
            <div className="ui-card stat-card" key={k} style={{ padding: 16 }}>
              <span className="muted" style={{ fontSize: 12.5 }}>{k}</span>
              <div className="num" style={{ fontWeight: 700, marginTop: 8, fontSize: 22 }}>{v}</div>
            </div>
          ))}
        </div>
      )}
      <div className="ui-card" style={{ padding: 14 }}>
        <div className="row gap-8">
          <AdminSearch value={q} onChange={setQ} onSearch={() => load(q)} placeholder="搜索问题标题…" />
        </div>
      </div>
      <div className="ui-card" style={{ padding: 0, overflow: 'hidden' }}>
      <ListHead title="问答" count={list.length} />
      {list.length === 0 ? <Empty text={q.trim() ? '没有匹配的问题' : '还没有问题'} /> : list.map((q, i) => (
        <div key={q.id}>
          {i > 0 && <div className="divider" />}
          <div className="row gap-12" style={{ padding: '12px 18px', alignItems: 'flex-start' }}>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row gap-6" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                {q.bounty > 0 ? <span className="ui-badge" style={{ background: 'var(--gold-soft)', color: 'var(--gold-deep)' }}>悬赏 {q.bounty}</span> : null}
                {q.bestAnswerId ? <span className="ui-badge" style={{ background: 'var(--brand-soft)', color: 'var(--brand-strong)' }}>已采纳</span> : null}
                <span className="ui-badge">{q.category}</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{q.title}</span>
              </div>
              <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>{q.author?.nickname} · {fmtNum(q.answerCount)} 回答 · {fmtNum(q.viewCount)} 浏览</div>
            </div>
            <Button size="sm" variant="flat" className="haha-btn-app danger" onClick={() => del(q)}><Icon name="trash" size={14} style={{ width: 14, height: 14 }} /> 删除</Button>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}

function AdminLogin() {
  const { login } = useAuth();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e: any) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const usr = await login(u.trim(), p);
      if (usr.role !== 'admin') setErr('该账号不是管理员，无法进入后台');
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="admin-center">
      <form className="admin-login-card" onSubmit={submit}>
        <span className="admin-logo lg"><Icon name="shield" size={26} /></span>
        <div style={{ fontWeight: 800, fontSize: 19, marginTop: 12 }}>HahaSNS 管理后台</div>
        <div className="muted" style={{ fontSize: 13, marginTop: 4, marginBottom: 18 }}>请使用管理员账号登录</div>
        {err && <div className="form-err">{err}</div>}
        <Input className="haha-inp" placeholder="管理员用户名" value={u} onChange={(e: any) => setU(e.target.value)} autoFocus />
        <Input className="haha-inp" type="password" placeholder="密码" value={p} onChange={(e: any) => setP(e.target.value)} style={{ marginTop: 10 }} />
        <Button type="submit" size="lg" color="primary" fullWidth className="haha-btn-app" isDisabled={busy} style={{ marginTop: 14, fontWeight: 700 }}>
          {busy ? '登录中…' : '登录'}
        </Button>
        <Link to="/" className="faint" style={{ fontSize: 12.5, marginTop: 16, display: 'inline-block' }}>← 返回前台</Link>
      </form>
    </div>
  );
}

export default function Admin() {
  const { user, loading, logout } = useAuth();
  const { name: siteName } = useSite();
  const navigate = useNavigate();
  const location = useLocation();
  // tab 以 URL 为准（/admin/<tab>）→ 可深链 + 浏览器前进/后退；非法 tab 回退 overview
  const rawTab = location.pathname.replace(/^\/admin\/?/, '').split('/')[0];
  const tab = TAB_BY_K[rawTab] ? rawTab : 'overview';
  const setTab = (k: string) => navigate('/admin/' + k);
  // 后台独立的浅/深主题（与前台主题互不影响），持久化到 localStorage。design.md 深色变体。
  const [adminTheme, setAdminTheme] = useState<string>(() => {
    try { return localStorage.getItem('haha_admin_theme') || 'light'; } catch { return 'light'; }
  });
  const toggleTheme = () => setAdminTheme((t) => {
    const n = t === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('haha_admin_theme', n); } catch { /* ignore */ }
    return n;
  });

  // 移动端横向 nav：切 tab 后把选中项滚动到可见（block:nearest 避免带动整页竖滚）。桌面竖向侧栏同样受益。
  useEffect(() => {
    document.querySelector('.admin-nav-item.active')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [tab]);

  if (loading) return <div className="admin-center"><Loading /></div>;
  if (!user) return <AdminLogin />;
  if (user.role !== 'admin')
    return (
      <div className="admin-center">
        <div className="ui-card" style={{ padding: 40, textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: 42 }}>🛡️</div>
          <div style={{ fontWeight: 800, fontSize: 18, marginTop: 10 }}>需要管理员权限</div>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>该后台仅对管理员开放</div>
          <Link to="/" className="haha-btn-app haha-btn-app--primary haha-btn-app--lg" style={{ marginTop: 18 }}>返回前台首页</Link>
        </div>
      </div>
    );

  const current = TABS.find((t) => t.k === tab) || TABS[0];
  return (
    <>
    <div className="admin-shell" data-admin-theme={adminTheme}>
      <aside className="admin-side">
        <div className="admin-brand">
          <span className="admin-logo"><Icon name="shield" size={18} /></span>
          <div className="admin-brand-txt"><b>{siteName}</b><span>管理后台</span></div>
        </div>
        <nav className="admin-nav">
          {NAV_GROUPS.map((grp) => (
            <Fragment key={grp.l}>
              <div className="admin-nav-group-head">{grp.l}</div>
              {grp.keys.map((k) => {
                const t = TAB_BY_K[k];
                return t ? (
                  <button key={k} className={`admin-nav-item${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>
                    <Icon name={t.icon} size={18} /> {t.l}
                  </button>
                ) : null;
              })}
            </Fragment>
          ))}
        </nav>
        <div className="admin-side-foot">
          <Link to="/" className="admin-nav-item"><Icon name="back" size={18} /> 返回前台</Link>
          <button className="admin-nav-item danger" onClick={logout}><Icon name="logout" size={18} /> 退出登录</button>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-top">
          <div className="admin-top-head">
            <span className="admin-crumb">管理后台 <span className="admin-crumb-sep">/</span> {GROUP_OF[tab] || '概览'}</span>
            <h1><Icon name={current.icon} size={17} /> {current.l}</h1>
            {current.d && <span className="admin-top-sub">{current.d}</span>}
          </div>
          <div className="row gap-8" style={{ alignItems: 'center' }}>
            <button className="admin-theme-btn" onClick={toggleTheme} title={adminTheme === 'dark' ? '切换浅色后台' : '切换深色后台'} aria-label="切换后台主题"><Icon name={adminTheme === 'dark' ? 'sun' : 'moon'} size={17} /></button>
            <Avatar user={user} size={34} showV /><span style={{ fontWeight: 600 }}>{user.nickname}</span>
          </div>
        </header>
        <div className="admin-content">
          {tab === 'overview' && <Overview onNav={setTab} />}
          {tab === 'users' && <UsersPanel />}
          {tab === 'boards' && <BoardsPanel />}
          {tab === 'topics' && <TopicsPanel />}
          {tab === 'reports' && <ReportsPanel />}
          {tab === 'notices' && <NoticesPanel />}
          {tab === 'flash' && <FlashPanel />}
          {tab === 'nav' && <NavPanel />}
          {tab === 'articles' && <ArticlesAdmin />}
          {tab === 'events' && <EventsAdmin />}
          {tab === 'circles' && <CirclesAdmin />}
          {tab === 'qa' && <QAAdmin />}
          {tab === 'payment' && <PaymentPanel />}
          {tab === 'lottery' && <LotteryPanel />}
          {tab === 'checkin' && <CheckinPanel />}
          {tab === 'mall' && <MallPanel />}
          {tab === 'security' && <SecurityPanel />}
          {tab === 'modules' && <ModulesPanel />}
          {tab === 'layout' && <LayoutPanel />}
          {tab === 'appearance' && <AppearancePanel />}
          {tab === 'pages' && <PagesPanel />}
          {tab === 'storage' && <StoragePanel />}
          {tab === 'audit' && <AuditLog />}
          {tab === 'system' && <SystemPanel />}
        </div>
      </main>
    </div>
    </>
  );
}
