# HahaSNS 升级指南

本项目支持**安全、版本化的升级**：升级不丢数据。核心由三部分组成——

1. **版本化数据库迁移**（TypeORM migrations，替代旧的 `synchronize` 自动建表）——升级时受控演进表结构；
2. **`upgrade.sh` 一键升级脚本**——自动「备份 → 拉取 → 构建 → 迁移 → 重启」；
3. **后台「系统更新」页**——检测新版本并半自动一键升级，无需 SSH（方便非命令行的站长）。

> 前提：**以 `git clone` 方式部署**（这样才能 `git pull` 拉取更新）。手动拷贝/打包部署的实例无法自动升级——请改用 git 部署。

---

## 一、后台一键升级（推荐给非命令行用户）

后台 → **系统更新** 页可检测最新版本。默认「一键升级」按钮**关闭**（安全考虑，因为它会在服务器执行脚本并重启服务）。启用步骤：

1. 确保运行 app 的账号**有权限**执行升级动作（见下方「权限配置」）。
2. 设环境变量 **`ALLOW_ADMIN_UPGRADE=true`** 并重启服务。
3. 后台 → 系统更新 → **检查更新** → **一键升级**。升级在后台进行（备份/拉取/迁移/重建），完成后服务由宿主（systemd / docker）**自动重启**（半自动模式），页面稍后刷新即显示新版本。

> ⚠️ **用仓库自带 `docker-compose.yml` 装的实例用不了这个按钮**：镜像里只有构建产物，没有 git 仓库、没有 `upgrade.sh`、也没有 docker 控制权，容器无法重建自己。所以 `ALLOW_ADMIN_UPGRADE` 也**不在 compose 的环境变量白名单里**（写进 `.env` 不生效——给一个按不动的开关比没有更糟）。这类部署请在宿主机的仓库目录走**第二节的命令行升级**，或直接 `git pull && docker compose up -d --build`。「检查更新」不受影响，照常能看到有没有新版。

## 二、命令行升级 `./upgrade.sh`（通用）

在仓库根目录：

```bash
./upgrade.sh
```

脚本会依次：备份数据库 → `git pull` → 安装依赖并构建（server + client）→ 运行数据库迁移 → 重启服务。**失败时自动打印回滚步骤**，且数据库已备份到 `.upgrade-backups/`。

配置方式：在仓库根建 **`upgrade.env`**（不入 git；参考 `upgrade.env.example`），或直接用环境变量。常用项：

| 变量 | 说明 |
|---|---|
| `DEPLOY_MODE` | `baremetal`（默认，宿主机直跑 Node）或 `docker`（docker compose 部署） |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` / `DB_CLIENT` | 数据库连接（用于备份 + 迁移；通常已在 `server-nest/.env`，脚本会自动读取） |
| `RESTART_CMD` | 重启命令，如 `sudo systemctl restart hahasns`。留空则自动探测 systemd 服务 `hahasns` |
| `NPM_REGISTRY` | npm 源，默认 `https://registry.npmjs.org` |
| `SKIP_BACKUP` / `SKIP_CLIENT` | 设 `1` 可跳过备份 / 跳过前端构建 |

### Docker Compose 部署

设 `DEPLOY_MODE=docker`，并配置：

| 变量 | 说明 |
|---|---|
| `COMPOSE_FILE` | compose 文件，默认 `docker-compose.prod.yml` |
| `DB_CONTAINER` | 数据库容器名（用于备份 + 首次接入迁移标记） |

并在 compose 的 app 服务 env 里加 **`DB_MIGRATIONS_RUN=true`**，让容器启动时自动跑迁移。`upgrade.sh` 会：备份（`docker exec` mysqldump）→ 首次接入时标记基线 → `git pull` → `docker compose up -d --build`（容器内构建 + 启动自动迁移）。

## 三、数据库迁移说明

- **已有实例首次接入迁移体系**：`upgrade.sh` 会自动把「基线迁移」标记为**已应用**——**保留现有表、不重建、不丢数据**，之后的新版本迁移正常增量执行。
- **全新安装（空库）**：运行 `cd server-nest && npm run migration:run` 即可按基线建好全部表；或首启设 `DB_SYNCHRONIZE=true` 建表后改回 `false`。
- **生产环境务必 `DB_SYNCHRONIZE=false`**——由迁移受控演进 schema，避免自动同步误改表。
- **贡献者改了实体后**：`cd server-nest && npm run migration:generate -- src/database/migrations/YourChange` 生成迁移。⚠️ TypeORM + MariaDB 会产出一些 `CHANGE ... NULL` / 索引重建的**冗余噪音语句**（无副作用但多余），提交前请**只保留真实变更**。

## 四、备份与回滚

- 每次 `upgrade.sh` 升级前自动 `mysqldump` 备份到 `.upgrade-backups/`（保留最近 10 份）。
- 回滚步骤：
  1. `git reset --hard <升级前的 commit>`（脚本失败时会打印该 commit）；
  2. 如需恢复数据：用 `.upgrade-backups/` 下最新的 `db-*.sql` 导回数据库；
  3. 重新构建并重启服务。

## 五、权限配置（后台一键升级 / 自动重启需要）

后台一键升级会让 app 进程执行 `upgrade.sh` 并触发重启，因此运行 app 的账号需能：`git pull`、`npm`、以及重启服务。

- **systemd**：给该账号配置**免密 `sudo systemctl restart hahasns`**（`/etc/sudoers.d/`），并设 `RESTART_CMD="sudo systemctl restart hahasns"`。
- **docker**：该账号需能访问 docker（加入 `docker` 组），`DEPLOY_MODE=docker` 由 `docker compose up -d --build` 完成重建重启。

**安全**：后台升级默认关闭；仅 admin 可触发；脚本路径固定、无用户输入拼接（无命令注入）；升级前自动备份。若不放心，可只用它做**版本检测**，实际升级仍在服务器手动运行 `./upgrade.sh`。
