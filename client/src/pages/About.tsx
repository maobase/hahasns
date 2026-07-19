import { Link } from 'react-router-dom';
import { BrandMark } from '../components/Navbar';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useSite, moduleOn } from '../context/SiteContext';
import SafeMarkdown from '../components/SafeMarkdown';
import { usePageTitle } from '../hooks/usePageTitle';
import { APP_VERSION } from '../version';

const HIGHLIGHTS: [string, string, string][] = [
  ['palette', '6 套配色 × 明暗双模', '经典蓝 / 锐紫 / 翡翠 / 落日橙 / 玫瑰 / 青碧，浅色深色随心切换'],
  ['grid', '桌面 + 移动端全适配', '桌面三栏布局，移动端底部标签栏 + 抽屉导航，各种屏幕都顺手'],
  ['shield', '安全防护后台可配', '频率限制、防批量注册、权限门控、内容审核，后台一键开关'],
  ['spark', '丝滑动效与转场', '页面转场、骨架屏、微交互，处处精致流畅'],
  ['coin', '积分玩法闭环', '签到 · 任务 · 勋章 · 抽奖 · 商城 · 排行榜，养成与激励一应俱全'],
  ['book', '开源 · 可商用', 'MIT 协议、代码原创，可自托管、可二次开发'],
];

const FEATURES: [string, string, string][] = [
  ['edit', '轻社交动态', '文字 / 图片 / 视频 / 音乐，@提及、#话题#、加粗与代码格式，随手记录分享'],
  ['forum', '社区论坛', '版块讨论、内联看帖回帖、版主管理、置顶与精华'],
  ['users', '兴趣圈子', '创建或加入兴趣社群，享受圈内专属信息流'],
  ['help', '问答 · 悬赏', '提问解惑、悬赏求助、采纳最佳答案'],
  ['bell', '资讯快报', '社区快讯门户，第一时间了解最新动态'],
  ['book', '专栏文章', '长文创作与阅读，沉淀优质内容'],
  ['ticket', '活动报名', '线上线下活动的发布与报名'],
  ['grid', '网址导航', '精选站点导航，一站直达常用资源'],
  ['trend', '排行榜', '财富 / 等级 / 人气 / 签到多榜单，前三名领奖台'],
  ['checkin', '任务勋章', '任务中心 + 成就勋章墙，玩法丰富'],
  ['gift', '签到抽奖', '连续签到赚积分、积分抽奖惊喜不断'],
  ['shop', '积分商城', '积分兑换头像框 / 改名卡等专属装扮'],
  ['coin', '会员中心', 'VIP 会员与等级特权体系'],
  ['mail', '私信聊天', '一对一私信、支持图片，频率防骚扰'],
  ['shield', '安全防护', '频率限制、防批量注册、权限门控、内容审核，后台可配'],
  ['settings', '独立后台', '管理后台独立登录，用户 / 内容 / 安全一站管理'],
];

const STACK = ['React 19', 'HeroUI', 'TypeScript', 'Tailwind 4', 'Vite', 'NestJS', 'TypeORM', 'MySQL / MariaDB', 'Redis', '可选 S3 对象存储'];
const SHOTS: [string, string][] = [['feed', '动态信息流'], ['forum', '社区论坛'], ['profile', '个人主页'], ['circles', '兴趣圈子']];
const SPONSOR: [string, string, string][] = [
  ['grid', '服务器', '承载演示站与社区服务，让更多人随时体验'],
  ['image', '对象存储', '存放用户上传的图片 / 视频 / 头图等媒体'],
  ['trend', 'CDN 加速', '全球加速静态资源与媒体，访问更快更稳'],
];

// 功能卡 → 模块 key（无 module 的核心项始终显示）
const FEATURE_MODULE: Record<string, string | undefined> = {
  '社区论坛': 'forum', '兴趣圈子': 'circles', '问答 · 悬赏': 'qa', '资讯快报': 'flash',
  '专栏文章': 'articles', '活动报名': 'events', '网址导航': 'nav', '排行榜': 'leaderboard',
  '任务勋章': 'achievements', '签到抽奖': 'checkin', '积分商城': 'mall',
};

