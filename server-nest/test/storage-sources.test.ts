import { describe, test, expect } from 'vitest';
import {
  resolveStorageConfig,
  resolveStorageSources,
} from '../src/modules/storage/storage-config';

// 纯函数测试：逐项配置来源判定。口径必须与 resolveStorageConfig 一致——
// 后台面板拿它标「这个值来自 .env」，标错比不标更误导。
describe('resolveStorageSources 配置来源判定', () => {
  test('site/env 全空 → 一律 default', () => {
    const s = resolveStorageSources({}, {});
    expect(s).toEqual({
      driver: 'default',
      endpoint: 'default',
      bucket: 'default',
      region: 'default',
      publicUrl: 'default',
      forcePathStyle: 'default',
      accessKey: 'default',
      secretKey: 'default',
    });
  });

  test('只有 env（docker compose 传 S3_*）→ 标 env，不误报后台已配', () => {
    const env = {
      S3_ENDPOINT: 'https://s3.example.com',
      S3_BUCKET: 'b',
      S3_REGION: 'r',
      S3_PUBLIC_URL: 'https://cdn.example.com',
      S3_ACCESS_KEY: 'ak',
      S3_SECRET_KEY: 'sk',
      S3_FORCE_PATH_STYLE: 'false',
    };
    const s = resolveStorageSources({}, env);
    expect(s.endpoint).toBe('env');
    expect(s.bucket).toBe('env');
    expect(s.region).toBe('env');
    expect(s.publicUrl).toBe('env');
    expect(s.accessKey).toBe('env');
    expect(s.secretKey).toBe('env');
    expect(s.forcePathStyle).toBe('env');
    // 未显式给 STORAGE_DRIVER：驱动由 accessKey 推断，来源仍算 default
    expect(s.driver).toBe('default');
    expect(resolveStorageConfig({}, env).driver).toBe('s3');
  });

  test('后台填了值 → 覆盖 env，标 site', () => {
    const s = resolveStorageSources(
      { s3_endpoint: 'https://qiniu.example.com', storage_driver: 's3' },
      { S3_ENDPOINT: 'https://s3.example.com', S3_BUCKET: 'b' },
    );
    expect(s.endpoint).toBe('site');
    expect(s.driver).toBe('site');
    expect(s.bucket).toBe('env');
  });

  test('后台空串视为未填 → 回落 env（与 resolveStorageConfig 同口径）', () => {
    const site = { s3_endpoint: '', s3_bucket: '' };
    const env = { S3_ENDPOINT: 'https://s3.example.com' };
    const s = resolveStorageSources(site, env);
    expect(s.endpoint).toBe('env');
    expect(s.bucket).toBe('default');
    expect(resolveStorageConfig(site, env).endpoint).toBe('https://s3.example.com');
  });

  test('driver 由 env STORAGE_DRIVER 指定 → 标 env', () => {
    expect(resolveStorageSources({}, { STORAGE_DRIVER: 'local' }).driver).toBe('env');
    expect(resolveStorageSources({}, { STORAGE_DRIVER: 'oss' as any }).driver).toBe('default');
  });

  test('forcePathStyle：后台显式 0 也算 site（0 不能被 falsy 吃掉）', () => {
    expect(
      resolveStorageSources({ s3_force_path_style: '0' }, { S3_FORCE_PATH_STYLE: 'true' })
        .forcePathStyle,
    ).toBe('site');
    expect(resolveStorageSources({ s3_force_path_style: '' }, {}).forcePathStyle).toBe('default');
  });
});
