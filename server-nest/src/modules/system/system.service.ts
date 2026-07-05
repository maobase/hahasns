import { Injectable, Logger } from '@nestjs/common';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import { join } from 'path';

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
  private cache: { at: number; latest: string | null } = { at: 0, latest: null };
  private upgrading = false;

  private async localCommit(): Promise<string | null> {
    try {
      const { stdout } = await pexec('git rev-parse --short HEAD', { cwd: REPO_DIR });
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }

  private localVersion(): string | null {
    try {
      const txt = fs.readFileSync(join(REPO_DIR, 'client', 'src', 'version.ts'), 'utf8');
      return (txt.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/) || [])[1] || null;
    } catch {
      return null;
    }
  }

  private refreshing = false;

  /** 非阻塞取最新 commit：立即返回缓存（可能 null），缓存空/过期时后台异步刷新（GitHub 不可达也不卡住页面）。 */
  private latestCommitCached(): string | null {
    if (!this.cache.latest || Date.now() - this.cache.at > 5 * 60 * 1000) void this.refreshLatest();
    return this.cache.latest;
  }

  private async refreshLatest(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      const resp = await fetch(`https://api.github.com/repos/${REPO}/commits/${BRANCH}`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'hahasns-selfhost' },
        signal: AbortSignal.timeout(6000),
      });
      if (resp.ok) {
        const data: any = await resp.json();
        if (typeof data?.sha === 'string') this.cache = { at: Date.now(), latest: data.sha.slice(0, 7) };
      }
    } catch {
      // 网络不通（如服务器无法访问 GitHub）→ 保持 latest=null，页面显示"检测暂不可用"
    } finally {
      this.refreshing = false;
    }
  }

  async status() {
    const current = await this.localCommit();
    const latest = this.latestCommitCached();
    const updateAvailable = !!(current && latest && current !== latest);
    return {
      currentVersion: this.localVersion(),
      currentCommit: current,
      latestCommit: latest,
      updateAvailable,
      canCheck: !!latest, // GitHub 是否可达
      isGitRepo: !!current, // 是否 git 部署（能升级的前提）
      upgradeEnabled: UPGRADE_ENABLED,
      upgrading: this.upgrading,
      repo: REPO,
    };
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
