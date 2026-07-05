#!/usr/bin/env bash
#
# HahaSNS 一键升级脚本 —— 拉取最新代码 → 备份数据库 → 版本化迁移 → 重建 → 重启。
# 从仓库根目录运行：  ./upgrade.sh
#
# 支持两种部署形态（DEPLOY_MODE）：
#   baremetal（默认）：宿主机直接跑 Node（systemd / pm2 / 手动）。脚本负责构建 + 迁移 + 重启。
#   docker         ：docker compose 部署。脚本负责备份 + 触发 `docker compose up -d --build`
#                    （容器内构建；设 DB_MIGRATIONS_RUN=true 让容器启动自动跑迁移）。
#
# 配置：把 DB 连接、重启方式等写进仓库根的 upgrade.env（不入 git），或直接用环境变量。详见 UPGRADE.md。
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# ---- 载入配置：upgrade.env 优先，其次 server-nest/.env（取 DB 连接） ----
[ -f "$ROOT/upgrade.env" ] && { set -a; . "$ROOT/upgrade.env"; set +a; }
[ -f "$ROOT/server-nest/.env" ] && { set -a; . "$ROOT/server-nest/.env"; set +a; }

DEPLOY_MODE="${DEPLOY_MODE:-baremetal}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmjs.org}"
DB_CLIENT="${DB_CLIENT:-mysql}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-hahasns}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-hahasns}"
RESTART_CMD="${RESTART_CMD:-}"                 # 例：sudo systemctl restart hahasns
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DB_CONTAINER="${DB_CONTAINER:-}"               # docker 模式下备份用的 DB 容器名（留空则跳过备份）
SKIP_BACKUP="${SKIP_BACKUP:-0}"
SKIP_CLIENT="${SKIP_CLIENT:-0}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/.upgrade-backups}"

log()  { echo "[upgrade $(date +%H:%M:%S)] $*"; }
fail() { echo "[upgrade ✗] $*" >&2; exit 1; }

# mysql/mysqldump 客户端可执行名（mariadb 环境常为 mariadb / mariadb-dump）
MYSQL_BIN="$(command -v mysql || command -v mariadb || true)"
DUMP_BIN="$(command -v mysqldump || command -v mariadb-dump || true)"
db()   { "$MYSQL_BIN" -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} "$DB_NAME" -N -s "$@"; }

FROM_COMMIT="$(git rev-parse --short HEAD)"
log "部署形态 $DEPLOY_MODE ｜ 当前版本 $FROM_COMMIT"

# ===== 1. 备份数据库 =====
backup_db() {
  [ "$SKIP_BACKUP" = "1" ] && { log "跳过备份 (SKIP_BACKUP=1)"; return 0; }
  [ "$DB_CLIENT" != "mysql" ] && { log "非 mysql 驱动，跳过内置备份（请自行备份 PostgreSQL）"; return 0; }
  mkdir -p "$BACKUP_DIR"
  local bk="$BACKUP_DIR/db-$(date +%Y%m%d-%H%M%S).sql"
  if [ "$DEPLOY_MODE" = "docker" ] && [ -n "$DB_CONTAINER" ]; then
    log "备份数据库（docker exec $DB_CONTAINER）→ $bk"
    docker exec "$DB_CONTAINER" sh -c "exec mysqldump -u$DB_USER ${DB_PASSWORD:+-p$DB_PASSWORD} $DB_NAME" > "$bk" 2>/dev/null \
      || { rm -f "$bk"; log "⚠️ docker 备份失败，请手动确认后重跑（或设 SKIP_BACKUP=1）"; return 1; }
  elif [ -n "$DUMP_BIN" ]; then
    log "备份数据库 → $bk"
    "$DUMP_BIN" -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" ${DB_PASSWORD:+-p"$DB_PASSWORD"} "$DB_NAME" > "$bk" 2>/dev/null \
      || { rm -f "$bk"; log "⚠️ 备份失败（DB 可能在容器内不可直连）——设 DB_CONTAINER 或 SKIP_BACKUP=1"; return 1; }
  else
    log "⚠️ 未找到 mysqldump，跳过备份"; return 0
  fi
  log "备份完成（保留最近 10 份）"; ls -1t "$BACKUP_DIR"/db-*.sql 2>/dev/null | tail -n +11 | xargs -r rm -f
}

