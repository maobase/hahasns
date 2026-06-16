import { useState, useEffect } from 'react';
import { Card, CardBody, CardHeader, Chip, Tabs, Tab, Textarea, Button } from '../components/heroui';
import Shell from '../components/Shell';
import Avatar from '../components/Avatar';
import Icon from '../components/Icon';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { timeAgo } from '../lib/format';

const TYPE = {
  new: { label: '新增', color: 'success' },
  improve: { label: '优化', color: 'primary' },
  fix: { label: '修复', color: 'warning' },
};
const FB_STATUS = {
  open: { label: '待处理', color: 'default' },
  planned: { label: '已采纳', color: 'secondary' },
  doing: { label: '处理中', color: 'warning' },
  resolved: { label: '已解决', color: 'success' },
  closed: { label: '已关闭', color: 'default' },
};

const RELEASES = [
  {
    ver: 'v2.3', date: '2026-06-16 14:33:16', items: [
      ['improve', '个人设置表单全面改用 HeroUI 组件（输入框 / 选择器 / 按钮），更精致统一'],
      ['improve', '发布框、私信等处的输入框统一为同一套描边 + 聚焦光圈样式'],
      ['new', 'README 拆分中英双语（默认英文，附简体中文版）'],
    ],
  },
  {
    ver: 'v2.2', date: '2026-06-16 14:10:43', items: [
      ['improve', '统一全站输入框样式：清爽描边 + 品牌色聚焦光圈，表单、评论、私信等输入视觉一致'],
      ['improve', '私信空状态、个人设置等处的 emoji 占位换成 SVG，细节更精致'],
      ['new', '补充项目架构文档与架构图，开源资料更完整'],
    ],
  },
  {
    ver: 'v2.1', date: '2026-06-16 13:53:52', items: [
      ['improve', '会员中心积分/余额、签到打卡换成 SVG 图标；付费/加密动态、转发媒体占位、打赏弹窗图标全部 SVG 化'],
      ['improve', '设置页「账号安全」「黑名单」等小标题统一为 SVG 图标，全站持续去除 emoji 占位'],
      ['new', '梳理产品功能版图，规划支付变现、群聊、活动等后续模块（详见开发计划）'],
    ],
  },
  {
    ver: 'v2.0', date: '2026-06-16 13:44:34', items: [
      ['improve', '积分商城商品图标换成分类配色的 SVG 徽标（道具/头衔/头像框/实物各有主色），告别 emoji'],
      ['improve', '论坛板块图标全部 SVG 化：综合/技术/兴趣/二手等各板块专属图标与配色，列表与详情统一'],
      ['improve', '继续清理全站 emoji 占位图标，整体观感更精致、去 AI 味'],
    ],
  },
  {
    ver: 'v1.9', date: '2026-06-16 13:34:14', items: [
      ['new', '完善开源文档：README + 安装 / 部署 / API / 配置 / 贡献指南，项目即将开源'],
      ['fix', '加固演示账号安全：种子密码改为可配置（SEED_PASSWORD），不再硬编码到源码与文档'],
      ['improve', 'API 文档覆盖全部 19 个模块约 95 个接口，含圈子 / 投票 / 问答 / 快报 / 导航 / 任务'],
    ],
  },
  {
    ver: 'v1.8', date: '2026-06-16 13:17:07', items: [
      ['new', '全站页面切换加入丝滑转场动效（淡入+微上移），尊重「减少动态效果」系统偏好'],
      ['improve', '通知图标全部换成精致 SVG（赞/关注/评论/采纳…），告别 emoji 占位，去除 AI 味'],
      ['improve', '补全圈子/问答/快报/导航/任务等新页面的浏览器标签标题'],
    ],
  },
  {
    ver: 'v1.7', date: '2026-06-16 13:01:43', items: [
      ['improve', '统一全站页面宽度：所有页面的内容主栏保持一致宽度，切换页面不再左右跳动'],
      ['improve', '资讯快报 / 任务中心 / 问答详情页补齐右侧栏，与其它模块版式统一'],
      ['fix', '更新日志每个版本精确到秒记录发布时间'],
    ],
  },
  {
    ver: 'v1.6', date: '2026-06-16 12:30:09', items: [
      ['new', '网址导航上线：开发者 / 设计 / 学习 / 效率 / AI / 灵感 六大类，精选好站一处直达'],
      ['new', '分类锚点快速跳转，侧栏「热门导航」按点击热度排行'],
      ['improve', '导航卡片用站点品牌色字母标识（非 emoji），真实站点与简介，light / dark 双模式适配'],
    ],
  },
  {
    ver: 'v1.5', date: '2026-06-16 11:18:52', items: [
      ['new', '任务中心上线：每日签到 / 发动态 / 评论 / 点赞 / 投票等任务，完成领积分'],
      ['new', '成就勋章墙：发帖、人气、签到、采纳、建圈等里程碑自动点亮青铜/白银/黄金勋章'],
      ['improve', '会员中心与左侧栏新增「任务」入口，进度实时统计，light / dark 双模式适配'],
    ],
  },
  {
    ver: 'v1.4', date: '2026-06-16 09:47:18', items: [
      ['new', '问答 · 悬赏求助上线：提问可设积分悬赏，回答被采纳即得赏金，托管转账全自动'],
      ['new', '回答支持赞同排序、提问者一键采纳，最佳答案高亮置顶'],
      ['improve', '问答列表支持按状态（待解决/已解决）与分类筛选，侧栏新增「悬赏求助」榜'],
    ],
  },
  {
    ver: 'v1.3', date: '2026-06-16 08:10:33', items: [
      ['new', '投票上线：发动态时可发起单选 / 多选投票，支持截止时间，实时看票数与占比'],
      ['new', '投票结果用进度条直观展示，你的选项高亮标记，参与人数一目了然'],
      ['improve', '发布框新增「投票」入口，选项可增删（2–6 项），light / dark 双模式都细调过'],
    ],
  },
  {
    ver: 'v1.2', date: '2026-06-16 06:22:41', items: [
      ['new', '圈子上线：兴趣社群可创建 / 加入，圈内发动态、看专属信息流，圈主管理'],
      ['new', '发布框支持「发到圈子」，侧栏新增「推荐圈子」入口'],
      ['improve', '圈子封面、图标与主题色自定义，6 套配色 × 明暗模式下都细调过对比度'],
    ],
  },
  {
    ver: 'v1.1', date: '2026-06-16 04:05:20', items: [
      ['new', '资讯快报门户上线：公告 / 功能 / 活动 / 精选 / 教程 分类，置顶优先，首页侧栏「社区快报」同步'],
      ['fix', '修复深色模式下 HeroUI 卡片底色发白、标题看不清的问题（补全 6 套配色的暗色主题）'],
      ['improve', '继续打磨 light / dark 双模式对比度，逐页核对可读性'],
    ],
  },
  {
    ver: 'v1.0', date: '2026-06-16 02:30:55', items: [
      ['new', '🏆 排行榜上线：财富榜 / 等级榜 / 人气榜 / 签到榜，前三名专属奖牌'],
      ['new', '社区扩容到 1000 位用户、10000 条内容，话题与信息流热闹起来了'],
      ['new', '登录注册页用 HeroUI 全新重构（标签切换 + 现代输入框）'],
      ['new', '更新日志页加入「问题反馈」展示与官方回复'],
      ['improve', '移动端锁定缩放、消除自由缩放，体验更像 App；修复换肤首屏闪烁'],
      ['improve', '数据库加索引，万级内容下信息流查询依然很快'],
    ],
  },
  {
    ver: 'v0.9', date: '2026-06-16 00:48:12', items: [
      ['new', 'HeroUI 主题系统：6 套配色（经典蓝/锐紫/翡翠/落日橙/玫瑰/青碧）× 浅色·深色，一键换肤'],
      ['new', '接入 HeroUI 组件库，逐屏重构界面'],
      ['fix', '修复大图浏览与弹窗遮罩只覆盖中间栏的问题（改用 Portal 渲染）'],
      ['improve', '九宫格 4 图改为 2×2；大图支持移动端左右滑动'],
    ],
  },
  {
    ver: 'v0.8', date: '2026-06-15 22:14:30', items: [
      ['new', '全站置顶卡 / 改名卡道具生效；头像框（彩虹·鎏金）落地；话题关注'],
      ['new', '评论楼中楼「展开 N 条回复」、评论「最新/最热」排序、贴子「上一条/下一条」'],
      ['fix', '修复 @提及跳转 404、发布框残留「0」、资料页昵称折断'],
    ],
  },
];

