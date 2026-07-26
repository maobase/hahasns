# HahaSNS 迭代交接手册（2026-07-26 · v5.74）

> 写给下一位接手迭代的人（人类或 agent）。本手册只含可操作事实；凭据一律不在册，
> 部署脚本（`deploy-nest.sh` / `deploy-sns.sh`，均 gitignored、内含 SSH 凭据）在仓库根。

---

## 1. 当前状态快照

| 项 | 值 |
|---|---|
| 线上版本 | **v5.74**（唯一版本源：`client/src/version.ts`） |
| 环境 | env1 = systemd 直部（`./deploy-nest.sh`）；env2 = docker compose（`./deploy-sns.sh`，sns.hahaha.chat） |
| 代码形态 | React 19 + HeroUI v3 前端；NestJS + MariaDB + Redis 后端（`server-nest/`） |
| 测试基线 | `cd server-nest && npx vitest run` → **27 文件 / 203 用例全绿**（只增不减） |
| 主分支 | `main`，两环境部署均以其为准；env2 靠 `git pull` 取码 |

**健康自查**：`curl --noproxy '*' -fsS <环境>/api/health` 应返回 `{"ok":true}`；
再抓首页 `assets/index-*.js` 里的 `v5.xx` 与 `version.ts` 比对，防「旧 dist 复活」（有前科）。

## 2. 本阶段已完成的两件大事

### 2.1 对象存储（S3 标准）端到端可用（v5.44–v5.46 + 前置 v5.33）
- 存储层是通用 S3 协议（`@aws-sdk/client-s3`），**任何 S3 兼容服务纯配置即可接入**：
  后台「系统 → 存储」填 驱动=S3 兼容 + Endpoint / Bucket / Region / AccessKey / SecretKey，
  **必须再填 Public URL**（CDN 或桶绑定域名，七牛私有桶不填文件地址打不开）。
  点「测试连接」即验证；缺 endpoint / Public URL 会出中文「配置预警」（v5.44）。
- 存量迁移：`node server-nest/scripts/migrate-uploads-to-s3.mjs`（默认 dry-run，
  先核对输出再 `--execute --yes`；`--rollback <file>` 回滚；`--rewrite-missing` 为显式放行开关）。
  docker 部署下脚本已在镜像内：`docker compose exec app node scripts/migrate-uploads-to-s3.mjs`。
- **配置来源可视化（v5.73）**：后台存储页顶部「当前生效」卡片直接显示实际在用的驱动与各项值，
  每项标出取自「后台设置 / 环境变量 / 默认值」，并给一条示例文件地址（图裂在上传前就看得出来）。
  数据来自 `GET /api/admin/storage/status`（管理员限定，密钥只回有无）；来源判定在
  `storage-config.ts` 的 `resolveStorageSources`，**改 `resolveStorageConfig` 的优先级必须同步改它**
  （两者口径必须一致，已有 6 个单测钉住，含 `s3_force_path_style='0'` 仍算「后台设置」的 falsy 坑）。
- 优先级口径（一句话）：**后台设置 > 环境变量 > 内置默认，逐字段独立**。后台留空 = 沿用 env，
  不是「清空」——这是防误清密钥的有意设计。
- **退回环境变量（v5.74）**：存储页的「清除后台设置」按钮 = `DELETE /api/admin/storage/site-config`，
  逐键删掉 `site_config` 里的存储配置（含密钥）后按 env / 默认生效，返回实际清掉了哪几项并写管理日志，
  重复调用无副作用；按钮仅在 `status.hasSiteConfig` 为真时出现。删哪些键由
  `storage-config.ts` 的 **`STORAGE_SITE_KEYS`** 定义——读配置、判来源、清除三处共用这一份，
  **新增可后台配置的存储字段必须同时加进这个数组**，否则会出现「点了清除但配置还生效」的幽灵配置
  （已有两个全量覆盖用例钉死：全填→逐项 site，全删→逐项退回 env）。
- **存量文件提示（v5.74）**：`storage status` 多返回 `localFiles` / `localFilesCapped`
  （数 uploads 目录里的文件，跳过点开头的探针残留与子目录，上限 10000）；驱动是 s3 且本地还有文件时，
  面板把原本低调的「存量迁移」说明升级成醒目提示，写明还剩几个没迁走 + 迁移命令。
- 细节见 `server-nest/src/modules/storage/`（storage.service.ts / storage-config.ts）。

