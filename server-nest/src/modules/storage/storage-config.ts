/**
 * 存储配置解析：site_config 优先，env 回退。
 * 纯函数，便于 vitest 驱动，无 I/O。
 */

export type StorageDriver = 'local' | 's3';

export interface StorageResolvedConfig {
  driver: StorageDriver;
  endpoint: string;
  bucket: string;
  region: string;
  publicUrl: string;
  forcePathStyle: boolean;
  accessKey: string;
  secretKey: string;
}

export interface StorageEnvLike {
  STORAGE_DRIVER?: string;
  S3_ENDPOINT?: string;
  S3_BUCKET?: string;
  S3_REGION?: string;
  S3_PUBLIC_URL?: string;
  S3_FORCE_PATH_STYLE?: string;
  S3_ACCESS_KEY?: string;
  S3_SECRET_KEY?: string;
}

/** 掩码占位：后台 GET 不回显原密钥；PUT 提交此值视为「未改动」 */
export const SECRET_PLACEHOLDER = '••••';

export function isSecretPlaceholder(val: unknown): boolean {
  if (val == null) return true;
  const s = String(val);
  return s === '' || s === SECRET_PLACEHOLDER || /^•+$/.test(s);
}

/**
 * 从 site_config map + env 解析存储配置。
 * site 键优先；空串视为未配置 → 回退 env。
 */
export function resolveStorageConfig(
  site: Record<string, string | null | undefined> = {},
  env: StorageEnvLike = process.env as StorageEnvLike,
): StorageResolvedConfig {
  const pick = (siteKey: string, envVal: string | undefined, fallback = '') => {
    const s = site[siteKey];
    if (s != null && String(s).length > 0) return String(s);
    return envVal || fallback;
  };

  const accessKey = pick('s3_access_key', env.S3_ACCESS_KEY, '');
  const secretKey = pick('s3_secret_key', env.S3_SECRET_KEY, '');
  const endpoint = pick('s3_endpoint', env.S3_ENDPOINT, 'http://127.0.0.1:9000');
  const bucket = pick('s3_bucket', env.S3_BUCKET, 'hahasns');
  const region = pick('s3_region', env.S3_REGION, 'us-east-1');
  const publicUrl = pick('s3_public_url', env.S3_PUBLIC_URL, '');

  let forcePathStyle: boolean;
  if (site.s3_force_path_style === '1' || site.s3_force_path_style === '0') {
    forcePathStyle = site.s3_force_path_style === '1';
  } else {
    forcePathStyle = (env.S3_FORCE_PATH_STYLE || 'true') === 'true';
  }

  let driver: StorageDriver;
  const siteDriver = (site.storage_driver || '').toLowerCase();
  if (siteDriver === 'local' || siteDriver === 's3') {
    driver = siteDriver;
  } else if (env.STORAGE_DRIVER === 'local' || env.STORAGE_DRIVER === 's3') {
    driver = env.STORAGE_DRIVER;
  } else {
    driver = accessKey ? 's3' : 'local';
  }

  return {
    driver,
    endpoint,
    bucket,
    region,
    publicUrl,
    forcePathStyle,
    accessKey,
    secretKey,
  };
}

/**
 * 配置缺陷预警（driver=s3 时的静默隐患），供后台「测试连接」展示。
 * 纯函数，无 I/O；入参与 resolveStorageConfig 相同，保证驱动判定口径一致。
 */
export function storageConfigWarnings(
  site: Record<string, string | null | undefined> = {},
  env: StorageEnvLike = {},
): string[] {
  const cfg = resolveStorageConfig(site, env);
  if (cfg.driver !== 's3') return [];
  const warnings: string[] = [];
  const siteEndpoint = site.s3_endpoint;
  const endpointSet =
    (siteEndpoint != null && String(siteEndpoint).length > 0) || !!env.S3_ENDPOINT;
  if (!endpointSet) {
    warnings.push('未配置 S3 Endpoint，正在使用默认地址 http://127.0.0.1:9000，仅供本地 MinIO 调试用。');
  }
  if (!cfg.publicUrl) {
    warnings.push('未配置访问域名（Public URL）。七牛云等私有桶生成的文件地址无法公开访问，请填写 CDN 或桶绑定域名。');
  }
  return warnings;
}

/** 某项配置最终取自哪里：后台设置 / 环境变量 / 内置默认 */
export type StorageConfigSource = 'site' | 'env' | 'default';

export interface StorageSourceMap {
  driver: StorageConfigSource;
  endpoint: StorageConfigSource;
  bucket: StorageConfigSource;
  region: StorageConfigSource;
  publicUrl: StorageConfigSource;
  forcePathStyle: StorageConfigSource;
  accessKey: StorageConfigSource;
  secretKey: StorageConfigSource;
}

/**
 * 逐项判定配置来源，口径与 resolveStorageConfig 严格一致。
 * 后台面板据此告诉站长「这个值是我填的，还是 .env 带进来的」——
 * 用 env 部署时后台字段全空，不标来源就会被误读成「没配对象存储」。
 */
export function resolveStorageSources(
  site: Record<string, string | null | undefined> = {},
  env: StorageEnvLike = {},
): StorageSourceMap {
  const pick = (siteKey: string, envVal: string | undefined): StorageConfigSource => {
    const s = site[siteKey];
    if (s != null && String(s).length > 0) return 'site';
    return envVal ? 'env' : 'default';
  };

  const siteDriver = (site.storage_driver || '').toLowerCase();
  let driver: StorageConfigSource;
  if (siteDriver === 'local' || siteDriver === 's3') driver = 'site';
  else if (env.STORAGE_DRIVER === 'local' || env.STORAGE_DRIVER === 's3') driver = 'env';
  else driver = 'default'; // 兜底按「有无 AccessKey」推断

  let forcePathStyle: StorageConfigSource;
  if (site.s3_force_path_style === '1' || site.s3_force_path_style === '0') forcePathStyle = 'site';
  else if (env.S3_FORCE_PATH_STYLE) forcePathStyle = 'env';
  else forcePathStyle = 'default';

  return {
    driver,
    endpoint: pick('s3_endpoint', env.S3_ENDPOINT),
    bucket: pick('s3_bucket', env.S3_BUCKET),
    region: pick('s3_region', env.S3_REGION),
    publicUrl: pick('s3_public_url', env.S3_PUBLIC_URL),
    forcePathStyle,
    accessKey: pick('s3_access_key', env.S3_ACCESS_KEY),
    secretKey: pick('s3_secret_key', env.S3_SECRET_KEY),
  };
}

/** 配置指纹：变化时重建 S3Client */
export function storageConfigHash(c: StorageResolvedConfig): string {
  return [
    c.driver, c.endpoint, c.bucket, c.region, c.publicUrl,
    c.forcePathStyle ? '1' : '0', c.accessKey, c.secretKey,
  ].join('|');
}

/** 密钥写入：占位/空 → 保留旧值；新值 → 使用新值 */
export function resolveSecretWrite(incoming: unknown, existing: string | null | undefined): string | null {
  if (isSecretPlaceholder(incoming)) {
    return existing != null ? String(existing) : null; // null = 不写入
  }
  return String(incoming);
}
