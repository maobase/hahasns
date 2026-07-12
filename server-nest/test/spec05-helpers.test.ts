import { describe, expect, test } from 'vitest';
import {
  resolveStorageConfig,
  storageConfigHash,
  isSecretPlaceholder,
  resolveSecretWrite,
  SECRET_PLACEHOLDER,
} from '../src/modules/storage/storage-config';
import { PUBLIC_SITE_FORBIDDEN_KEYS, SECRET_KEYS } from '../src/modules/admin/admin.service';
import {
  escapeHtml,
  renderSafeMarkdown,
  isMarkdownSafe,
} from '../../client/src/lib/safeMarkdown';
import {
  validateThemePackage,
  parseCustomThemes,
  mergeSkins,
  tokensToCss,
} from '../../client/src/lib/themePackage';
import { normalizeFeedLayout } from '../../client/src/lib/feedLayout';
import {
  footerLinksOf,
  pageAboutOpen,
  pageChangelogRouteOpen,
  showAuthAboutLink,
} from '../../client/src/lib/pageEntries';
import { logoHeightOf, showBrandText } from '../../client/src/components/Navbar';
import { moduleForPath } from '../../client/src/components/Layout';
import { moduleOn } from '../../client/src/context/SiteContext';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { OptionalAuthGuard } from '../src/common/guards/optional-auth.guard';
import { UnauthorizedException } from '@nestjs/common';

describe('storage-config resolve', () => {
  test('默认无 key → local', () => {
    const c = resolveStorageConfig({}, {});
    expect(c.driver).toBe('local');
  });

  test('site_config 优先于 env', () => {
    const c = resolveStorageConfig(
      {
        storage_driver: 's3',
        s3_endpoint: 'https://s3.site.example',
        s3_bucket: 'site-bucket',
        s3_access_key: 'site-ak',
        s3_secret_key: 'site-sk',
        s3_force_path_style: '0',
      },
      {
        STORAGE_DRIVER: 'local',
        S3_ENDPOINT: 'http://env',
        S3_BUCKET: 'env-bucket',
        S3_ACCESS_KEY: 'env-ak',
        S3_SECRET_KEY: 'env-sk',
        S3_FORCE_PATH_STYLE: 'true',
      },
    );
    expect(c.driver).toBe('s3');
    expect(c.endpoint).toBe('https://s3.site.example');
    expect(c.bucket).toBe('site-bucket');
    expect(c.accessKey).toBe('site-ak');
    expect(c.forcePathStyle).toBe(false);
  });

  test('site 空串回退 env；有 accessKey 无 driver → s3', () => {
    const c = resolveStorageConfig(
      { s3_endpoint: '' },
      { S3_ENDPOINT: 'http://minio:9000', S3_ACCESS_KEY: 'ak', S3_SECRET_KEY: 'sk' },
    );
    expect(c.driver).toBe('s3');
    expect(c.endpoint).toBe('http://minio:9000');
  });

  test('hash 随密钥变化', () => {
    const a = resolveStorageConfig({ storage_driver: 's3', s3_access_key: 'a' }, {});
    const b = resolveStorageConfig({ storage_driver: 's3', s3_access_key: 'b' }, {});
    expect(storageConfigHash(a)).not.toBe(storageConfigHash(b));
  });
});

describe('secret placeholder / write', () => {
  test('占位与空视为 placeholder', () => {
    expect(isSecretPlaceholder('')).toBe(true);
    expect(isSecretPlaceholder(SECRET_PLACEHOLDER)).toBe(true);
    expect(isSecretPlaceholder('••••')).toBe(true);
    expect(isSecretPlaceholder('real-secret')).toBe(false);
  });

  test('placeholder 不覆写；新值覆写', () => {
    expect(resolveSecretWrite('••••', 'old')).toBe('old');
    expect(resolveSecretWrite('', 'old')).toBe('old');
    expect(resolveSecretWrite('new-key', 'old')).toBe('new-key');
  });

  test('SECRET_KEYS 含 s3 凭据', () => {
    expect(SECRET_KEYS.has('s3_access_key')).toBe(true);
    expect(SECRET_KEYS.has('s3_secret_key')).toBe(true);
  });

  test('公开 site 禁止键清单含 s3 与支付密钥', () => {
    for (const k of ['s3_access_key', 's3_secret_key', 'pay_alipay_key']) {
      expect(PUBLIC_SITE_FORBIDDEN_KEYS).toContain(k);
    }
  });
});

