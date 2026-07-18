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
 * 凭据来源（后者不覆盖前者）：进程 env → 仓库根 .env → server-nest/.env →
 *   server-nest/.nest-env（systemd EnvironmentFile）→ 库中 site_config 的 s3_* 键
 *
 * 用法：
 *   node server-nest/scripts/migrate-uploads-to-s3.mjs
 *   node server-nest/scripts/migrate-uploads-to-s3.mjs --execute
 *   node server-nest/scripts/migrate-uploads-to-s3.mjs --execute --yes
 *   node server-nest/scripts/migrate-uploads-to-s3.mjs --rollback <manifest.json>
 *
 * 选项：
 *   --execute          真正上传并改库（默认 dry-run，只预览不写）
 *   --yes              配合 --execute，跳过确认
 *   --rewrite-missing  库中引用了但本地 uploads 里没有的文件，也按 publicUrlFor 重写到桶
 *                      （默认跳过并打印 missing 警告汇总；重写后这些对象在桶里 404，慎用）
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
const REWRITE_MISSING = args.has('--rewrite-missing');

if (args.has('--help') || args.has('-h')) {
  console.log(`将本地 /uploads 文件迁移到 S3 兼容桶，并重写库中媒体路径。默认 dry-run。

用法: node server-nest/scripts/migrate-uploads-to-s3.mjs [选项]
  --execute          真正上传并改库（默认 dry-run，只预览不写）
  --yes              配合 --execute，跳过确认
  --rewrite-missing  库中引用了但本地 uploads 里没有的文件，也按 publicUrlFor 重写到桶
                     （默认跳过并打印 missing 警告汇总；重写后这些对象在桶里 404，慎用）
  --rollback <file>  按回滚清单（执行时自动生成）还原库中路径
  --help, -h         显示本帮助

覆盖的库列: posts.media / threads.media / users.avatar / users.cover /
  articles.cover / site_config.value / messages.content(type=image)
环境变量: S3_ENDPOINT S3_BUCKET S3_REGION S3_ACCESS_KEY S3_SECRET_KEY
  S3_PUBLIC_URL S3_FORCE_PATH_STYLE DB_* UPLOADS_DIR
凭据来源: 进程 env → 根 .env → server-nest/.env → server-nest/.nest-env → site_config(s3_*)`);
  process.exit(0);
}

const UPLOADS_DIR =
  process.env.UPLOADS_DIR ||
  path.resolve(__dirname, '../uploads'); // server-nest/uploads —— 与 StorageService 本地默认一致（旧 ../../server/uploads 指向已退役目录）

