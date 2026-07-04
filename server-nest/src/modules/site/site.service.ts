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
      modules,
      layouts,
      payments,
    };
  }
}
