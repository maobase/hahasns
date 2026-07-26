# Configuration & Maintenance

> 🧭 **不确定用哪种装法？** 先看 [安装方式速览](../README.md#-快速开始) 对号入座。
> 分路：[图形面板 · 1Panel](INSTALL-1panel.md) / [宝塔](INSTALL-bt.md)（**非技术用户推荐**） · [命令行 · Docker / 裸机](DEPLOY.md) · [完整安装手册](INSTALL.md) · [让 AI 助手代装](DEPLOY-AI.md) · [配置与维护参考](CONFIGURATION.md)


Runtime configuration, the admin account, content filtering, file uploads, and backup for a HahaSNS deployment. For first-time install and run instructions see [`INSTALL.md`](INSTALL.md); for deployment see [`DEPLOY.md`](DEPLOY.md).

> **架构**：后端为 **NestJS 10 + TypeORM 0.3 + MySQL/MariaDB（mysql2）+ Redis（缓存）+ 存储驱动（本地磁盘或 S3）**，源码位于 `server-nest/`。单个 Node 进程在 `PORT` 上同时伺服 SPA（`client/dist`，由 `CLIENT_DIST` 指定）、`/api` 接口与 `/uploads` 静态文件。完整变量见 `server-nest/.env.example` 与 [INSTALL-1panel.md](INSTALL-1panel.md)。

## Environment variables

HahaSNS reads configuration from process environment variables (copy `server-nest/.env.example` to `.env`). Production deployments **must** set `JWT_SECRET` and the database credentials.

| Variable | Default | Description |
| --- | --- | --- |
| `JWT_SECRET` | `change-me-to-a-long-random-string` | Secret used to sign and verify JWT auth tokens. **In production you MUST set a strong, random value** (e.g. a long random string from a password manager or `openssl rand`). Anyone who knows the secret can forge login tokens for any account, so treat it like a password and never commit it. Changing the secret invalidates all existing sessions. |
| `JWT_EXPIRES_IN` | `30d` | Token lifetime. |
| `SEED_ADMIN_USER` / `SEED_ADMIN_PASSWORD` | — | Optional first-run admin bootstrap. If **both** are set and the DB has no admin yet, an admin account is auto-created on startup (no manual SQL). Ignored once any admin exists. Change the password after first login; you can drop these vars afterwards. |
| `PORT` | `4000` | TCP port the Node process listens on (serves the SPA + `/api` + `/uploads`). |
| `TRUST_PROXY` | — | Unset = direct exposure (`req.ip` = socket IP). Behind a reverse proxy set `1` (trust first hop) or `loopback` so `req.ip` reads `X-Forwarded-For` — needed for per-IP registration rate-limiting to see the real client. |
| `DB_CLIENT` | `mysql` | Database driver. |
| `DB_HOST` | `127.0.0.1` | Database host. |
| `DB_PORT` | `3306` | Database port. |
| `DB_USER` | `hahasns` | Database user. |
| `DB_PASSWORD` | — | Database password. |
| `DB_NAME` | `hahasns` | Database name. |
| `DB_SYNCHRONIZE` | `false` | When `true`, TypeORM auto-creates/updates tables from the entities on startup — convenient for the **first run** of a fresh install. **Set it back to `false` afterwards** so schema isn't auto-altered in production. |
| `DB_LOGGING` | `false` | Log SQL queries. |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis connection used for caching. |
| `REDIS_TTL` | `30000` | Default cache TTL in milliseconds. |
| `CLIENT_DIST` | `client/dist` (relative to the build) | Path to the built frontend (`client/dist`) served as the SPA. |
| `UPLOADS_DIR` | `uploads` (relative to the build) | Directory where uploaded media is stored (served at `/uploads`). |
| `STORAGE_DRIVER` | auto (`s3` if S3 keys present, else `local`) | Storage backend: `local` (write to `UPLOADS_DIR`) or `s3`. |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_REGION` / `S3_FORCE_PATH_STYLE` / `S3_PUBLIC_URL` | — | S3-compatible object storage settings, used when `STORAGE_DRIVER=s3` (works with AWS S3, MinIO, rustfs, etc.). |
| `ANTHROPIC_API_KEY` | — | Optional. Enables the AI assistant; without it the assistant runs in a demo/placeholder mode. |
| `AVATAR_PROVIDER` | — | Optional. Unset = new users get a locally rendered initial-and-gradient avatar (no external request). Set `pravatar` to go back to `i.pravatar.cc` random avatars. |

Set them via a real secrets mechanism — a `.env` file with restricted permissions, systemd `Environment=`, a container secret, etc. — rather than inlining values in scripts you commit.

> **docker compose 路径下的一个坑**：仓库的 `docker-compose.yml` 没有 `env_file:`，容器里能看到哪些变量
> 完全由 `app` 服务的 `environment:` 块决定——**那是一份白名单**。往 `.env` 里写一个 compose 没声明的变量，
> 它不会进容器，也不会报错，只是静默不生效。所以自己加变量时要连 compose 一起改（上表里的变量都已透传）。
> 用 `docker compose config` 可以看到最终真正注入的值。

## Admin account

A fresh install starts with no users and no built-in admin / default password. Two ways to get the first admin:

**A. Auto-bootstrap (no SQL).** Set `SEED_ADMIN_USER` and `SEED_ADMIN_PASSWORD` before first start; if the DB has no admin yet, that account is created automatically on startup (idempotent — ignored once an admin exists). Log in and change the password, then you may remove the two vars.

**B. Promote manually.** Register an account through the normal sign-up flow, then set its role to `admin`:

```sql
UPDATE users SET role = 'admin' WHERE username = '<your-username>';
```

After that, log in and use the admin panel for site operation and moderation. The public is expected to register their own accounts; admin accounts are only for operating the site.

> **Security:** choose a strong password for the admin account, since it has full control over the site. Because there is no shipped default credential, an instance is not "open" out of the box — but never give admin to an account whose password you wouldn't trust on a public service.

## Deployment self-check（部署自检）

The admin panel's「系统 → 系统更新」page runs a **deployment self-check** (`GET /api/admin/system/deploy-check`) covering the environment-level mistakes that otherwise only ever appear in the server's stdout — where an operator deploying through 1Panel or 宝塔 will never see them. Each item reports what was observed and which variable to change:

| Check | Flags |
| --- | --- |
| 登录令牌密钥 | `ALLOW_INSECURE_JWT_SECRET=true` — the public placeholder secret is in use, so anyone can forge an admin token. |
| 访客真实 IP | Requests arrived carrying `X-Forwarded-For` but `TRUST_PROXY` is unset, so every visitor looks like the proxy and per-IP rate limiting is inert. The process records whether it has *actually seen* a forwarded request, so this is an observation, not a guess. |
| 表结构自动同步 | `DB_SYNCHRONIZE` is still `true` — TypeORM re-shapes the schema on every start. |
| 首启管理员种子 | `SEED_ADMIN_PASSWORD` is still in the environment after the admin exists (the value itself is never echoed back). |
| 运行模式 | `NODE_ENV` is not `production`. |
| 缓存（Redis） | A set/get/del round-trip through the cache failed. |
| 媒体存储 | Local uploads directory not writable, or the storage panel has pending warnings; plus a separate item when the driver is `s3` but local files still haven't been migrated. |

The overall verdict is the most severe single item (`ok` / `warn` / `fail`).

## Admin site settings（站点设置）

A number of site-wide settings are configurable at runtime from the admin panel — no code change or restart needed. They are persisted in the generic `site_config` key/value table, so **adding or changing a setting needs no DB migration**. Admins read/write them via `GET /api/admin/config` and `PUT /api/admin/config`; the public-facing values are exposed through `GET /api/site`.

| Setting | What it controls |
| --- | --- |
| **模块（modules）** | Enable/disable site modules (features). |
| **外观（appearance）** | Site appearance (e.g. name, default skin). |
| **安全（security）** | Security toggles (e.g. content filter / moderation switches). |
| **布局（layout）** | Per-page layout, stored as `site_config` keys `layout_<page>` with values `default`（三栏）/ `wide`（宽屏）/ `narrow`（居中）. Covered pages include collections, nav, mall, circles, achievements, member, bookmarks, history, settings, changelog and thread. `GET /api/site` returns these as a `layouts` map; the frontend `useLayout(key, fallback)` reads them so layout can be switched from the admin「布局」tab without code changes. |

## Initial data (fresh install starts empty)

There are no seed scripts in this version — **a fresh install starts with an empty database.** On first run with `DB_SYNCHRONIZE=true`, TypeORM creates the schema (see [Database & backup](#database--backup) below); the tables are then empty.

To get going, register the first account through the normal sign-up flow and promote it to admin (see [Admin account](#admin-account)). All other content — boards, topics, mall products, etc. — is then created through the app and the admin panel.

## Sensitive-word content filter

User-generated text is screened by a lightweight content filter. It normalizes input (lowercasing and stripping spacing/punctuation between characters to resist evasion) and checks it against a sensitive-word list covering common moderation categories.

The filter is applied on content-creation endpoints (posts, comments, threads, messages, etc.): submissions that match are rejected with a validation error so the content is never stored.

The word list is **configurable at runtime** from the admin「安全」(security) panel — it is stored in the `site_config` table, so tuning moderation for your community needs no code change, redeploy, or restart. Note this is a demo-grade filter, not a substitute for full moderation tooling.

## File uploads

Image/file uploads are handled by the storage driver selected with `STORAGE_DRIVER`:

- **`local`** (default when no S3 keys are configured): files are written to the `UPLOADS_DIR` directory and served statically at the `/uploads` URL path.
- **`s3`**: files are uploaded to an S3-compatible bucket configured by the `S3_*` variables (AWS S3, MinIO, rustfs, etc.) and served from the bucket's public URL.

The database stores references (URLs) to these files, not the file contents themselves. With the `local` driver, treat `UPLOADS_DIR` as part of your data when backing up or migrating (see below); with `s3`, the bucket holds the media.

Storage can also be configured **at runtime from the admin「系统 → 存储」panel** (stored in `site_config`, applied without a restart). Per field, the admin value wins and a blank field falls back to the environment variable, so a deployment that ships `S3_*` in `.env` keeps working while individual values are overridden from the UI. The panel's「当前生效」card labels every value with where it came from (后台设置 / 环境变量 / 默认值), shows a sample file URL, and「测试连接」round-trips a probe object through the bucket in three steps — write, read back over the *public* URL, delete — so a private bucket or a mis-bound CDN is reported as「部分通过」instead of passing silently and breaking every image at post time. A failed connection is translated into which field to fix (missing bucket, bad key, signature mismatch, wrong region, DNS failure…), with the raw SDK error kept in parentheses. Saving a blank secret **keeps the stored value** (so a stray save can't wipe your keys), which means the only way back to the `.env` copy is the panel's「清除后台设置」button — it deletes every storage key from `site_config`, including credentials, and is only shown when the admin panel actually has something stored. Existing local files do not move on their own — run `server-nest/scripts/migrate-uploads-to-s3.mjs` (dry-run by default, `--execute --yes` to apply, `--rollback <file>` to revert); while the local uploads directory still holds files, the panel says how many are left behind and shows the command. The rollback manifest is written to the current directory, which inside a container is the **writable layer, not a volume** — it looks written but disappears on the next `docker compose up -d --build`. On the compose path pass `--manifest-dir /app/manifests` (the shipped `docker-compose.yml` bind-mounts it to `.migrate-manifests/` on the host); the script detects a non-persistent target and prints the `docker cp` command to rescue the file.

## Database & backup

HahaSNS stores its data in a **MySQL/MariaDB** database (configured by the `DB_*` variables). On the first run with `DB_SYNCHRONIZE=true`, TypeORM creates and updates the tables from the entity definitions — there is no separate migration step for a fresh install. Set `DB_SYNCHRONIZE=false` afterwards so the schema isn't auto-altered in production.

**What to back up**

- The **MySQL/MariaDB database** (all application data).
- The user-uploaded media — the `UPLOADS_DIR` directory when using the `local` storage driver, or the S3 bucket when using `s3`.

**How to back up safely**

Dump the database with `mysqldump`, then back up the media separately. For example:

```bash
# database dump
mysqldump -u "$DB_USER" -p "$DB_NAME" > hahasns-backup.sql

# local uploads (local storage driver)
tar -czf hahasns-uploads.tar.gz -C "$UPLOADS_DIR" .
```

Restore by importing the SQL dump into a database of the same name (`mysql -u "$DB_USER" -p "$DB_NAME" < hahasns-backup.sql`) and putting the media back in `UPLOADS_DIR` (or restoring the S3 bucket). The database holds only URL references to media, so the two must be kept in sync.
