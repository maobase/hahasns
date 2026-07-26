# 安装手册

> 🧭 **不确定用哪种装法？** 先看 [安装方式速览](../README.md#-快速开始) 对号入座。
> 分路：[图形面板 · 1Panel](INSTALL-1panel.md) / [宝塔](INSTALL-bt.md)（**非技术用户推荐**） · [命令行 · Docker / 裸机](DEPLOY.md) · [完整安装手册](INSTALL.md) · [让 AI 助手代装](DEPLOY-AI.md) · [配置与维护参考](CONFIGURATION.md)


本手册带你从零把 HahaSNS 部署起来，覆盖**主机规格**、**依赖环境**与**部署步骤**。后端是 `server-nest/`（NestJS 10 + TypeORM），数据落 **MySQL/MariaDB**、缓存用 **Redis**、媒体默认存本地磁盘（也可走 **S3 兼容对象存储**）。

整套系统只有**一个 Node 进程**：它同时对外提供前端 SPA（指向 `client/dist`，由 `CLIENT_DIST` 配置）、`/api` 接口与 `/uploads` 上传文件，统一监听 `PORT`。

> **最省事是 Docker**：一份 `docker-compose.yml` 一键起 `app + mariadb + redis`（线上 Demo 即此），见 [INSTALL-1panel.md](INSTALL-1panel.md) / [INSTALL-bt.md](INSTALL-bt.md)。
>
> 不用 Docker 的裸机部署（自备 MySQL/Redis + systemd）见 [DEPLOY.md](DEPLOY.md)；纯本地开发见 [DEVELOPMENT.md](DEVELOPMENT.md)。

---

## 一、主机规格

| 档位 | 配置 | 适用场景 |
| --- | --- | --- |
| 最低 | 2 核 CPU / 2 GB 内存 / 20 GB 磁盘 / Linux（Ubuntu 20.04+、Debian 11+、CentOS 7+ 等） | 试用、个人站、小流量 |
| 推荐 | 4 核 CPU / 8 GB 内存 / 40 GB+ 磁盘，数据库 / 缓存独立部署 | 中大型、高并发站点 |

后端要同时跑 Node 应用、MySQL/MariaDB 与 Redis，因此单机至少 **2 核 / 2 GB** 才舒适；如果数据库、Redis 与应用挤在同一台机器上，请预留足够内存。规模再大时建议把数据库、Redis、对象存储拆到独立实例或托管服务（云数据库、云 Redis、对象存储 OSS / COS / S3），应用层即可无状态横向扩展。

磁盘主要消耗在**用户上传的媒体**（图片 / 视频 / 音频），存在本地磁盘时（`UPLOADS_DIR`）请按预期内容量预留；如果允许用户上传视频，请多留磁盘。媒体改用对象存储后，应用服务器本身几乎不占磁盘。

> 操作系统建议 64 位 Linux。Windows / macOS 可用于开发，但生产部署推荐 Linux。

---

## 二、依赖环境

- **Node.js 20 LTS** 与 **npm**。
  ```bash
  node -v   # 应输出 v20.x（或更高 LTS）
  npm -v
  ```
- **MySQL 8+** 或 **MariaDB 10.6+** —— 主数据库。
- **Redis 7**（用于缓存）。
- **Git**（用于拉取代码，可选；也可上传压缩包）。
- （可选）**S3 兼容对象存储**：用于存放上传媒体，可用 AWS S3、MinIO，或阿里云 OSS / 腾讯云 COS 等兼容 S3 协议的服务。不配置则默认存本地磁盘。

上述服务的连接信息（地址、端口、库名、账号、密钥）通过**环境变量**注入 `server-nest`，请勿写死在代码或提交到仓库。

---

## 三、获取代码

```bash
# 用 git 拉取（推荐）
git clone https://github.com/maobase/hahasns.git hahasns
cd hahasns

# 或：上传 / 解压发布包到服务器某个目录，例如 /opt/hahasns
```

仓库是多包结构：

- `client/` —— 前端（React 19 + HeroUI v3 + TypeScript + Tailwind 4 + Vite）
- `server-nest/` —— 后端（NestJS 10 + TypeORM + MySQL/MariaDB + Redis，媒体本地或 S3）

---

## 四、准备数据库与 Redis

在部署前先备好 MySQL/MariaDB 与 Redis。

### 1. 创建数据库与账号

以 MySQL/MariaDB 为例，登录后执行（请把库名、账号、密码换成你自己的）：

```sql
CREATE DATABASE hahasns CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'hahasns'@'%' IDENTIFIED BY '<强随机密码>';
GRANT ALL PRIVILEGES ON hahasns.* TO 'hahasns'@'%';
FLUSH PRIVILEGES;
```

> 表结构无需手动建。首次以 `DB_SYNCHRONIZE=true` 启动时，TypeORM 会按实体自动创建全部表（无独立迁移脚本），建表完成后再改回 `false`（详见第六节）。

### 2. 准备 Redis

启动一个 Redis 7 实例（本机、内网或托管服务均可），记下它的连接地址，稍后通过 `REDIS_URL` 注入，例如 `redis://127.0.0.1:6379`。

### 3.（可选）准备对象存储

不配置就默认存本地磁盘（`UPLOADS_DIR`），部署阶段可以先跳过这一节。要把上传媒体放到 S3 兼容存储（AWS S3、MinIO、七牛 Kodo、阿里云 OSS、腾讯云 COS 等），先建好 Bucket 与访问密钥，然后二选一：

- **后台配置（推荐，不用重启）**：站点跑起来后进「管理后台 → 系统 → 存储」，填 Endpoint / Bucket / Region / Access Key / Secret Key，再填 **Public URL**（CDN 或桶绑定域名——私有桶不填这项，图片地址打不开），点「测试连接」验证。保存即时生效。
- **环境变量**：注入 `STORAGE_DRIVER=s3` 与一组 `S3_*`（见下一节），适合用 `.env` 统一管理配置的场景。

两者可以混用：**后台填了的字段优先，留空的沿用环境变量**。后台「存储」页顶部的「当前生效」会逐项标出每个值来自后台还是环境变量，并给出一个示例文件地址，便于核对。

「测试连接」跑的是三步：**写入探针文件 → 按公开地址回读 → 删除**，三步都过才算通过。只有写入通过、回读失败时会报「部分通过」——这一步专门用来抓私有桶、CDN 没绑对这类「后台看着正常、发帖全是裂图」的情况。连接失败会直接说该改哪个字段（桶不存在、密钥无效、签名不匹配、Region 不对、域名解析不了……），原始报错附在括号里备查。

保存密钥时留空表示**保留原值**（避免手滑清空），所以想彻底退回 `.env` 那份配置，请用页面上的「清除后台设置」按钮——它会删掉后台存的全部存储配置（含密钥），之后按环境变量或内置默认生效，已上传的文件不受影响。这个按钮只在后台确实存过配置时出现。

切换到对象存储时，此前存在本地磁盘的媒体不会自动搬家，用仓库自带脚本迁移（默认 dry-run，先看输出再执行）：

```bash
node server-nest/scripts/migrate-uploads-to-s3.mjs                 # 预演
node server-nest/scripts/migrate-uploads-to-s3.mjs --execute --yes # 实际迁移
# docker 部署：docker compose exec app node scripts/migrate-uploads-to-s3.mjs
```

忘了这一步也不至于翻车：只要本地上传目录还有存量文件，后台「存储」页会直接提示还剩几个没迁走并给出上面的命令。

---

## 五、配置环境变量

`server-nest` 的全部配置都由环境变量驱动（可写进进程管理器 / 容器的环境配置，或用 `.env`）。常用变量如下：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `4000` | 后端监听端口（同时托管前端 + `/api` + `/uploads`） |
| `JWT_SECRET` | 内置开发占位值 | 签发登录令牌的密钥，**生产环境必须改为强随机值** |
| `DB_CLIENT` | `mysql` | 数据库类型，保持 `mysql`（同样适用于 MariaDB） |
| `DB_HOST` | `127.0.0.1` | 数据库地址 |
| `DB_PORT` | `3306` | 数据库端口 |
| `DB_USER` | `hahasns` | 数据库账号 |
| `DB_PASSWORD` | 空 | 数据库密码 |
| `DB_NAME` | `hahasns` | 数据库名 |
| `DB_SYNCHRONIZE` | `false` | 首次部署设为 `true` 让 TypeORM 自动建表，建表后改回 `false` |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis 连接地址 |
| `CLIENT_DIST` | 内置默认 | 前端构建产物目录，指向 `client/dist`，由后端托管 |
| `UPLOADS_DIR` | 内置默认 | 本地媒体存储目录（`STORAGE_DRIVER=local` 时生效） |
| `STORAGE_DRIVER` | `local` | 媒体存储驱动：`local`（本地磁盘）或 `s3`（对象存储） |
| `TRUST_PROXY` | 空 | 挂在 Nginx / 宝塔 / 1Panel / Cloudflare 后面时设 `1`。不设的话后端看到的访客 IP 全是反代 IP，按 IP 的注册与发帖限流会失效（详见第八节） |
| `ANTHROPIC_API_KEY` | 空 | （可选）启用 AI 相关能力时填写 |

启用对象存储（`STORAGE_DRIVER=s3`）时再补充：`S3_ENDPOINT`、`S3_BUCKET`、`S3_ACCESS_KEY`、`S3_SECRET_KEY`、`S3_REGION`、`S3_PUBLIC_URL`、`S3_FORCE_PATH_STYLE`。

生成强随机密钥示例：

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> 所有敏感凭据只放在环境变量里，切勿提交到仓库。

---

## 六、构建与启动

### 1. 构建前端

产出静态文件到 `client/dist`，由后端托管：

```bash
cd client
npm install
npm run build       # → 产出 client/dist
```

### 2. 构建后端

```bash
cd ../server-nest
npm install
npm run build       # nest build → 产出 dist/
```

### 3. 首次启动（自动建表）

首次运行时打开 `DB_SYNCHRONIZE=true`，让 TypeORM 按实体自动创建全部表，并把 `CLIENT_DIST` 指向上一步构建出的前端目录：

```bash
NODE_ENV=production \
DB_HOST=127.0.0.1 DB_PORT=3306 DB_CLIENT=mysql \
DB_USER=hahasns DB_PASSWORD=<数据库密码> DB_NAME=hahasns \
DB_SYNCHRONIZE=true \
REDIS_URL=redis://127.0.0.1:6379 \
JWT_SECRET=<强随机密钥> \
PORT=4000 \
CLIENT_DIST=/opt/hahasns/client/dist \
  node dist/main.js   # → http://localhost:4000
```

确认表已创建、服务正常后，**停掉进程，把 `DB_SYNCHRONIZE` 改回 `false`**（或直接去掉该变量）再正式运行，避免后续启动误改表结构。

由于单个 Node 进程已同时托管前端、`/api` 与 `/uploads`，对外只需暴露这一个端口。

### 4. 用进程管理器守护（PM2）

生产环境请用进程管理器守护后端（systemd 方案见 [DEPLOY.md](DEPLOY.md)）：

```bash
sudo npm install -g pm2
cd /opt/hahasns/server-nest
# 环境变量同上（去掉 DB_SYNCHRONIZE 或设为 false）
NODE_ENV=production PORT=4000 JWT_SECRET=<强随机密钥> \
DB_HOST=127.0.0.1 DB_CLIENT=mysql DB_USER=hahasns DB_PASSWORD=<数据库密码> DB_NAME=hahasns \
REDIS_URL=redis://127.0.0.1:6379 CLIENT_DIST=/opt/hahasns/client/dist \
  pm2 start dist/main.js --name hahasns
pm2 save && pm2 startup        # 设置开机自启
```

---

## 七、设置首位管理员

全新部署数据库为空、没有任何用户。两种方式任选其一：

**方式 A：首启自动建（推荐，免手 SQL）** —— 在环境变量里加这两项后首次启动，库里若还没有任何管理员就自动创建该账号（已有管理员则忽略，幂等安全）：

```bash
SEED_ADMIN_USER=admin
SEED_ADMIN_PASSWORD=<强密码，≥6 位>
```

启动后用该账号登录即可进后台；**登录后请尽快改密**。建好后这两个变量可去掉。

**方式 B：先注册再提权** —— 先在站点正常注册第一个账号，再把它的角色改成管理员：

```sql
UPDATE users SET role='admin' WHERE username='<你的用户名>';
```

之后用该账号登录即可进入后台管理。

---

## 八、反向代理对外（Nginx）

让 Node 进程绑定本地端口（如 4000），Nginx 在前面提供域名、HTTPS 与上传体积放行。

由于单个 Node 进程已同时托管静态站点、`/api` 与 `/uploads`，最简单的做法是把所有请求整体代理给它：

```nginx
server {
    listen 80;
    server_name <你的域名>;

    # 上传媒体可能较大，放宽请求体上限（应用端单文件上限约 25 MB）
    client_max_body_size 30m;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

如果你希望由 Nginx **直接托管 `client/dist` 静态文件**、只把 `/api` 与 `/uploads` 转发给后端（静态资源更快、缓存更可控），用下面这种分流写法：

```nginx
server {
    listen 80;
    server_name <你的域名>;
    client_max_body_size 30m;

    root /opt/hahasns/client/dist;
    index index.html;

    # API 与上传文件转发给后端
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /uploads/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
    }

    # 其余走静态文件，找不到则回退到 SPA 入口
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

启用并重载，再申请 HTTPS 证书：

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d <你的域名>      # 申请并自动配置 HTTPS
```

记得在云主机安全组 / 防火墙放行 **80 / 443** 端口（后端的 4000 端口只对本机开放即可，不要直接暴露公网）。

> **配了反代就要设 `TRUST_PROXY=1`**（然后重启后端）。否则每个请求在后端看来都来自反代自己的 IP，按 IP 的注册与发帖限流会全部作废，而且不会报错，站被批量注册时才发现。配好之后可以到「后台 → 系统 → 系统更新 → 部署自检」确认这一项是绿的。

---

## 九、数据与备份

- **数据库**：数据落在 MySQL/MariaDB，用 `mysqldump` 定期备份（或使用云数据库的自动备份）：
  ```bash
  mysqldump -h 127.0.0.1 -u hahasns -p hahasns > /var/backups/hahasns-$(date +%F).sql
  ```
  恢复时用 `mysql ... < 备份文件.sql` 导回。
- **上传媒体**：
  - 本地磁盘模式（`STORAGE_DRIVER=local`）：媒体在 `UPLOADS_DIR` 指向的目录，对外路径 `/uploads/...`。该目录在运行时写入，**重新部署代码时务必排除它**，避免覆盖线上媒体；定期把整个目录一起备份。
  - 对象存储模式（`STORAGE_DRIVER=s3`）：媒体在对象存储中，依赖对象存储自身的冗余与版本控制。

---

## 十、常见问题

> 部署完先去「**后台 → 系统 → 系统更新 → 部署自检**」看一眼。它逐项检查登录令牌密钥、访客真实 IP（反代）、表结构自动同步开关、首启管理员种子密码、运行模式、Redis 与媒体存储，每条写明现状与该改哪个变量。这些判断原本只写在服务器日志里，用面板部署时基本看不到。

- **数据库连不上 / 启动报连接错误** —— 检查 `DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME` 是否正确，账号是否有权访问该库；MySQL/MariaDB 是否允许该来源 IP 连接。
- **首次启动表没建出来** —— 确认首次运行设置了 `DB_SYNCHRONIZE=true`；建表完成后再改回 `false`。
- **Redis 连不上** —— 检查 `REDIS_URL` 是否正确、Redis 服务是否在运行、端口是否放行。
- **端口被占用** —— 用不同的 `PORT` 启动后端（如 `PORT=4100 node dist/main.js`）。
- **前端能打开但接口报错 / 跨域** —— 检查 Nginx 是否正确把 `/api`、`/uploads` 转发到后端端口；确认 `CLIENT_DIST` 指向正确的 `client/dist`；本地开发则确认后端已在 4000 端口运行（前端 dev server 已配置代理）。
- **公网无法访问** —— 检查云主机安全组 / 防火墙是否放行 80 / 443；后端 4000 端口应只对本机开放，由 Nginx 代理对外。
- **没有管理员入口** —— 全新部署需先注册首个账号，再按第七节用 SQL 把它提升为 `admin`。
