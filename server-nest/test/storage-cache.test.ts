import { describe, test, expect, vi } from 'vitest';
import { StorageService } from '../src/modules/storage/storage.service';

// 用 s3 模式实例化（applyConfig 走 S3Client 分支，不碰文件系统），
// 只验证 refreshFromSite 的配置缓存：TTL 内复用、force 绕过。
function makeService(siteVals: Record<string, string>) {
  const getConfig = vi.fn(async (k: string) => siteVals[k] ?? null);
  const config = { get: () => ({}) } as any;
  const site = { getConfig } as any;
  return { svc: new StorageService(config, site), getConfig };
}

const S3_CFG = {
  storage_driver: 's3',
  s3_endpoint: 'http://127.0.0.1:9000',
  s3_bucket: 'b',
  s3_access_key: 'ak',
  s3_secret_key: 'sk',
};

describe('StorageService 配置缓存', () => {
  test('TTL 内多次 refresh 只读一次库（8 键），force 绕过缓存', async () => {
    const { svc, getConfig } = makeService(S3_CFG);
    await svc.refreshFromSite();
    expect(getConfig.mock.calls.length).toBe(8); // storage_driver + 7 个 s3_*
    // TTL 内再刷两次 → 命中缓存，无新的 DB 读
    await svc.refreshFromSite();
    await svc.refreshFromSite();
    expect(getConfig.mock.calls.length).toBe(8);
    // force=true → 强制重读
    await svc.refreshFromSite(true);
    expect(getConfig.mock.calls.length).toBe(16);
  });

  test('一次 uploadMany（多文件）不再每文件都读库', async () => {
    const { svc, getConfig } = makeService(S3_CFG);
    // 预热一次（模拟 upload 前的 refresh），随后同批 8 个文件各自 refresh 都应命中缓存
    await svc.refreshFromSite();
    const base = getConfig.mock.calls.length; // 8
    for (let i = 0; i < 8; i++) await svc.refreshFromSite();
    expect(getConfig.mock.calls.length).toBe(base); // 仍是 8，未随文件数线性增长
  });
});
