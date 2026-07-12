#!/usr/bin/env node
/**
 * 将本地 /uploads 文件迁移到 S3 兼容桶，并重写库中媒体路径。
 *
 * 默认 --dry-run（不上传、不写库）。加 --execute 才真正执行。
 * 幂等：已是 http(s) 完整 URL 的路径跳过；本地 /uploads/xxx 才迁移。
 *
 * 环境变量：与 StorageService 一致
 *   S3_ENDPOINT S3_BUCKET S3_REGION S3_ACCESS_KEY S3_SECRET_KEY
 *   S3_PUBLIC_URL S3_FORCE_PATH_STYLE DB_* UPLOADS_DIR
 *
 * 用法：
 *   node server-nest/scripts/migrate-uploads-to-s3.mjs
 *   node server-nest/scripts/migrate-uploads-to-s3.mjs --execute
 *   node server-nest/scripts/migrate-uploads-to-s3.mjs --execute --yes
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const args = new Set(process.argv.slice(2));
const DRY_RUN = !args.has('--execute');
const YES = args.has('--yes');

const UPLOADS_DIR =
  process.env.UPLOADS_DIR ||
  path.resolve(__dirname, '../../server/uploads');

function loadEnvFiles() {
  for (const p of [
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../.env'),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      if (process.env[m[1]] != null) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] = v;
    }
  }
}

function publicUrlFor(key, cfg) {
  if (cfg.publicUrl) return `${cfg.publicUrl.replace(/\/$/, '')}/${key}`;
  const base = cfg.endpoint.replace(/\/$/, '');
  return cfg.forcePathStyle
    ? `${base}/${cfg.bucket}/${key}`
    : `${base.replace('://', `://${cfg.bucket}.`)}/${key}`;
}

function isLocalUploadPath(url) {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith('/uploads/') || url.startsWith('uploads/');
}

function keyFromLocal(url) {
  return url.replace(/^\/?uploads\//, '');
}

async function main() {
  loadEnvFiles();
  console.log(`[migrate-uploads] mode=${DRY_RUN ? 'DRY-RUN (default)' : 'EXECUTE'}`);
  console.log(`[migrate-uploads] uploadsDir=${UPLOADS_DIR}`);

  const cfg = {
    endpoint: process.env.S3_ENDPOINT || 'http://127.0.0.1:9000',
    bucket: process.env.S3_BUCKET || 'hahasns',
    region: process.env.S3_REGION || 'us-east-1',
    accessKey: process.env.S3_ACCESS_KEY || '',
    secretKey: process.env.S3_SECRET_KEY || '',
    publicUrl: process.env.S3_PUBLIC_URL || '',
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE || 'true') === 'true',
  };

  if (!DRY_RUN && (!cfg.accessKey || !cfg.secretKey)) {
    console.error('[migrate-uploads] 缺少 S3_ACCESS_KEY / S3_SECRET_KEY，中止');
    process.exit(1);
  }
  if (DRY_RUN && (!cfg.accessKey || !cfg.secretKey)) {
    console.warn('[migrate-uploads] dry-run：未配置 S3 凭据，仅列出本地文件与将要生成的 URL 形态');
  }

  let files = [];
  if (fs.existsSync(UPLOADS_DIR)) {
    files = fs.readdirSync(UPLOADS_DIR).filter((f) => {
      const full = path.join(UPLOADS_DIR, f);
      return fs.statSync(full).isFile() && !f.startsWith('.');
    });
  }
  console.log(`[migrate-uploads] 本地文件数: ${files.length}`);

  // DB：尽量用 mysql2（项目默认）；无则只迁移文件不写库
  let db = null;
  try {
    const mysql = require('mysql2/promise');
    db = await mysql.createConnection({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'hahasns',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'hahasns',
    });
    console.log('[migrate-uploads] DB 已连接');
  } catch (e) {
    console.warn('[migrate-uploads] 无法连接 DB，将只处理文件（不重写路径）:', e.message);
  }

  if (!DRY_RUN && !YES) {
    console.log('[migrate-uploads] 将真实上传并改库。若确认，请加 --yes');
    process.exit(0);
  }

  let S3Client, PutObjectCommand;
  if (!DRY_RUN) {
    const aws = await import('@aws-sdk/client-s3');
    S3Client = aws.S3Client;
    PutObjectCommand = aws.PutObjectCommand;
  }
  const client = !DRY_RUN
    ? new S3Client({
        endpoint: cfg.endpoint,
        region: cfg.region,
        forcePathStyle: cfg.forcePathStyle,
        credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
      })
    : null;

  const keyToUrl = new Map();
  let uploaded = 0;
  for (const f of files) {
    const full = path.join(UPLOADS_DIR, f);
    const url = publicUrlFor(f, cfg);
    keyToUrl.set(f, url);
    if (DRY_RUN) {
      console.log(`  [dry-run] would upload ${f} → ${url}`);
      continue;
    }
    const body = fs.readFileSync(full);
    await client.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: f,
        Body: body,
      }),
    );
    uploaded++;
    console.log(`  uploaded ${f}`);
  }

  // 重写常见媒体列
  const rewrites = [];
  async function scanAndRewrite(table, column) {
    if (!db) return;
    const [rows] = await db.query(`SELECT id, \`${column}\` AS val FROM \`${table}\` WHERE \`${column}\` IS NOT NULL AND \`${column}\` != ''`);
    for (const row of rows) {
      let val = row.val;
      let changed = false;
      // JSON 数组媒体（post.media 等）
      if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
        try {
          const parsed = JSON.parse(val);
          const walk = (node) => {
            if (typeof node === 'string' && isLocalUploadPath(node)) {
              const k = keyFromLocal(node);
              const nu = keyToUrl.get(k) || publicUrlFor(k, cfg);
              changed = true;
              return nu;
            }
            if (Array.isArray(node)) return node.map(walk);
            if (node && typeof node === 'object') {
              const o = {};
              for (const [kk, vv] of Object.entries(node)) o[kk] = walk(vv);
              return o;
            }
            return node;
          };
          const next = walk(parsed);
          if (changed) {
            rewrites.push({ table, id: row.id, column, from: val, to: JSON.stringify(next) });
          }
          continue;
        } catch { /* fallthrough string */ }
      }
      if (typeof val === 'string' && isLocalUploadPath(val)) {
        const k = keyFromLocal(val);
        const nu = keyToUrl.get(k) || publicUrlFor(k, cfg);
        rewrites.push({ table, id: row.id, column, from: val, to: nu });
      }
    }
  }

  const targets = [
    ['posts', 'media'],
    ['users', 'avatar'],
    ['users', 'cover'],
    ['articles', 'cover'],
    ['site_config', 'value'], // logo/favicon 等
  ];
  for (const [t, c] of targets) {
    try { await scanAndRewrite(t, c); } catch (e) {
      console.warn(`[migrate-uploads] skip ${t}.${c}: ${e.message}`);
    }
  }

  console.log(`[migrate-uploads] 待重写路径: ${rewrites.length}`);
  for (const r of rewrites.slice(0, 20)) {
    console.log(`  ${r.table}#${r.id}.${r.column}: ${String(r.from).slice(0, 60)} → ${String(r.to).slice(0, 80)}`);
  }
  if (rewrites.length > 20) console.log(`  ... +${rewrites.length - 20} more`);

  if (!DRY_RUN && db) {
    for (const r of rewrites) {
      await db.query(`UPDATE \`${r.table}\` SET \`${r.column}\` = ? WHERE id = ?`, [r.to, r.id]);
    }
    console.log(`[migrate-uploads] 已重写 ${rewrites.length} 行`);
  }

  if (db) await db.end();
  console.log(`[migrate-uploads] done. uploaded=${uploaded} dryRun=${DRY_RUN}`);
  if (DRY_RUN) {
    console.log('[migrate-uploads] 这是 dry-run。确认后执行: node server-nest/scripts/migrate-uploads-to-s3.mjs --execute --yes');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
