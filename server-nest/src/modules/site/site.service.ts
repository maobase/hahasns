import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SiteConfig } from '../../database/entities';

// 模块市场 (C)：可开关的功能模块 key（与前端导航 module 一致）。Mirrors server/src/helpers.js MODULE_KEYS.
export const MODULE_KEYS = [
  'discover', 'circles', 'qa', 'flash', 'articles', 'events', 'nav',
  'forum', 'leaderboard', 'achievements', 'checkin', 'lottery', 'mall',
  'ai', // AI 智能助手（后端 demo-mode 无需 API key 也可用；配 ANTHROPIC_API_KEY 走真实 Claude）
];

// 布局市场：站长可在后台为这些页面选择布局（default 三栏 / wide 宽屏 / narrow 居中）。
// 不设置则用各页内置默认（前端 fallback），保证零回归。
export const LAYOUT_PAGES = [
  'collections', 'nav', 'mall', 'circles', 'achievements', 'member',
  'bookmarks', 'history', 'settings', 'changelog', 'thread',
];
export const LAYOUT_VALUES = ['default', 'wide', 'narrow'];

/**
 * 站点配置读写（site_config 表）。Mirrors server/src/routes/site.js + helpers getConfig/moduleStates.
 */
@Injectable()
export class SiteService {
  constructor(
    @InjectRepository(SiteConfig) private readonly repo: Repository<SiteConfig>,
  ) {}

  async getConfig(key: string, fallback: string | null = null): Promise<string | null> {
    const row = await this.repo.findOne({ where: { key } });
    return row ? row.value : fallback;
  }

  async setConfig(key: string, value: string): Promise<void> {
    await this.repo.save(this.repo.create({ key, value: String(value) }));
  }

  /** 删除一个配置键（回退到 env / 内置默认）。返回是否真的删掉了行。 */
  async deleteConfig(key: string): Promise<boolean> {
    const res = await this.repo.delete({ key });
    return (res.affected || 0) > 0;
  }

  async moduleStates(): Promise<Record<string, boolean>> {
    const rows = await this.repo.find();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const out: Record<string, boolean> = {};
    for (const k of MODULE_KEYS) out[k] = map.get(`module_${k}`) !== '0'; // 默认开启
    return out;
  }