### 2.2 组件双轨收敛（spec/01 §1.2，v5.47–v5.59）
四条自研轨道全部收敛 HeroUI 单轨（经 `client/src/components/heroui.jsx` shim）：
Spinner / Tabs / Modal / 输入框 124 处 / 按钮 194 处；`.ui-spinner`、`.feed-tab`、`.inp`、`.btn`
自研 CSS 已全删（grep 0 命中）。**抹平层即单一事实来源**：
- `components.css` 的 `.haha-feed-tabs`（Tabs 视觉）、`.haha-inp` 系（输入框，`.admin-shell` 内有 36px 紧凑变体）、`.haha-btn-app` 系（按钮，含 `--primary/--ghost/--outline/--sm/--lg/--block` Link 修饰类）。
- 新增表单控件一律走 shim + 这些类，**禁止再生第二套自研样式**（红线）。
- 已知注意：HeroUI v3 会强制按钮内 svg 尺寸（≥768px 16px / <768px 20px）——shim Button 内
  一切 Icon 必须 `style={{width,height}}` 钉住原尺寸；`Link` 不是 Button，用修饰类形态保链接语义。

### 2.3 大文件拆分（v5.60–v5.72）
- `Admin.tsx` 2678 → **216 行纯壳**（tab 深链/侧栏/登录墙）；24 个面板在 `client/src/pages/admin/`，
  共享件（Toggle/ListHead/downloadCSV/SaveBtn/AdminSearch）在 `pages/admin/ui.tsx`。
  新增后台 tab = 新建一个零 props 面板文件 + 壳里挂载。
- `Composer.tsx` 363 → 201 行（`components/composer/`：PollEditor/RedPacketEditor/EmojiPanel/AdvancedFields）。
- `PostCard.tsx` 354 → 305 行（`components/postcard/`：ShareModal/EditModal/TipModal）。

## 3. 日常迭代标准动作（每轮必走）

1. **动手前**：`git status --short` 确认干净；`docs/2607plan/` 是本地未跟踪目录，别提交。
2. **版本**：用户可见变更 → bump `client/src/version.ts`，`client/src/pages/Changelog.tsx`
   顶部加条目（`date` 用 `date '+%F %T'` 真实时间），然后仓库根 `npm run changelog:gen`。
3. **质量门**（全绿才提交）：
   - `npm --prefix client run build` 0 error（动了后端再 `npm --prefix server-nest run build`）
   - `cd server-nest && npx vitest run` 全绿；新逻辑补测试
   - `npm run lint:copy`（文案/交互 lint）
   - 视觉门：本地起 dev（NestJS :4000 + Vite :5173；本地 curl 一律 `--noproxy '*'`，
     Vite 只监听 IPv6，用 `http://localhost:5173` 而非 `127.0.0.1`），
     playwright-core 无头（`channel:'chrome'`）截改动页 390/1280 × 亮/暗，
     页面级无横向溢出（`scrollWidth === clientWidth`）；**主题用 URL 参数 `?theme=dark` 切**
     （`ThemeContext.initMode()` 认它；只写 `localStorage.haha_theme` 在无头里不稳）。
     后台页深链是**路径** `/admin/<tab>`，不是 `?tab=`（写错会静默落在「概览」上，白截一轮）。
   - 一次性账号：注册 → 用完先 `SELECT` 确认唯一 → `DELETE ... LIMIT 1`；
     需管理员就本地库 `UPDATE users SET role='admin'`；**bash 变量名禁用 `UID`**（只读内建）。
4. **提交**：一项一 commit，中文 conventional 前缀 + 版本号；
   逐文件 `git add`，**绝不提交**：`deploy*.sh`、`.agents/`、`.claude/`、`docs/research/`、`spec/`、任何凭据。
5. **部署**（两环境）：
   - env1：`./deploy-nest.sh`（`DEPLOY_CLIENT=0` 可跳前端）
   - env2：`./deploy-sns.sh`（内含 `git push origin main`）
   - ⚠️ **绝对禁止 `./deploy.sh`**——它会把线上后端回滚成已退役的 Express。
   - 部署后：两环境 `/api/health` 200 + bundle 版本号核对（见 §1 自查）。
   - **禁止 reseed 线上库**；线上任何 DELETE 前先 SELECT 确认。

## 4. 循环迭代机制（spec/ 目录）

- `spec/LOOP-PROMPT.md` = 执行 agent 的完整工作指令（8 步流程 + 6 道质量门 + 红线 + 停止条件），
  直接投喂即可开循环；`spec/README.md` 优先级表是唯一选项来源（spec/ 本身 gitignored）。
- 硬红线速记：仓库公开（github.com/maobase/hahasns）；HeroUI 单轨；颜色一律语义 token
  （`client/src/styles/tokens.css`，6 皮肤 + 暗色）；文案规范见 `spec/02-copy-guide.md`；
  线上 `DB_SYNCHRONIZE=false`，**改表结构必须先停下向人类说明方案**（见 §5 迁移遗留）。
