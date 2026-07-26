import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import { join } from 'path';
import { StorageService } from '../storage/storage.service';
import { sawForwardedFor } from '../../common/proxy-signal';
import { buildDeployChecks, summarizeDeployChecks } from './deploy-check';

const pexec = promisify(exec);

const REPO = process.env.UPGRADE_REPO || 'maobase/hahasns';
const BRANCH = process.env.UPGRADE_BRANCH || 'main';
// 仓库根目录：默认取 server-nest 的上一级（git-clone 部署时即仓库根）。可用 REPO_DIR 覆盖。
const REPO_DIR = process.env.REPO_DIR || join(process.cwd(), '..');
// 后台一键升级默认关闭（安全）：站长配好权限后显式设 ALLOW_ADMIN_UPGRADE=true 才允许网页触发。
const UPGRADE_ENABLED = process.env.ALLOW_ADMIN_UPGRADE === 'true';

/**
 * 系统更新服务（后台「系统更新」用）：
 *  - status(): 当前版本/commit + GitHub 最新 commit + 是否有新版 + 后台升级是否启用。
 *  - upgrade(): 半自动一键升级 —— detached 拉起仓库根的 upgrade.sh（拉取/迁移/重建/重启由脚本与宿主自愈完成），
 *    应用进程重启后自身会被替换，故 detached + 输出重定向到 upgrade.log。仅在 ALLOW_ADMIN_UPGRADE=true 时执行。
 */
@Injectable()
export class SystemService {
  private readonly logger = new Logger('System');
  // 缓存 GitHub 上的最新版本号（从 raw version.ts 解析）。按版本号比对，docker/裸机通用（不依赖容器内 .git）。
  private versionCache: { at: number; version: string | null } = { at: 0, version: null };
  private refreshing = false;
  private upgrading = false;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly storage: StorageService,
  ) {}

  private async localCommit(): Promise<string | null> {
    try {
      const { stdout } = await pexec('git rev-parse --short HEAD', { cwd: REPO_DIR });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  /** 非阻塞取最新版本号：立即返回缓存（可能 null），空/过期时后台异步刷新，GitHub 不可达也不卡住页面。 */
  private latestVersionCached(): string | null {
    if (!this.versionCache.version || Date.now() - this.versionCache.at > 5 * 60 * 1000) void this.refreshLatest();
    return this.versionCache.version;
  }

  private async refreshLatest(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      // 拉最新 client/src/version.ts 解析 APP_VERSION —— 按版本号比对（不依赖 git，docker 容器内也可用）。
      const resp = await fetch(`https://raw.githubusercontent.com/${REPO}/${BRANCH}/client/src/version.ts`, {
        headers: { 'User-Agent': 'hahasns-selfhost' },
        signal: AbortSignal.timeout(6000),
      });
      if (resp.ok) {
        const txt = await resp.text();
        const v = (txt.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/) || [])[1];
        if (v) this.versionCache = { at: Date.now(), version: v };
      }
    } catch {
      // 网络不通（如服务器无法访问 GitHub）→ 保持 version=null，页面显示"检测暂不可用"
    } finally {
      this.refreshing = false;
    }
  }

  async status() {
    const currentCommit = await this.localCommit();
    const latestVersion = this.latestVersionCached();
    return {
      // 当前运行版本以前端 bundle 内的 APP_VERSION 为准（前端展示）；此处仅给 commit 用于判断是否 git 部署。
      currentCommit,
      latestVersion,
      canCheck: !!latestVersion, // GitHub 是否可达（能否检测新版）
      isGitRepo: !!currentCommit, // 是否 git 部署（后台一键升级/手动 git pull 的前提）
      upgradeEnabled: UPGRADE_ENABLED,
      upgrading: this.upgrading,
      repo: REPO,
    };
  }

  /** Redis 是否真的能读能写。只连上不算数——密码错、库满都是连得上但写不进。 */
  private async redisOk(): Promise<boolean> {
    try {
      const key = `__deploy_check_${process.pid}`;
      await this.cache.set(key, 'ok', 5000);
      const got = await this.cache.get(key);
      await this.cache.del(key).catch(() => undefined);
      return got === 'ok';
    } catch {
      return false;
    }
  }

  /** 部署自检：采集运行时事实 → 交给纯函数判定。逐项给出现状与改法。 */
  async deployCheck() {
    const [storage, uploadsWritable, redisOk] = await Promise.all([
      this.storage.status(),
      this.storage.localWritable(),
      this.redisOk(),
    ]);
    const checks = buildDeployChecks({
      nodeEnv: process.env.NODE_ENV,
      dbSynchronize: process.env.DB_SYNCHRONIZE === 'true',
      trustProxy: process.env.TRUST_PROXY,
      sawForwardedFor: sawForwardedFor(),
      seedAdminPassword: process.env.SEED_ADMIN_PASSWORD,
      allowInsecureJwt: process.env.ALLOW_INSECURE_JWT_SECRET,
      storageDriver: storage.driver,
      storageWarnings: storage.warnings.length,
      localReferencedFiles: storage.localReferenced,
      localOrphanFiles: storage.localOrphans,
      uploadsWritable,
      redisOk,
    });
    return { ...summarizeDeployChecks(checks), checks };
  }

  async upgrade() {
    if (!UPGRADE_ENABLED)
      return { started: false, message: '后台一键升级未启用。请在服务器设 ALLOW_ADMIN_UPGRADE=true 并确保 app 进程有权限执行 upgrade.sh（详见 UPGRADE.md），或直接在服务器运行 ./upgrade.sh。' };
    const script = join(REPO_DIR, 'upgrade.sh');
    if (!fs.existsSync(script)) return { started: false, message: `未找到升级脚本 ${script}` };
    if (this.upgrading) return { started: false, message: '升级已在进行中' };
    this.upgrading = true;
    try {
      // detached 拉起 upgrade.sh：应用重启后本进程会被替换，故脱离进程组 + 输出重定向到日志，不随本进程退出而中断。
      const logFd = fs.openSync(join(REPO_DIR, 'upgrade.log'), 'a');
      const child = spawn('bash', [script], {
        cwd: REPO_DIR,
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env: process.env,
      });
      child.unref();
      this.logger.warn(`后台触发升级：pid=${child.pid}，日志 ${join(REPO_DIR, 'upgrade.log')}`);
      // 15 分钟后清 upgrading 标志（防脚本异常卡死；正常情况下进程已随重启结束）
      setTimeout(() => { this.upgrading = false; }, 15 * 60 * 1000).unref();
      return { started: true, message: '升级已启动，将在后台完成拉取/迁移/重建/重启，请稍后刷新查看版本。' };
    } catch (e: any) {
      this.upgrading = false;
      return { started: false, message: `升级启动失败：${e?.message || e}` };
    }
  }
}
