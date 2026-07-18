/**
 * Centralized, env-driven configuration. Loaded once via @nestjs/config.
 * Mirrors the knobs the Express server exposed, plus the new
 * MySQL/Postgres + Redis + S3 infrastructure for the NestJS migration.
 */
import { DEV_JWT_PLACEHOLDER } from '../common/jwt-secret.guard';

export default () => ({
  port: parseInt(process.env.PORT || '4000', 10),

  jwt: {
    // 未设 JWT_SECRET 时回退到公开占位串；main.ts 启动守卫会据此 fail-fast（除非显式放行）。
    secret: process.env.JWT_SECRET || DEV_JWT_PLACEHOLDER,
    // matches the Express server's 30d token lifetime
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  },

  database: {
    // env-driven driver switch: 'mysql' | 'postgres'
    client: (process.env.DB_CLIENT || 'mysql').toLowerCase(),
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(
      process.env.DB_PORT ||
        ((process.env.DB_CLIENT || 'mysql').toLowerCase() === 'postgres'
          ? '5432'
          : '3306'),
      10,
    ),
    username: process.env.DB_USER || 'hahasns',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hahasns',
    // dev convenience — keep OFF in production, use migrations instead
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    // default cache TTL in milliseconds
    ttl: parseInt(process.env.REDIS_TTL || '30000', 10),
  },

  s3: {
    // 只保留显式值：默认地址由 storage-config.resolveStorageConfig 统一兜底，
    // 若在此预填默认会掩盖「用户未配置」，导致 testConnection 预警失效。
    endpoint: process.env.S3_ENDPOINT || '',
    bucket: process.env.S3_BUCKET || 'hahasns',
    accessKey: process.env.S3_ACCESS_KEY || '',
    secretKey: process.env.S3_SECRET_KEY || '',
    region: process.env.S3_REGION || 'us-east-1',
    // rustfs / MinIO need path-style addressing
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE || 'true') === 'true',
    // public base URL used to build returned media URLs (CDN or gateway)
    publicUrl: process.env.S3_PUBLIC_URL || '',
  },
});