- **`.admin-shell` 是固定浅色的 B 端主题**（`client/src/styles/pages.css`），刻意不随前台明暗。
  它在自己的作用域里把 token 重新钉成浅色值——中性色、强调色（gold/good/like/coral/verify）、
  骨架屏、遮罩都在内。**新增语义 token 若会被后台面板用到，必须同步在这个块里钉一份**，
  否则前台切暗色后，后台白卡上会冒出暗色底纹（v5.73 修过一次）。

## 5. 已知遗留 / 后续候选（按优先级）

1. **TypeORM 迁移链路未打通（改表类需求的前置，需用户拍板）**：env1 从未纳入迁移体系
   （`DB_MIGRATIONS_RUN` 未设、`typeorm_migrations` 表不存在）。打通方案与风险详见
   `spec/README.md`「改表两项(C/D)的前置」一节——碰它之前必须先备份 + 用户 sign-off。
2. **auth 合并（AuthPanel）**：用户拍板缓做（AuthLanding 与 AuthModal 仍两套，spec01 §1.2）。
3. **HeroUI Select 收敛**：Mall 等原生 `<select>` 现以 `select.haha-inp` 过渡，
   换 HeroUI Select 会改下拉外观，需专项评估。
4. **对象删除不清理存储对象**：`StorageService.delete` 目前无调用方（预留），
   删帖/删用户时桶内对象会累积；接入时注意幂等与本地/S3 双驱动。
5. **存量迁移仍是手工跑脚本**：v5.74 会提示「还剩 N 个没迁走」，但迁移本身要 SSH 上服务器执行；
   后台一键迁移需要长任务 + 进度回传（当前没有任务队列），属较大改动。
6. **`localFiles` 只数 uploads 顶层文件**：够用于「有没有存量」的判断，子目录不递归、上限 10000
   （超出显示 `N+`）；真要精确统计以迁移脚本的 dry-run 输出为准。

## 6. 故障速查

| 症状 | 先查 |
|---|---|
| 部署后页面是旧版 | 线上 bundle hash 是否与本地 `client/dist` 一致（旧 dist 复活前科） |
| 本地 curl 426/异常 | 忘记 `--noproxy '*'`（本机代理） |
| vite 起不来 | 5173 被 stale 进程占用，`lsof -i :5173` 查杀 |
| 上传 413/格式被拒 | `uploads.controller.ts` 的 25MB/9 张硬顶与 mimetype 双拦 |
| 七牛图裂 | 多半没填 Public URL，或桶私有但用了裸 S3 域名 |
| 「对象存储到底生效没有」 | 后台 系统 → 存储 顶部「当前生效」卡片；命令行 `GET /api/admin/storage/status`（带管理员 token） |
| 后台白卡上出现暗色底纹 | 用到的 token 没在 `.admin-shell` 块里钉浅色版（见 §4 末条） |
| 测试在未改动区域变红 | 停——这是 LOOP-PROMPT 停止条件，别绕，查清楚再继续 |
| 本地后端起不来（DB 连不上） | 3306 常被别的项目占；本地库另起一个容器即可，见 §7 |
| 后台改了存储配置想撤销 | 「清除后台设置」按钮（只在后台存过配置时出现）退回 env；密钥留空保存不会清值 |
| 切到 S3 后老图仍走本地 | 正常——改驱动只影响新上传；面板提示的 `migrate-uploads-to-s3.mjs` 跑完才算迁完 |

## 7. 本地开发环境（视觉门要用）

`server-nest/.env`（gitignored）指向一个**独立的开发库容器**，不碰 3306 上别人的 mysql：

```bash
docker run -d --name hahasns-dev-db -p 3310:3306 \
  -e MARIADB_ROOT_PASSWORD=devroot -e MARIADB_DATABASE=hahasns \
  -e MARIADB_USER=hahasns -e MARIADB_PASSWORD=devpass mariadb:10.11
npm --prefix server-nest run start:dev   # :4000，DB_SYNCHRONIZE=true 自动建表 + 播种管理员
npm --prefix client run dev              # :5173
```

`.env` 里 `SEED_ADMIN_USER` / `SEED_ADMIN_PASSWORD` 是首次启动播种的管理员，登录拿 token 供
无头截图注入（`localStorage.haha_token`）。**这份 .env 里的 S3_\* 是故意只给环境变量、后台不填的**，
用来验证「当前生效」卡片的来源标注；它指向的 127.0.0.1:9000 本地并没有 MinIO，
所以「测试连接」会失败——这是预期，不是 bug。
