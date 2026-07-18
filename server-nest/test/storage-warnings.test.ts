import { describe, test, expect } from 'vitest';
import { storageConfigWarnings } from '../src/modules/storage/storage-config';

// 纯函数测试：driver=s3 时的配置缺陷预警（endpoint 缺省 / publicUrl 缺失）。
// env 一律显式传 {}，避免 process.env 泄漏影响判定。
describe('storageConfigWarnings 配置缺陷预警', () => {
  test('local 驱动 → 无预警', () => {
    expect(storageConfigWarnings({}, {})).toEqual([]);
    expect(storageConfigWarnings({ storage_driver: 'local' }, {})).toEqual([]);
  });

  test('s3 且 endpoint（site 或 env）与 publicUrl 均已配 → 无预警', () => {
    expect(
      storageConfigWarnings(
        {
          storage_driver: 's3',
          s3_endpoint: 'https://s3-cn-east-1.qiniucs.com',
          s3_public_url: 'https://cdn.example.com',
        },
        {},
      ),
    ).toEqual([]);
    // endpoint 只配在 env 也算显式配置
    expect(
      storageConfigWarnings(
        { storage_driver: 's3', s3_public_url: 'https://cdn.example.com' },
        { S3_ENDPOINT: 'https://s3.example.com' },
      ),
    ).toEqual([]);
  });

  test('s3 且 site/env 均未配 endpoint → 默认地址预警', () => {
    const w = storageConfigWarnings(
      { storage_driver: 's3', s3_access_key: 'ak', s3_public_url: 'https://cdn.example.com' },
      {},
    );
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('http://127.0.0.1:9000');
  });

  test('site 空串 endpoint 视为未配置 → 仍预警', () => {
    const w = storageConfigWarnings(
      { storage_driver: 's3', s3_endpoint: '', s3_public_url: 'https://cdn.example.com' },
      {},
    );
    expect(w.some((x) => x.includes('127.0.0.1:9000'))).toBe(true);
  });

  test('s3 且未配 publicUrl → 访问域名预警', () => {
    const w = storageConfigWarnings(
      { storage_driver: 's3', s3_endpoint: 'https://s3.example.com' },
      {},
    );
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('Public URL');
  });

  test('endpoint 与 publicUrl 都缺 → 两条预警', () => {
    const w = storageConfigWarnings({ storage_driver: 's3', s3_access_key: 'ak' }, {});
    expect(w).toHaveLength(2);
    expect(w[0]).toContain('127.0.0.1:9000');
    expect(w[1]).toContain('Public URL');
  });
});