describe('safe markdown', () => {
  test('转义 script 与事件', () => {
    const html = renderSafeMarkdown('hello <script>alert(1)</script> **bold**');
    expect(html).not.toMatch(/<script>/i);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong>bold</strong>');
    expect(isMarkdownSafe(html)).toBe(true);
  });

  test('onerror 被转义为文本（非可执行属性）', () => {
    const html = renderSafeMarkdown('<img src=x onerror=alert(1)>');
    // 尖括号被 escape，浏览器不会解析为元素/属性
    expect(html).toContain('&lt;img');
    expect(html).not.toMatch(/<img\b/i);
    expect(isMarkdownSafe(html)).toBe(true);
  });

  test('javascript: 链接被拒绝', () => {
    const html = renderSafeMarkdown('[x](javascript:alert(1))');
    expect(html).not.toMatch(/href="javascript:/i);
  });

  test('escapeHtml 基础', () => {
    expect(escapeHtml('<a>"&\'')).toBe('&lt;a&gt;&quot;&amp;&#39;');
  });
});

describe('theme package schema', () => {
  const good = {
    id: 'ocean',
    name: '深海蓝',
    version: '1.0.0',
    tokens: { '--brand': '#0e7490', '--page': '#f0f9ff' },
  };

  test('合法包通过', () => {
    const r = validateThemePackage(good);
    expect(r.ok).toBe(true);
    expect(r.value?.id).toBe('ocean');
  });

  test('缺 tokens / id 拒绝', () => {
    expect(validateThemePackage({ id: 'x', name: 'n', version: '1' }).ok).toBe(false);
    expect(validateThemePackage({ name: 'n', version: '1', tokens: { '--brand': '#000' } }).ok).toBe(false);
  });

  test('坏 JSON / 非数组 → 空列表', () => {
    expect(parseCustomThemes('not-json')).toEqual([]);
    expect(parseCustomThemes('{}')).toEqual([]);
    expect(parseCustomThemes(JSON.stringify([good])).length).toBe(1);
  });

  test('内置 id 冲突被跳过', () => {
    expect(parseCustomThemes(JSON.stringify([{ ...good, id: 'default' }]))).toEqual([]);
  });

  test('mergeSkins 附加自定义', () => {
    const builtins = [{ key: 'default', label: '蓝', color: '#00f' }];
    const merged = mergeSkins(builtins, [good as any]);
    expect(merged).toHaveLength(2);
    expect(merged[1].key).toBe('ocean');
  });

  test('tokensToCss', () => {
    expect(tokensToCss({ '--brand': '#f00', x: '1' as any })).toContain('--brand:#f00');
  });
});

describe('feed_layout normalize', () => {
  test('缺省/非法 → list', () => {
    expect(normalizeFeedLayout(undefined)).toBe('list');
    expect(normalizeFeedLayout('')).toBe('list');
    expect(normalizeFeedLayout('masonry')).toBe('list');
  });
  test('waterfall 合法', () => {
    expect(normalizeFeedLayout('waterfall')).toBe('waterfall');
    expect(normalizeFeedLayout('Waterfall')).toBe('waterfall');
  });
});

describe('logo helpers', () => {
  test('logoHeightOf clamp', () => {
    expect(logoHeightOf(undefined)).toBe(33);
    expect(logoHeightOf(10)).toBe(24);
    expect(logoHeightOf(100)).toBe(64);
    expect(logoHeightOf(40)).toBe(40);
  });
  test('showBrandText', () => {
    expect(showBrandText('', true)).toBe(true);
    expect(showBrandText('/x.png', true)).toBe(false);
    expect(showBrandText('/x.png', false)).toBe(true);
  });
});

describe('module path gating', () => {
  test('ai + collections→articles', () => {
    expect(moduleForPath('/ai')).toBe('ai');
    expect(moduleForPath('/collections')).toBe('articles');
    expect(moduleForPath('/collection/1')).toBe('articles');
    expect(moduleForPath('/forum')).toBe('forum');
  });
  test('moduleOn fail-open', () => {
    expect(moduleOn(undefined, 'forum')).toBe(true);
    expect(moduleOn({ forum: false }, 'forum')).toBe(false);
    expect(moduleOn({ forum: true }, 'forum')).toBe(true);
  });
});

describe('page entry gating (About / Changelog / Footer)', () => {
  test('默认全开：关于入口 + changelog 路由 + 反馈入口', () => {
    expect(pageAboutOpen({})).toBe(true);
    expect(pageChangelogRouteOpen({})).toBe(true);
    expect(showAuthAboutLink({})).toBe(true);
    const labels = footerLinksOf({}).map((l) => l.label);
    expect(labels).toEqual(['更新日志', '开发计划', '问题反馈', '关于']);
  });

  test('pageAboutOn=false → 登录页「了解功能」与页脚「关于」隐藏', () => {
    const flags = { pageAboutOn: false, pageChangelogOn: true, pageRoadmapOn: true };
    expect(pageAboutOpen(flags)).toBe(false);
    expect(showAuthAboutLink(flags)).toBe(false);
    const labels = footerLinksOf(flags).map((l) => l.label);
    expect(labels).not.toContain('关于');
    expect(labels).toContain('问题反馈');
  });

  test('changelog+roadmap 都关 → 路由关、问题反馈入口消失', () => {
    const flags = { pageAboutOn: true, pageChangelogOn: false, pageRoadmapOn: false };
    expect(pageChangelogRouteOpen(flags)).toBe(false);
    const labels = footerLinksOf(flags).map((l) => l.label);
    expect(labels).not.toContain('问题反馈');
    expect(labels).not.toContain('更新日志');
    expect(labels).not.toContain('开发计划');
    expect(labels).toContain('关于');
  });

  test('仅 roadmap 开 → 仍可进 changelog 路由与反馈', () => {
    const flags = { pageChangelogOn: false, pageRoadmapOn: true };
    expect(pageChangelogRouteOpen(flags)).toBe(true);
    const labels = footerLinksOf(flags).map((l) => l.label);
    expect(labels).toContain('问题反馈');
    expect(labels).toContain('开发计划');
    expect(labels).not.toContain('更新日志');
  });
});

describe('auth guards (write 401 lock)', () => {
  function mockCtx(headers: Record<string, string> = {}) {
    const req: any = { headers, user: undefined };
    return {
      switchToHttp: () => ({ getRequest: () => req }),
      req,
    } as any;
  }

  test('JwtAuthGuard 无 token → 401 请先登录', async () => {
    const guard = new JwtAuthGuard(
      { verify: () => { throw new Error('no'); } } as any,
      { get: () => 'secret' } as any,
      { findOne: async () => null } as any,
    );
    await expect(guard.canActivate(mockCtx())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test('OptionalAuthGuard 无 token 仍放行', async () => {
    const guard = new OptionalAuthGuard(
      { verify: () => ({}) } as any,
      { get: () => 'secret' } as any,
      { findOne: async () => null } as any,
    );
    await expect(guard.canActivate(mockCtx())).resolves.toBe(true);
  });
});