const ROADMAP = [
  { label: '进行中', color: 'primary', items: ['输入框与表单统一为 HeroUI 风格、全站对齐精修', '全站去 emoji、SVG 图标化', 'light / dark 双模式细节打磨'] },
  { label: '计划中', color: 'default', items: ['真实支付 + 余额提现', '群聊 / 聊天室', '长文专栏 / 资讯频道', '活动报名 · 抽奖 · 红包', 'VIP 等级 + 权限门控', 'MySQL / PostgreSQL 数据库支持'] },
  { label: '已完成', color: 'success', items: ['开源文档（README / 安装 / 部署 / API / 配置 / 贡献指南）', '网址导航（分类 + 锚点 + 热门排行）', '任务中心 + 成就勋章（每日任务 + 勋章墙）', '问答 · 悬赏求助（提问/回答/采纳 + 赏金托管）', '投票（单选/多选 + 截止 + 实时占比）', '圈子（自建/加入兴趣社群 + 圈内信息流）', '资讯快报门户 · 网址导航', '排行榜 · 会员 · 论坛 · 私信 · 积分商城', '全站丝滑转场 · 6 套配色 × 明暗模式'] },
];

function ReleaseCard({ r }) {
  return (
    <Card shadow="sm" radius="lg" className="mb-3 border border-default-200">
      <CardHeader className="flex items-center gap-3 pb-1">
        <Chip color="primary" variant="flat" size="sm" className="font-bold">{r.ver}</Chip>
        <span className="text-small text-default-500">{r.date}</span>
      </CardHeader>
      <CardBody className="pt-1 flex flex-col gap-2.5">
        {r.items.map(([t, text], i) => (
          <div key={i} className="flex items-start gap-2.5 text-small leading-relaxed">
            <Chip size="sm" variant="flat" color={TYPE[t].color} className="shrink-0">{TYPE[t].label}</Chip>
            <span className="text-default-700">{text}</span>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

export default function Changelog() {
  const toast = useToast();
  const { user, setAuthOpen } = useAuth();
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState(null);

  const loadFeedback = () => api.get('/feedback').then(({ data }) => setList(data.feedback)).catch(() => setList([]));
  useEffect(() => { loadFeedback(); }, []);

  const submit = async () => {
    if (!user) return setAuthOpen(true);
    if (content.trim().length < 5) return toast.err('再多写几个字吧～');
    setBusy(true);
    try {
      await api.post('/feedback', { content: content.trim() });
      setContent('');
      toast.ok('已收到，感谢你的反馈 🙏');
      loadFeedback();
    } catch (e) { toast.err(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Shell right={false}>
      <Card shadow="sm" radius="lg" className="mb-4 border border-default-200 bg-gradient-to-br from-primary-50 to-content1">
        <CardBody>
          <h1 className="text-xl font-extrabold flex items-center gap-2">
            <Icon name="trend" size={22} style={{ color: 'var(--brand)' }} /> 更新日志 & 开发计划
          </h1>
          <p className="text-default-500 text-small mt-1">记录每一次更新与未来规划，你的每一条反馈我们都会认真看、认真回。</p>
        </CardBody>
      </Card>

      <Tabs aria-label="更新与反馈" color="primary" variant="solid" radius="lg" fullWidth size="lg">
        <Tab key="log" title="更新日志">
          <div className="mt-3">{RELEASES.map((r) => <ReleaseCard key={r.ver} r={r} />)}</div>
        </Tab>

        <Tab key="roadmap" title="开发计划">
          <div className="mt-3 flex flex-col gap-3">
            {ROADMAP.map((g) => (
              <Card key={g.label} shadow="sm" radius="lg" className="border border-default-200">
                <CardHeader className="pb-1"><Chip color={g.color} variant="flat" className="font-bold">{g.label}</Chip></CardHeader>
                <CardBody className="pt-1 flex flex-col gap-2">
                  {g.items.map((it, i) => (
                    <div key={i} className="flex items-center gap-2 text-small text-default-700">
                      <Icon name="check" size={14} style={{ color: g.color === 'success' ? 'var(--good)' : 'var(--brand)', opacity: g.color === 'default' ? 0.45 : 1 }} />
                      {it}
                    </div>
                  ))}
                </CardBody>
              </Card>
            ))}
          </div>
        </Tab>

        <Tab key="feedback" title={`问题反馈${list?.length ? ` (${list.length})` : ''}`}>
          <Card shadow="sm" radius="lg" className="mt-3 border border-default-200">
            <CardBody className="gap-3">
              <p className="text-small text-default-600">发现 bug 或有功能建议？写下来，我们会认真看每一条并回复。</p>
              <Textarea value={content} onValueChange={setContent} minRows={3} maxLength={500}
                placeholder={user ? '描述你遇到的问题或想要的功能…' : '登录后即可提交反馈'} variant="bordered" radius="lg" />
              <div className="flex justify-end">
                <Button color="primary" radius="lg" onPress={submit} isLoading={busy} isDisabled={!content.trim()}>提交反馈</Button>
              </div>
            </CardBody>
          </Card>

          <div className="mt-3 flex flex-col gap-2.5">
            {list === null ? null : list.length === 0 ? (
              <Card shadow="sm" radius="lg"><CardBody className="text-center text-default-400 py-6 text-small">还没有反馈，来做第一个吧～</CardBody></Card>
            ) : list.map((f) => (
              <Card key={f.id} shadow="sm" radius="lg" className="border border-default-200">
                <CardBody className="gap-2">
                  <div className="flex items-center gap-2">
                    {f.user && <Avatar user={f.user} size={24} />}
                    <span className="text-small font-semibold text-default-700">{f.user?.nickname || '匿名用户'}</span>
                    <Chip size="sm" variant="flat" color={(FB_STATUS[f.status] || FB_STATUS.open).color}>{(FB_STATUS[f.status] || FB_STATUS.open).label}</Chip>
                    <span className="text-tiny text-default-400 ml-auto">{timeAgo(f.createdAt)}</span>
                  </div>
                  <p className="text-small text-default-700 leading-relaxed whitespace-pre-wrap">{f.content}</p>
                  {f.reply && (
                    <div className="bg-primary-50 rounded-medium p-3 text-small text-default-700 leading-relaxed">
                      <span className="font-bold text-primary">官方回复：</span>{f.reply}
                    </div>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
        </Tab>
      </Tabs>
    </Shell>
  );
}
