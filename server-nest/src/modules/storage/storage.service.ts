import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { extname, join } from 'node:path';
import * as fs from 'node:fs';
import { SiteService } from '../site/site.service';
import {
  resolveStorageConfig,
  storageConfigHash,
  storageConfigWarnings,
  type StorageEnvLike,
  type StorageResolvedConfig,
} from './storage-config';

/**
 * 双模存储 local | s3。配置优先 site_config，env 回退。
 * 配置变更后按 hash 重建 S3Client。
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private uploadsDir: string;
  private client: S3Client | null = null;
  private resolved: StorageResolvedConfig | null = null;
  private cfgHash = '';
  private cfgAt = 0; // 上次从 site_config 读取配置的时间戳
  private lastSite: Record<string, string | null> = {}; // 最近一次 refresh 的原始 site 键（供 testConnection 预警判定）
  private lastEnv: StorageEnvLike = {}; // 最近一次 refresh 的原始 env（同上）
  private static readonly CONFIG_TTL_MS = 5000; // 配置缓存窗口：避免一次多图上传每文件都打 8 次 DB

  constructor(
    private readonly config: ConfigService,
    private readonly site: SiteService,
  ) {
    this.uploadsDir =
      process.env.UPLOADS_DIR || join(__dirname, '..', '..', '..', 'uploads');
  }

  onModuleInit() {
    // 启动时用 env 先建一版，后续 upload 会按 site_config 刷新
    const envS3 = this.config.get('s3') || {};
    this.applyConfig(
      resolveStorageConfig({}, {
        STORAGE_DRIVER: process.env.STORAGE_DRIVER,
        S3_ENDPOINT: envS3.endpoint,
        S3_BUCKET: envS3.bucket,
        S3_REGION: envS3.region,
        S3_PUBLIC_URL: envS3.publicUrl,
        S3_FORCE_PATH_STYLE: envS3.forcePathStyle ? 'true' : 'false',
        S3_ACCESS_KEY: envS3.accessKey,
        S3_SECRET_KEY: envS3.secretKey,
      }),
    );
  }

  private applyConfig(cfg: StorageResolvedConfig) {
    const hash = storageConfigHash(cfg);
    if (hash === this.cfgHash && this.resolved) return;
    this.resolved = cfg;
    this.cfgHash = hash;
    this.client = null;
    if (cfg.driver === 'local') {
      try {
        fs.mkdirSync(this.uploadsDir, { recursive: true });
      } catch {
        /* 已存在 */
      }
      this.logger.log(`Local storage ready (dir=${this.uploadsDir} → /uploads/*)`);
    } else {
      this.client = new S3Client({
        endpoint: cfg.endpoint,
        region: cfg.region,
        forcePathStyle: cfg.forcePathStyle,
        credentials: {
          accessKeyId: cfg.accessKey,
          secretAccessKey: cfg.secretKey,
        },
      });
      this.logger.log(
        `Object storage ready (endpoint=${cfg.endpoint} bucket=${cfg.bucket} pathStyle=${cfg.forcePathStyle})`,
      );
    }
  }

  /** 从 site_config 刷新配置（env 回退）。TTL 内复用上次结果，避免每文件重复读库；force=true 强制读最新（如后台「测试连接」）。 */
  async refreshFromSite(force = false): Promise<StorageResolvedConfig> {
    const now = Date.now();
    if (!force && this.resolved && now - this.cfgAt < StorageService.CONFIG_TTL_MS) {
      return this.resolved;
    }
    const keys = [
      'storage_driver', 's3_endpoint', 's3_bucket', 's3_region',
      's3_public_url', 's3_force_path_style', 's3_access_key', 's3_secret_key',
    ];
    const site: Record<string, string | null> = {};
    for (const k of keys) site[k] = await this.site.getConfig(k);
    const envS3 = this.config.get('s3') || {};
    const env: StorageEnvLike = {
      STORAGE_DRIVER: process.env.STORAGE_DRIVER,
      S3_ENDPOINT: envS3.endpoint || process.env.S3_ENDPOINT,
      S3_BUCKET: envS3.bucket || process.env.S3_BUCKET,
      S3_REGION: envS3.region || process.env.S3_REGION,
      S3_PUBLIC_URL: envS3.publicUrl || process.env.S3_PUBLIC_URL,
      S3_FORCE_PATH_STYLE:
        envS3.forcePathStyle != null
          ? (envS3.forcePathStyle ? 'true' : 'false')
          : process.env.S3_FORCE_PATH_STYLE,
      S3_ACCESS_KEY: envS3.accessKey || process.env.S3_ACCESS_KEY,
      S3_SECRET_KEY: envS3.secretKey || process.env.S3_SECRET_KEY,
    };
    const cfg = resolveStorageConfig(site, env);
    this.lastSite = site;
    this.lastEnv = env;
    this.applyConfig(cfg);
    this.cfgAt = now;
    return cfg;
  }

  get driver(): 's3' | 'local' {
    return this.resolved?.driver || 'local';
  }

  private buildKey(originalName: string): string {
    const ext = extname(originalName || '') || '';
    const stamp = Date.now();
    const rand = randomBytes(6).toString('hex');
    return `${stamp}-${rand}${ext}`;
  }

  private mediaType(mimetype: string): 'image' | 'video' | 'audio' | 'file' {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype.startsWith('audio/')) return 'audio';
    return 'file';
  }

  publicUrlFor(key: string): string {
    const cfg = this.resolved!;
    if (cfg.publicUrl) {
      return `${cfg.publicUrl.replace(/\/$/, '')}/${key}`;
    }
    const base = cfg.endpoint.replace(/\/$/, '');
    return cfg.forcePathStyle
      ? `${base}/${cfg.bucket}/${key}`
      : `${base.replace('://', `://${cfg.bucket}.`)}/${key}`;
  }

  async upload(file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
  }): Promise<{ url: string; type: string; name: string; key: string }> {
    await this.refreshFromSite();
    const key = this.buildKey(file.originalname);
    if (this.driver === 'local') {
      await fs.promises.writeFile(join(this.uploadsDir, key), file.buffer);
      return {
        url: `/uploads/${key}`,
        type: this.mediaType(file.mimetype),
        name: file.originalname,
        key,
      };
    }
    if (!this.client) throw new Error('S3 client not ready');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.resolved!.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );
    return {
      url: this.publicUrlFor(key),
      type: this.mediaType(file.mimetype),
      name: file.originalname,
      key,
    };
  }

  async uploadMany(
    files: { buffer: Buffer; originalname: string; mimetype: string }[],
  ) {
    return Promise.all(files.map((f) => this.upload(f)));
  }

  /** 预留：内容删除时清理对象（当前无调用方，探针删除走内联 DeleteObjectCommand）。 */
  async delete(key: string): Promise<void> {
    await this.refreshFromSite();
    if (this.driver === 'local') {
      await fs.promises.unlink(join(this.uploadsDir, key)).catch(() => undefined);
      return;
    }
    if (!this.client) return;
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.resolved!.bucket, Key: key }),
    );
  }

  /** 测试连接：上传并删除探针对象；warnings 为配置缺陷预警（不阻断，仅提示）。 */
  async testConnection(): Promise<{ ok: boolean; message: string; driver: string; warnings: string[] }> {
    const cfg = await this.refreshFromSite(true);
    const warnings = storageConfigWarnings(this.lastSite, this.lastEnv);
    if (cfg.driver === 'local') {
      try {
        fs.mkdirSync(this.uploadsDir, { recursive: true });
        const probe = join(this.uploadsDir, `.probe-${Date.now()}`);
        await fs.promises.writeFile(probe, 'ok');
        await fs.promises.unlink(probe);
        return { ok: true, message: '本地存储可写', driver: 'local', warnings };
      } catch (e: any) {
        return { ok: false, message: e?.message || '本地存储不可写', driver: 'local', warnings };
      }
    }
    try {
      const key = `._probe_${Date.now()}.txt`;
      await this.client!.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: Buffer.from('hahasns-probe'),
          ContentType: 'text/plain',
        }),
      );
      await this.client!.send(
        new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }),
      );
      return { ok: true, message: `S3 连接成功（${cfg.endpoint} / ${cfg.bucket}）`, driver: 's3', warnings };
    } catch (e: any) {
      return { ok: false, message: e?.message || 'S3 连接失败', driver: 's3', warnings };
    }
  }
}