# ===== 2. 数据库迁移（含 brownfield 首次接入：把基线标记为已应用，不重建现有表） =====
adopt_and_migrate() {
  local base_ts base_name
  base_ts="$(ls server-nest/src/database/migrations/*Baseline.ts 2>/dev/null | grep -oE '[0-9]{13}' | head -1 || true)"
  if [ -n "$MYSQL_BIN" ] && [ -n "$base_ts" ]; then
    base_name="Baseline$base_ts"
    local has_users has_mig
    has_users="$(db -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME' AND table_name='users';" 2>/dev/null || echo 0)"
    has_mig="$(db -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME' AND table_name='typeorm_migrations';" 2>/dev/null || echo 0)"
    if [ "$has_users" = "1" ] && [ "$has_mig" = "0" ]; then
      log "首次接入迁移体系：标记基线 $base_name 为已应用（保留现有表，不重建）"
      db -e "CREATE TABLE IF NOT EXISTS typeorm_migrations (id int NOT NULL AUTO_INCREMENT, timestamp bigint NOT NULL, name varchar(255) NOT NULL, PRIMARY KEY(id)); INSERT INTO typeorm_migrations (timestamp, name) SELECT $base_ts, '$base_name' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM typeorm_migrations WHERE name='$base_name');" \
        || fail "标记基线失败（数据库连接不通？）"
    fi
  fi
  log "执行待应用迁移（migration:run）..."
  ( cd server-nest && npm run migration:run ) || fail "数据库迁移失败 —— 已备份，可用 $BACKUP_DIR 下最新 .sql 回滚"
}

rollback_hint() {
  echo ""; echo "[upgrade] 若升级异常，回滚步骤："
  echo "  1) git reset --hard $FROM_COMMIT   （回退代码）"
  echo "  2) 用 $BACKUP_DIR 下最新 db-*.sql 恢复数据库（如需）"
  echo "  3) 重新构建并重启"
}
trap 'rollback_hint' ERR

# ===== 执行 =====
backup_db || true

log "拉取最新代码..."
git pull --ff-only || fail "git pull 失败（有本地改动？先 git stash；或本分支非 fast-forward）"
TO_COMMIT="$(git rev-parse --short HEAD)"
if [ "$FROM_COMMIT" = "$TO_COMMIT" ]; then log "已是最新（$TO_COMMIT），无需升级"; exit 0; fi
log "升级 $FROM_COMMIT → $TO_COMMIT"

if [ "$DEPLOY_MODE" = "docker" ]; then
  # 容器内构建 + 启动自动迁移（需在 compose env 设 DB_MIGRATIONS_RUN=true）。先做 brownfield 标记，避免容器 migrationsRun 重建现有表。
  adopt_marker_only=1
  if [ -n "$MYSQL_BIN" ] || [ -n "$DB_CONTAINER" ]; then
    base_ts="$(ls server-nest/src/database/migrations/*Baseline.ts 2>/dev/null | grep -oE '[0-9]{13}' | head -1 || true)"
    if [ -n "$base_ts" ] && [ -n "$DB_CONTAINER" ]; then
      docker exec "$DB_CONTAINER" sh -c "exec mysql -u$DB_USER ${DB_PASSWORD:+-p$DB_PASSWORD} $DB_NAME -e \"CREATE TABLE IF NOT EXISTS typeorm_migrations (id int NOT NULL AUTO_INCREMENT, timestamp bigint NOT NULL, name varchar(255) NOT NULL, PRIMARY KEY(id)); INSERT INTO typeorm_migrations (timestamp, name) SELECT $base_ts,'Baseline$base_ts' FROM DUAL WHERE (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$DB_NAME' AND table_name='users')=1 AND NOT EXISTS (SELECT 1 FROM typeorm_migrations WHERE name='Baseline$base_ts');\"" 2>/dev/null \
        && log "已确保基线标记（docker）" || log "⚠️ 基线标记跳过（首次全新库无需标记）"
    fi
  fi
  log "docker compose 重建 + 重启（容器内构建，DB_MIGRATIONS_RUN=true 则启动自动迁移）..."
  docker compose -f "$COMPOSE_FILE" up -d --build || fail "docker compose 重建失败"
  log "✅ 升级完成（docker）：$TO_COMMIT ｜ 稍后核对 /api/health 与前端 hash"
  exit 0
fi

# ---- baremetal ----
log "安装依赖 + 构建 server..."
( cd server-nest && npm ci --registry "$NPM_REGISTRY" && npm run build ) || fail "server 构建失败"
if [ "$SKIP_CLIENT" != "1" ]; then
  log "安装依赖 + 构建 client..."
  ( cd client && npm ci --registry "$NPM_REGISTRY" && npm run build ) || fail "client 构建失败"
fi

adopt_and_migrate

if [ -n "$RESTART_CMD" ]; then
  log "重启：$RESTART_CMD"; eval "$RESTART_CMD" || fail "重启失败"
elif command -v systemctl >/dev/null 2>&1 && systemctl list-units --type=service 2>/dev/null | grep -q hahasns; then
  log "重启 systemd 服务 hahasns"; sudo systemctl restart hahasns || fail "systemctl 重启失败（需 sudo 权限，或用 RESTART_CMD 指定）"
else
  log "⚠️ 未配置 RESTART_CMD 且未探测到 hahasns 服务 —— 请手动重启应用进程使新版本生效"
fi

trap - ERR
log "✅ 升级完成（baremetal）：$TO_COMMIT"