export default function About() {
  const { user } = useAuth();
  const { skins } = useTheme();
  const site = useSite();
  usePageTitle('关于');
  const custom = (site.aboutContent || '').trim();
  const features = FEATURES.filter(([, t]) => moduleOn(site.modules, FEATURE_MODULE[t]));
  return (
    <div className="about">
      <header className="about-nav">
        <Link to="/" className="row gap-8" style={{ alignItems: 'center' }}>
          <BrandMark size={32} logo={site.logo} /><span className="brand-name" style={{ fontSize: 19 }}><b>{site.name}</b></span>
        </Link>
        <Link to="/" className="haha-btn-app haha-btn-app--primary">{user ? '进入应用' : '登录 / 注册'}</Link>
      </header>

      {custom ? (
        <section className="about-sec" style={{ maxWidth: 760, margin: '40px auto', padding: '0 20px' }}>
          <SafeMarkdown source={custom} />
        </section>
      ) : (
      <>
      <section className="about-hero">
        <div className="about-hero-glow" aria-hidden />
        <span className="about-badge"><Icon name="spark" size={13} /> 完全免费 · MIT 开源 · 可自托管 · 可商用二开</span>
        <h1 className="about-hero-title" style={{ whiteSpace: 'pre-line' }}>{site.landingTitle || '连接有趣的人\n与值得分享的内容'}</h1>
        <p className="about-hero-sub">轻社交 · 轻论坛 · 轻社区 —— 一站式开源社区系统</p>
        <div className="row gap-10" style={{ justifyContent: 'center', marginTop: 26, flexWrap: 'wrap' }}>
          <Link to="/" className="haha-btn-app haha-btn-app--primary haha-btn-app--lg">立即体验</Link>
          <a href="https://github.com/maobase/hahasns" target="_blank" rel="noreferrer" className="haha-btn-app haha-btn-app--outline haha-btn-app--lg"><Icon name="book" size={16} /> 开源仓库</a>
        </div>
      </section>

      <section className="about-sec">
        <h2 className="about-h2">核心亮点</h2>
        <p className="about-sub">不止功能齐全，更在体验与细节上较真</p>
        <div className="about-grid about-grid-3">
          {HIGHLIGHTS.map(([ic, t, d]) => (
            <div className="about-hl" key={t}>
              <span className="about-hl-ico"><Icon name={ic} size={24} /></span>
              <div className="about-feat-t" style={{ marginTop: 12, fontSize: 16 }}>{t}</div>
              <div className="about-feat-d" style={{ marginTop: 5 }}>{d}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="about-sec">
        <h2 className="about-h2">功能一览</h2>
        <p className="about-sub">围绕「轻社交 · 轻论坛 · 轻社区」打造的完整功能矩阵</p>
        <div className="about-grid">
          {features.map(([ic, t, d]) => (
            <div className="about-feat" key={t}>
              <span className="about-feat-ico"><Icon name={ic} size={22} /></span>
              <div style={{ minWidth: 0 }}><div className="about-feat-t">{t}</div><div className="about-feat-d">{d}</div></div>
            </div>
          ))}
        </div>
      </section>

      <section className="about-sec">
        <h2 className="about-h2">界面预览</h2>
        <div className="about-shots">
          {SHOTS.map(([k, label]) => (
            <figure className="about-shot" key={k}>
              <img src={`/showcase/${k}.png`} alt={label} loading="lazy" />
              <figcaption>{label}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="about-sec">
        <h2 className="about-h2">主题配色</h2>
        <p className="about-sub">内置 6 套配色皮肤 × 浅色 / 深色双模式，总有一款适合你</p>
        <div className="about-skins">
          {skins.map((s) => (
            <div className="about-skin" key={s.key}>
              <span className="about-skin-dot" style={{ background: s.color }} />
              <span>{s.label}</span>
            </div>
          ))}
          <div className="about-skin"><span className="about-skin-dot about-skin-dual" /><span>浅色 / 深色</span></div>
        </div>
      </section>

      <section className="about-sec" style={{ paddingTop: 8 }}>
        <h2 className="about-h2">技术栈</h2>
        <div className="about-stack">{STACK.map((s) => <span key={s}>{s}</span>)}</div>
      </section>

      <section className="about-sponsor">
        <h2 className="about-h2">欢迎赞助 <span style={{ color: 'var(--like)' }}>❤</span></h2>
        <p className="about-sub">本项目开源免费。如果它对你有帮助，欢迎赞助以下资源，让演示站与社区持续运转：</p>
        <div className="about-sponsor-grid">
          {SPONSOR.map(([ic, t, d]) => (
            <div className="about-sponsor-card" key={t}>
              <span className="about-feat-ico"><Icon name={ic} size={22} /></span>
              <div className="about-feat-t" style={{ marginTop: 10 }}>{t}</div>
              <div className="about-feat-d" style={{ marginTop: 4 }}>{d}</div>
            </div>
          ))}
        </div>
        <p className="faint" style={{ textAlign: 'center', marginTop: 18, fontSize: 13 }}>有意赞助请通过开源仓库联系我们，备注「赞助 {site.name}」。</p>
      </section>

      <section className="about-cta">
        <h2>准备好开启你的社区了吗？</h2>
        <p>立即上手体验，或拉取开源代码，几步即可自行部署一套属于你的社区</p>
        <div className="row gap-10" style={{ justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
          <Link to="/" className="haha-btn-app haha-btn-app--lg about-cta-btn">立即体验</Link>
          <a href="https://github.com/maobase/hahasns#-快速开始" target="_blank" rel="noreferrer" className="haha-btn-app haha-btn-app--outline haha-btn-app--lg about-cta-ghost"><Icon name="grid" size={16} /> 免费部署教程</a>
          <a href="https://github.com/maobase/hahasns" target="_blank" rel="noreferrer" className="haha-btn-app haha-btn-app--outline haha-btn-app--lg about-cta-ghost"><Icon name="book" size={16} /> 查看源码</a>
        </div>
      </section>

      <footer className="about-foot">© 2026 {site.name} · {site.slogan} · <span className="num">{APP_VERSION}</span></footer>
      </>
      )}
    </div>
  );
}