  // ---- GET /api/site —— 公开品牌 + 自定义 CSS + 模块开关 ----
  async getSite() {
    const rows = await this.repo.find();
    const cfg = new Map(rows.map((r) => [r.key, r.value]));
    const modules: Record<string, boolean> = {};
    for (const k of MODULE_KEYS) modules[k] = cfg.get(`module_${k}`) !== '0';
    const layouts: Record<string, string> = {};
    for (const k of LAYOUT_PAGES) { const v = cfg.get(`layout_${k}`); if (v) layouts[k] = v; }
    // 支付网关：公开接口只暴露「哪些已启用」，绝不返回密钥/凭据
    const payments = {
      alipay: cfg.get('pay_alipay_enabled') === '1',
      wechat: cfg.get('pay_wechat_enabled') === '1',
      epay: cfg.get('pay_epay_enabled') === '1',
    };
    return {
      name: cfg.get('site_name') || 'HahaSNS',
      slogan: cfg.get('site_slogan') || '轻社交社区',
      logo: cfg.get('site_logo') || '',
      logoOnly: cfg.get('site_logo_only') === '1',
      logoHeight: Math.max(24, Math.min(64, Number(cfg.get('site_logo_height')) || 33)),
      favicon: cfg.get('site_favicon') || '',
      customCss: cfg.get('site_custom_css') || '',
      footerText: cfg.get('footer_text') || '',
      icpBeian: cfg.get('icp_beian') || '',
      rechargeTiers: cfg.get('recharge_tiers') || '',
      reportReasons: cfg.get('report_reasons') || '',
      registrationEnabled: (cfg.get('registration_enabled') ?? '1') !== '0',
      inviteRequired: cfg.get('invite_required') === '1',
      allowGuest: cfg.get('allow_guest') === '1',
      // 游客信息流上限：未配置→8；配 0→不限；否则 clamp [0,200]
      guestFeedLimit: (() => {
        const v = cfg.get('guest_feed_limit');
        if (v == null || v === '') return 8;
        return Math.max(0, Math.min(200, Math.round(Number(v)) || 0));
      })(),
      uploadMaxImages: Number(cfg.get('upload_max_images')) || 9,
      uploadMaxSizeMb: Number(cfg.get('upload_max_size_mb')) || 25,
      paidPriceMax: Number(cfg.get('paid_price_max')) || 100000,
      landingTitle: cfg.get('landing_title') || '',
      landingSubtitle: cfg.get('landing_subtitle') || '',
      defaultSkin: cfg.get('default_skin') || '',
      defaultMode: cfg.get('default_mode') || '',
      defaultStyle: cfg.get('default_style') || '',
      // 页面内容：非空覆盖内置；开关默认开
      aboutContent: cfg.get('about_content') || '',
      roadmapContent: cfg.get('roadmap_content') || '',
      changelogContent: cfg.get('changelog_content') || '',
      pageAboutOn: (cfg.get('page_about_on') ?? '1') !== '0',
      pageRoadmapOn: (cfg.get('page_roadmap_on') ?? '1') !== '0',
      pageChangelogOn: (cfg.get('page_changelog_on') ?? '1') !== '0',
      // 首页布局 list|waterfall；非法→list
      feedLayout: (cfg.get('feed_layout') || '').toLowerCase() === 'waterfall' ? 'waterfall' : 'list',
      // 自定义主题 JSON 字符串（前端 parseCustomThemes）；坏数据前端回退
      customThemes: cfg.get('custom_themes') || '',
      // 自定义导航外链（波D）：每行「标题|网址」→ {label,url}；网址须 http(s):// 或 /开头，非法行跳过，最多 8 条
      customNavLinks: (cfg.get('custom_nav_links') || '')
        .split('\n')
        .map((line) => {
          const [label, url] = line.split('|').map((s) => (s || '').trim());
          return { label, url };
        })
        .filter((l) => l.label && l.url && (/^https?:\/\//.test(l.url) || l.url.startsWith('/')))
        .slice(0, 8),
      // 导航项改名（波D）：每行「/路径|新名称」→ { '/路径': '新名称' }，覆盖内置导航标签；非法行跳过
      navLabels: Object.fromEntries(
        (cfg.get('nav_labels') || '')
          .split('\n')
          .map((line) => {
            const [path, label] = line.split('|').map((s) => (s || '').trim());
            return [path, label] as [string, string];
          })
          .filter(([path, label]) => path.startsWith('/') && label)
          .slice(0, 30),
      ),
      // VIP 各档位月价（分）：已配置→数字，未配置→null（前端回退到内置默认）
      vipPrices: {
        '1': cfg.get('vip1_price') ? Number(cfg.get('vip1_price')) : null,
        '2': cfg.get('vip2_price') ? Number(cfg.get('vip2_price')) : null,
        '3': cfg.get('vip3_price') ? Number(cfg.get('vip3_price')) : null,
      },
      // VIP 各档位名称/标语/权益：已配置→字符串，未配置→null（前端回退到内置默认）；perks 为每行一条
      vipTiers: {
        '1': { name: cfg.get('vip1_name') || null, tagline: cfg.get('vip1_tagline') || null, perks: cfg.get('vip1_perks') || null },
        '2': { name: cfg.get('vip2_name') || null, tagline: cfg.get('vip2_tagline') || null, perks: cfg.get('vip2_perks') || null },
        '3': { name: cfg.get('vip3_name') || null, tagline: cfg.get('vip3_tagline') || null, perks: cfg.get('vip3_perks') || null },
      },
      // 首页信息流可选 tab 开关（默认开：未配置或非 '0' 视为显示）
      homeTabs: {
        video: cfg.get('home_tab_video') !== '0',
        samecity: cfg.get('home_tab_samecity') !== '0',
        following: cfg.get('home_tab_following') !== '0',
      },
      // 右栏挂件开关（默认开）；前端与模块开关叠加：模块关或挂件关都不显示
      widgets: {
        hottopics: cfg.get('widget_hottopics') !== '0',
        qa: cfg.get('widget_qa') !== '0',
        circle: cfg.get('widget_circle') !== '0',
        flash: cfg.get('widget_flash') !== '0',
        whotofollow: cfg.get('widget_whotofollow') !== '0',
        checkin: cfg.get('widget_checkin') !== '0',
        trending: cfg.get('widget_trending') !== '0',
      },
      modules,
      layouts,
      payments,
    };
  }
}
