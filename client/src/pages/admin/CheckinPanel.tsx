import { useState, useEffect } from 'react';
import Avatar from '../../components/Avatar';
import { Empty, RowSkeleton } from '../../components/States';
import { Button } from '../../components/heroui';
import { useToast } from '../../context/ToastContext';
import api from '../../api/client';
import { ListHead } from './ui';

// 签到后台配置 (③)：基础分 / 连签加成上限 / 补签成本，落库 site_config，签到中心与签到发放实时生效。
// 签到统计：今日签到 / 累计签到 / 参与人数 + 连签榜（运营观察签到活跃度）。
function CheckinStats() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api.get('/checkin/admin/stats').then(({ data }) => setData(data)).catch(() => setData({ stats: {}, topStreakers: [] })); }, []);
  if (data === null) return <RowSkeleton rows={3} />;
  const s = data.stats || {};
  const top = data.topStreakers || [];
  const CARDS: [string, string][] = [
    ['今日签到', (s.todayCount || 0).toLocaleString()], ['累计签到', (s.totalCheckins || 0).toLocaleString()], ['参与人数', (s.participants || 0).toLocaleString()],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {CARDS.map(([k, v]) => (
          <div className="ui-card stat-card" key={k} style={{ padding: 16 }}>
            <span className="muted" style={{ fontSize: 12.5 }}>{k}</span>
            <div className="num" style={{ fontWeight: 700, marginTop: 8, fontSize: 22 }}>{v}</div>
          </div>
        ))}
      </div>
      <div className="ui-card" style={{ padding: 0, overflow: 'hidden' }}>
        <ListHead title="连签榜" count={top.length} />
        {top.length === 0 ? <Empty text="还没有人签到" /> : top.map((t: any, i: number) => (
          <div key={t.user?.id ?? i}>
            {i > 0 && <div className="divider" />}
            <div className="row gap-12" style={{ padding: '12px 18px', alignItems: 'center' }}>
              <span className="num" style={{ width: 22, textAlign: 'center', fontWeight: 700, color: i < 3 ? 'var(--brand)' : 'var(--ink-3)' }}>{i + 1}</span>
              <Avatar user={t.user} size={32} showV />
              <div className="grow" style={{ minWidth: 0 }}><b style={{ fontSize: 14 }}>{t.user?.nickname || '—'}</b></div>
              <span className="num" style={{ fontSize: 13, color: 'var(--ink-2)' }}>连签 {t.streak} 天</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CheckinPanel() {
  const toast = useToast();
  const [cfg, setCfg] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get('/admin/config').then(({ data }) => setCfg(data.config)).catch(() => setCfg({})); }, []);
  const setK = (k: string, v: string) => setCfg((c) => ({ ...(c || {}), [k]: v }));
  const numOr = (k: string, def: number) => { const v = cfg?.[k]; return v === undefined || v === '' ? def : Number(v); };
  const save = async () => {
    setSaving(true);
    try { await api.put('/admin/config', { config: cfg }); toast.ok('签到配置已保存'); }
    catch (e: any) { toast.err(e.message); }
    finally { setSaving(false); }
  };
  if (cfg === null) return <RowSkeleton rows={4} />;
  const base = numOr('checkin_base_points', 5);
  const cap = numOr('checkin_streak_cap', 7);
  const FIELDS: [string, string, string, number][] = [
    ['checkin_base_points', '每日基础积分', '分', 5],
    ['checkin_streak_cap', '连签加成上限', '天', 7],
    ['checkin_makeup_cost', '补签成本', '积分', 20],
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>签到奖励配置</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>每日签到积分 = 基础分 + min(连签天数, 加成上限)，再按会员等级加成（VIP1 ×1.2 / VIP2 ×1.5 / VIP3 ×2）。补签成本为找回某天签到所需积分（不计入连签）。</div>
        <div className="sec-grid">
          {FIELDS.map(([k, label, unit, def]) => (
            <label className="sec-field" key={k}>
              <span className="sec-label">{label}</span>
              <span className="sec-num">
                <input type="number" min={0} value={cfg[k] ?? ''} placeholder={String(def)} onChange={(e) => setK(k, e.target.value)} />
                <i>{unit}</i>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>内容奖励配置</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>各类内容创作与互动给作者 / 参与者的经验与积分奖励（设 0 = 关闭该项）。点赞等高频互动为固定值不在此列。</div>
        <div className="sec-grid">
          {([
            ['reward_post_exp', '发动态经验', '经验', 5], ['reward_post_points', '发动态积分', '积分', 2],
            ['reward_comment_exp', '评论经验', '经验', 2], ['reward_comment_points', '评论积分', '积分', 1],
            ['reward_thread_exp', '发论坛帖经验', '经验', 8], ['reward_thread_points', '发论坛帖积分', '积分', 5],
            ['reward_article_exp', '发文章经验', '经验', 12], ['reward_article_points', '发文章积分', '积分', 0],
            ['reward_question_exp', '提问经验', '经验', 5], ['reward_question_points', '提问积分', '积分', 0],
            ['reward_answer_exp', '回答经验', '经验', 4], ['reward_answer_points', '回答积分', '积分', 1],
            ['reward_answer_accepted_exp', '回答被采纳经验', '经验', 10], ['reward_answer_accepted_points', '回答被采纳积分', '积分', 0],
            ['reward_event_exp', '发活动经验', '经验', 10], ['reward_event_points', '发活动积分', '积分', 0],
            ['reward_invite_exp', '邀请注册经验', '经验', 10], ['reward_invite_points', '邀请注册积分', '积分', 50],
          ] as [string, string, string, number][]).map(([k, label, unit, def]) => (
            <label className="sec-field" key={k}>
              <span className="sec-label">{label}</span>
              <span className="sec-num">
                <input type="number" min={0} value={cfg[k] ?? ''} placeholder={String(def)} onChange={(e) => setK(k, e.target.value)} />
                <i>{unit}</i>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>VIP 签到积分加成</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>各 VIP 等级的签到积分加成百分比（默认 VIP1 +20% / VIP2 +50% / VIP3 +100%）。设 0 = 该等级无加成。</div>
        <div className="sec-grid">
          {([['vip1_bonus_pct', 'VIP1 加成', '%', 20], ['vip2_bonus_pct', 'VIP2 加成', '%', 50], ['vip3_bonus_pct', 'VIP3 加成', '%', 100]] as [string, string, string, number][]).map(([k, label, unit, def]) => (
            <label className="sec-field" key={k}>
              <span className="sec-label">{label}</span>
              <span className="sec-num">
                <input type="number" min={0} value={cfg[k] ?? ''} placeholder={String(def)} onChange={(e) => setK(k, e.target.value)} />
                <i>{unit}</i>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>等级曲线</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>升到第 L 级所需累计经验 = 系数 × (L−1)^1.7。系数越大升级越慢；可设最高等级上限。改动约 1 分钟内全站生效。</div>
        <div className="sec-grid">
          {([['level_base', '经验系数', '', 30], ['level_max', '最高等级', '级', 60]] as [string, string, string, number][]).map(([k, label, unit, def]) => (
            <label className="sec-field" key={k}>
              <span className="sec-label">{label}</span>
              <span className="sec-num">
                <input type="number" min={1} value={cfg[k] ?? ''} placeholder={String(def)} onChange={(e) => setK(k, e.target.value)} />
                {unit ? <i>{unit}</i> : null}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>每日任务奖励</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>每日任务完成后可领取的积分奖励（设 0 = 该任务无奖励）。</div>
        <div className="sec-grid">
          {([['task_checkin_points', '签到', 5], ['task_post_points', '发帖', 10], ['task_comment_points', '评论', 6], ['task_like_points', '点赞', 4], ['task_vote_points', '投票', 3], ['task_profile_points', '完善资料', 20]] as [string, string, number][]).map(([k, label, def]) => (
            <label className="sec-field" key={k}>
              <span className="sec-label">{label}</span>
              <span className="sec-num"><input type="number" min={0} value={cfg[k] ?? ''} placeholder={String(def)} onChange={(e) => setK(k, e.target.value)} /><i>积分</i></span>
            </label>
          ))}
        </div>
      </div>

      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>成就徽章阈值</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.5 }}>解锁「累计」类徽章所需的门槛；徽章说明会随之更新。（里程碑/会员型徽章为固定条件，不在此调。）</div>
        <div className="sec-grid">
          {([['badge_writer_threshold', '笔耕不辍 · 发帖', 20, '条'], ['badge_voter_threshold', '热心参与 · 投票', 10, '次'], ['badge_checkin7_threshold', '签到坚持 · 连续', 7, '天'], ['badge_social_threshold', '社交达人 · 粉丝', 50, '人'], ['badge_popular_threshold', '人气作者 · 获赞', 200, '个']] as [string, string, number, string][]).map(([k, label, def, unit]) => (
            <label className="sec-field" key={k}>
              <span className="sec-label">{label}</span>
              <span className="sec-num"><input type="number" min={1} value={cfg[k] ?? ''} placeholder={String(def)} onChange={(e) => setK(k, e.target.value)} /><i>{unit}</i></span>
            </label>
          ))}
        </div>
      </div>

      <div className="ui-card" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>7 日奖励预览</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 3, marginBottom: 12, lineHeight: 1.5 }}>按当前配置，连续签到第 1–7 天的基础积分（未含会员加成）。</div>
        <div className="row gap-8" style={{ flexWrap: 'wrap' }}>
          {Array.from({ length: 7 }, (_, i) => {
            const day = i + 1;
            const pts = base + Math.min(day, cap);
            return (
              <div key={day} className="ui-card" style={{ padding: '10px 14px', textAlign: 'center', minWidth: 64, boxShadow: 'none' }}>
                <div className="faint" style={{ fontSize: 12 }}>第{day}天</div>
                <div className="num" style={{ fontWeight: 700, fontSize: 18, marginTop: 2 }}>+{pts}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button color="primary" className="haha-btn-app" isDisabled={saving} onClick={save}>{saving ? '保存中…' : '保存配置'}</Button>
      </div>
      <div className="sec-head" style={{ marginTop: 6 }}>签到统计</div>
      <CheckinStats />
    </div>
  );
}
