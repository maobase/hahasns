import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Avatar from '../../components/Avatar';
import Icon from '../../components/Icon';
import { Badges } from '../../components/Identity';
import { Empty } from '../../components/States';
import api from '../../api/client';
import { fmtNum, timeAgo } from '../../lib/format';

// 概览仪表盘：站点数据总览卡 / 今日动态 / 近 7 天活跃度 / 最新注册 / 邀请概况。
// 第 10 刀自 Admin.tsx 整体抽离：onNav 跳转回调仍由壳传入（点击统计卡跳对应管理 tab），实现逐字不变。
export default function OverviewPanel({ onNav }: { onNav?: (tab: string) => void }) {
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