function loadEnvFiles() {
  for (const p of [
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../.nest-env'), // env1 的 systemd EnvironmentFile
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

// 按扩展名给对象设 Content-Type（否则 MinIO/S3 默认 octet-stream，浏览器可能不内联渲染）
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg' };
function contentTypeFor(name) {
  const ext = path.extname(name || '').slice(1).toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

function connectDb() {
  const mysql = require('mysql2/promise');
  return mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'hahasns',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hahasns',
  });
}

// 解析 `--rollback <file>` 或 `--rollback=<file>`
function getRollbackArg() {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--rollback');
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--')) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith('--rollback='));
  return eq ? eq.slice('--rollback='.length) : null;
}

// 用回滚清单把库中媒体路径还原为迁移前的值
async function runRollback(file) {
  const abs = path.resolve(process.cwd(), file);
  if (!fs.existsSync(abs)) { console.error(`[rollback] 找不到回滚清单: ${abs}`); process.exit(1); }
  const entries = JSON.parse(fs.readFileSync(abs, 'utf8'));
  console.log(`[rollback] 从 ${abs} 还原 ${entries.length} 行…`);
  const db = await connectDb();
  let n = 0;
  for (const e of entries) {
    const pkCol = e.pkCol || 'id';           // 兼容旧清单(只有 id)
    const pk = e.pk !== undefined ? e.pk : e.id;
    await db.query(`UPDATE \`${e.table}\` SET \`${e.column}\` = ? WHERE \`${pkCol}\` = ?`, [e.from, pk]);
    n++;
  }
  await db.end();
  console.log(`[rollback] 已还原 ${n} 行`);
}

async function main() {
  loadEnvFiles();
  const rollbackFile = getRollbackArg();
  if (rollbackFile) { await runRollback(rollbackFile); return; }
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
  try { db = await connectDb(); console.log('[migrate-uploads] DB 已连接'); }
  catch (e) { console.warn('[migrate-uploads] 无法连接 DB，将只处理文件（不重写路径）:', e.message); }

  // 凭据回退：env/.env/.nest-env 都没配 S3 accessKey 时，读库中 site_config 的 s3_* 键
  // （后台「存储设置」保存的那份；只读不写，dry-run 同样安全）
  if (db && !cfg.accessKey) {
    try {
      const [rows] = await db.query("SELECT `key` AS k, `value` AS v FROM site_config WHERE `key` LIKE 's3\\_%'");
      const site = Object.fromEntries(rows.map((r) => [r.k, r.v]));
      if (site.s3_endpoint) cfg.endpoint = site.s3_endpoint;
      if (site.s3_bucket) cfg.bucket = site.s3_bucket;
      if (site.s3_region) cfg.region = site.s3_region;
      if (site.s3_public_url) cfg.publicUrl = site.s3_public_url;
      if (site.s3_force_path_style === '1' || site.s3_force_path_style === '0') {
        cfg.forcePathStyle = site.s3_force_path_style === '1';
      }
      if (site.s3_access_key) cfg.accessKey = site.s3_access_key;
      if (site.s3_secret_key) cfg.secretKey = site.s3_secret_key;
      if (cfg.accessKey) console.log('[migrate-uploads] env 未提供 S3 凭据，已从 site_config(s3_*) 读取');
    } catch (e) {
      console.warn(`[migrate-uploads] site_config 读取 S3 配置失败: ${e.message}`);
    }
  }

  if (!DRY_RUN && (!cfg.accessKey || !cfg.secretKey)) {
    console.error('[migrate-uploads] 缺少 S3_ACCESS_KEY / S3_SECRET_KEY，中止');
    process.exit(1);
  }
  if (DRY_RUN && (!cfg.accessKey || !cfg.secretKey)) {
    console.warn('[migrate-uploads] dry-run：未配置 S3 凭据，仅列出本地文件与将要生成的 URL 形态');
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
        ContentType: contentTypeFor(f),
      }),
    );
    uploaded++;
    console.log(`  uploaded ${f}`);
  }

  // 重写常见媒体列
  const rewrites = [];
  const missing = new Map(); // key → 引用次数：库中引用了但本地 uploads 没有（即未实际上传成功）的文件
  // 库路径 → 桶 URL。文件未上传成功时默认返回 null（跳过该条，避免把路径改到桶里不存在的对象）；
  // 只有显式 --rewrite-missing 才按 publicUrlFor 重写。
  const resolveUrl = (k) => {
    const u = keyToUrl.get(k);
    if (u) return u;
    if (!REWRITE_MISSING) { missing.set(k, (missing.get(k) || 0) + 1); return null; }
    return publicUrlFor(k, cfg);
  };
  async function scanAndRewrite(table, column, pk = 'id', where = '') {
    if (!db) return;
    const [rows] = await db.query(`SELECT \`${pk}\` AS pk, \`${column}\` AS val FROM \`${table}\` WHERE \`${column}\` IS NOT NULL AND \`${column}\` != ''${where}`);
    for (const row of rows) {
      let val = row.val;
      let changed = false;
      // JSON 数组媒体（post.media 等）
      if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
        try {
          const parsed = JSON.parse(val);
          const walk = (node) => {
            if (typeof node === 'string' && isLocalUploadPath(node)) {
              const nu = resolveUrl(keyFromLocal(node));
              if (nu == null) return node; // missing：保持原值不改
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
            rewrites.push({ table, pk: row.pk, pkCol: pk, column, from: val, to: JSON.stringify(next) });
          }
          continue;
        } catch { /* fallthrough string */ }
      }
      if (typeof val === 'string' && isLocalUploadPath(val)) {
        const nu = resolveUrl(keyFromLocal(val));
        if (nu == null) continue; // missing：跳过该条
        rewrites.push({ table, pk: row.pk, pkCol: pk, column, from: val, to: nu });
      }
    }
  }

  const targets = [
    ['posts', 'media', 'id'],
    ['threads', 'media', 'id'], // 论坛帖媒体，与 posts.media 同构的 JSON 数组
    ['users', 'avatar', 'id'],
    ['users', 'cover', 'id'],
    ['articles', 'cover', 'id'],
    ['site_config', 'value', 'key'], // logo/favicon 等；site_config 主键是 key 不是 id
    // 私信图片：type='image' 时 content 存的是 /uploads/... 纯路径字符串（非 JSON）
    ['messages', 'content', 'id', " AND type='image' AND content LIKE '/uploads/%'"],
  ];
  for (const [t, c, pk, where] of targets) {
    try { await scanAndRewrite(t, c, pk, where); } catch (e) {
      console.warn(`[migrate-uploads] skip ${t}.${c}: ${e.message}`);
    }
  }

  console.log(`[migrate-uploads] 待重写路径: ${rewrites.length}`);
  for (const r of rewrites.slice(0, 20)) {
    console.log(`  ${r.table}#${r.pk}.${r.column}: ${String(r.from).slice(0, 60)} → ${String(r.to).slice(0, 80)}`);
  }
  if (rewrites.length > 20) console.log(`  ... +${rewrites.length - 20} more`);

  if (missing.size) {
    const total = [...missing.values()].reduce((a, b) => a + b, 0);
    console.warn(`[migrate-uploads] ⚠ missing: ${missing.size} 个 key（共 ${total} 处引用）在本地 uploads 中不存在、未上传成功，已跳过不改库：`);
    for (const [k, n] of [...missing.entries()].slice(0, 20)) console.warn(`  missing ${k}${n > 1 ? ` (×${n})` : ''}`);
    if (missing.size > 20) console.warn(`  ... +${missing.size - 20} more`);
    console.warn('[migrate-uploads] 如确认要把这些路径也重写到桶（对象将 404），请加 --rewrite-missing');
  }

  if (!DRY_RUN && db) {
    // 改库前先落回滚清单（记录每行改前的值），出问题可 --rollback 还原
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const manifestPath = path.resolve(process.cwd(), `migrate-rollback-${stamp}.json`);
    try {
      fs.writeFileSync(manifestPath, JSON.stringify(rewrites.map((r) => ({ table: r.table, pk: r.pk, pkCol: r.pkCol, column: r.column, from: r.from })), null, 2));
      console.log(`[migrate-uploads] 回滚清单已写: ${manifestPath}`);
      console.log(`[migrate-uploads] 如需还原: node server-nest/scripts/migrate-uploads-to-s3.mjs --rollback ${manifestPath}`);
    } catch (e) {
      console.warn(`[migrate-uploads] 回滚清单写入失败（仍将继续改库）: ${e.message}`);
    }
    for (const r of rewrites) {
      await db.query(`UPDATE \`${r.table}\` SET \`${r.column}\` = ? WHERE \`${r.pkCol || 'id'}\` = ?`, [r.to, r.pk]);
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
