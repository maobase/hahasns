import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SiteConfig } from '../../database/entities';

// 模块市场 (C)：可开关的功能模块 key（与前端导航 module 一致）。Mirrors server/src/helpers.js MODULE_KEYS.
export const MODULE_KEYS = [
  'discover', 'circles', 'qa', 'flash', 'articles', 'events', 'nav',
  'forum', 'leaderboard', 'achievements', 'checkin', 'lottery', 'mall',
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
      favicon: cfg.get('site_favicon') || '',
      customCss: cfg.get('site_custom_css') || '',
      footerText: cfg.get('footer_text') || '',
      icpBeian: cfg.get('icp_beian') || '',
      rechargeTiers: cfg.get('recharge_tiers') || '',
      reportReasons: cfg.get('report_reasons') || '',
      registrationEnabled: (cfg.get('registration_enabled') ?? '1') !== '0',
      inviteRequired: cfg.get('invite_required') === '1',
      uploadMaxImages: Number(cfg.get('upload_max_images')) || 9,
      uploadMaxSizeMb: Number(cfg.get('upload_max_size_mb')) || 25,
      paidPriceMax: Number(cfg.get('paid_price_max')) || 100000,
      landingTitle: cfg.get('landing_title') || '',
      landingSubtitle: cfg.get('landing_subtitle') || '',
      defaultSkin: cfg.get('default_skin') || '',
      defaultMode: cfg.get('default_mode') || '',
      defaultStyle: cfg.get('default_style') || '',
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
