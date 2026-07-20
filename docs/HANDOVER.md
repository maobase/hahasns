# HahaSNS 迭代交接手册（2026-07-20 · v5.72）

> 写给下一位接手迭代的人（人类或 agent）。本手册只含可操作事实；凭据一律不在册，
> 部署脚本（`deploy-nest.sh` / `deploy-sns.sh`，均 gitignored、内含 SSH 凭据）在仓库根。

---

## 1. 当前状态快照

| 项 | 值 |
|---|---|
| 线上版本 | **v5.72**（唯一版本源：`client/src/version.ts`） |
| 环境 | env1 = systemd 直部（`./deploy-nest.sh`）；env2 = docker compose（`./deploy-sns.sh`，sns.hahaha.chat） |
| 代码形态 | React 19 + HeroUI v3 前端；NestJS + MariaDB + Redis 后端（`server-nest/`） |
| 测试基线 | `cd server-nest && npx vitest run` → **26 文件 / 195 用例全绿**（只增不减） |
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
   - 视觉门：本地起 dev（NestJS :4000 + Vite :5173；本地 curl 一律 `--noproxy '*'`），
     playwright-core 无头（`channel:'chrome'`）截改动页 390/1280 × 亮/暗，
     页面级无横向溢出（`scrollWidth === clientWidth`）；主题存 `localStorage.haha_theme`。
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

## 5. 已知遗留 / 后续候选（按优先级）

1. **TypeORM 迁移链路未打通（改表类需求的前置，需用户拍板）**：env1 从未纳入迁移体系
   （`DB_MIGRATIONS_RUN` 未设、`typeorm_migrations` 表不存在）。打通方案与风险详见
   `spec/README.md`「改表两项(C/D)的前置」一节——碰它之前必须先备份 + 用户 sign-off。
2. **auth 合并（AuthPanel）**：用户拍板缓做（AuthLanding 与 AuthModal 仍两套，spec01 §1.2）。
3. **HeroUI Select 收敛**：Mall 等原生 `<select>` 现以 `select.haha-inp` 过渡，
   换 HeroUI Select 会改下拉外观，需专项评估。
4. **对象删除不清理存储对象**：`StorageService.delete` 目前无调用方（预留），
   删帖/删用户时桶内对象会累积；接入时注意幂等与本地/S3 双驱动。
5. **Admin「清空已存密钥」**：PUT 留空=保留原值，想回退 env 只能改库（体验项）。

## 6. 故障速查

| 症状 | 先查 |
|---|---|
| 部署后页面是旧版 | 线上 bundle hash 是否与本地 `client/dist` 一致（旧 dist 复活前科） |
| 本地 curl 426/异常 | 忘记 `--noproxy '*'`（本机代理） |
| vite 起不来 | 5173 被 stale 进程占用，`lsof -i :5173` 查杀 |
| 上传 413/格式被拒 | `uploads.controller.ts` 的 25MB/9 张硬顶与 mimetype 双拦 |
| 七牛图裂 | 多半没填 Public URL，或桶私有但用了裸 S3 域名 |
| 测试在未改动区域变红 | 停——这是 LOOP-PROMPT 停止条件，别绕，查清楚再继续 |
