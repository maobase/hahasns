import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 「服务端读的环境变量，docker 部署路径能不能配上」——对账用例。
 *
 * 起因：`ANTHROPIC_API_KEY` 被六处文档（含 .env.example 与 compose 自己的注释）写成
 * 「在 .env 里配上就能启用 AI 助手」，但仓库的 docker-compose.yml 从没在 `environment:`
 * 里声明它，而这个 compose 没有 `env_file:`——于是照文档配了完全不生效，助手一直停在演示模式，
 * 也不会报任何错。两台自有环境都是定制部署（systemd / 自己的 compose + env_file），
 * 正好都绕开了这条路径，所以谁都没发现。
 *
 * compose 里那份 `environment:` 是白名单：漏写一个，用官方文档部署的人就配不上。
 * 光靠人肉记着「加 env 时顺手改 compose」是不行的，所以在这里对一遍账。
 */

const REPO = path.join(__dirname, '../..');

/**
 * 有意不透传的变量，每条都得写清为什么。
 * 想加新条目先想清楚：是「站长不该配」，还是「我懒得加」——后者请去改 compose。
 */
const INTENTIONALLY_NOT_PASSED: Record<string, string> = {
  // —— compose 自己的接线，让 .env 覆盖只会把容器配坏 ——
  DB_CLIENT: 'compose 固定 mysql，跟着 mariadb 服务走',
  DB_HOST: 'compose 固定为服务名 mariadb',
  DB_PORT: 'compose 固定 3306（容器内端口）',
  DB_USER: 'compose 固定 hahasns，与 mariadb 服务的初始化参数配套',
  DB_NAME: 'compose 固定 hahasns，同上',
  REDIS_URL: 'compose 固定指向 redis 服务名',
  CLIENT_DIST: '镜像内路径，改了就找不到前端',
  UPLOADS_DIR: '镜像内路径，与 hahasns-uploads 卷的挂载点绑定',
  PORT: '容器内固定 4000；对外端口用 APP_PORT 映射',
  NODE_ENV: 'compose 固定 production',

  // —— 逃生舱与未完工能力，加进去等于承诺做不到 / 不该做的事 ——
  ALLOW_INSECURE_JWT_SECRET:
    '放行公开仓库示例密钥的逃生舱，部署自检会直接标红。不给现成开关。',
  DB_MIGRATIONS_RUN: 'TypeORM 迁移链路还没打通，advertise 会误导（见 HANDOVER §5.1）',
  ALLOW_ADMIN_UPGRADE:
    'compose 路径下容器里既没有 git 仓库也没有 docker socket，一键升级跑不起来；' +
    '加个假开关不如在 UPGRADE.md 里说清（见 HANDOVER §5）',
  UPGRADE_REPO: '同 ALLOW_ADMIN_UPGRADE',
  UPGRADE_BRANCH: '同 ALLOW_ADMIN_UPGRADE',
  REPO_DIR: '同 ALLOW_ADMIN_UPGRADE',

  // —— 只给本地脚本用，不进服务进程 ——
  SEED_BASE: '仅播种脚本 seed.ts 用',
  SEED_PASSWORD: '仅播种脚本用',
  SEED_PREFIX: '仅播种脚本用',
  SQLITE_PATH: '仅本地开发的 sqlite 模式用，docker 一律走 mariadb',
  DB_LOGGING: '本地排查用的 SQL 日志开关，线上开了刷屏',
};

/** 递归收集源码里出现过的 process.env.X。scripts/ 下混着 .js/.mjs，一并扫。 */
const SRC_EXT = ['.ts', '.js', '.mjs', '.cjs'];
function envVarsReadBySource(dir: string, out = new Set<string>()): Set<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      envVarsReadBySource(p, out);
    } else if (SRC_EXT.some((x) => e.name.endsWith(x))) {
      const src = fs.readFileSync(p, 'utf8');
      for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) out.add(m[1]);
      for (const m of src.matchAll(/process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g)) out.add(m[1]);
    }
  }
  return out;
}

/** compose 里 app 服务 `environment:` 声明了哪些键 */
function composeEnvKeys(): Set<string> {
  const yml = fs.readFileSync(path.join(REPO, 'docker-compose.yml'), 'utf8');
  // environment: 之后、下一个同级键（4 空格）之前的所有 6 空格键名
  const block = yml.match(/\n {4}environment:\n([\s\S]*?)\n {4}\S/);
  expect(block, 'docker-compose.yml 里没找到 app 服务的 environment 块，结构变了就来改这条用例').toBeTruthy();
  return new Set([...block![1].matchAll(/^ {6}([A-Z][A-Z0-9_]*):/gm)].map((m) => m[1]));
}

describe('docker 部署路径能配上服务端认的环境变量', () => {
  test('每个 process.env.X 要么 compose 透传了，要么在豁免清单里写明了原因', () => {
    const read = envVarsReadBySource(path.join(__dirname, '../src'));
    const passed = composeEnvKeys();
    const missing = [...read].filter((v) => !passed.has(v) && !(v in INTENTIONALLY_NOT_PASSED));
    expect(
      missing,
      `这些变量服务端会读，但 docker-compose.yml 没透传，照官方文档部署的人配了不生效：\n` +
        missing.map((v) => `  - ${v}`).join('\n') +
        `\n加进 compose 的 environment，或写进本文件的 INTENTIONALLY_NOT_PASSED 并说明为什么。`,
    ).toEqual([]);
  });

  test('豁免清单不留死条目——服务端已经不读的变量该从清单里删掉', () => {
    const read = envVarsReadBySource(path.join(__dirname, '../src'));
    // 播种脚本不在 src 下，单独补进来再比对
    const scriptDirs = [path.join(__dirname, '../scripts')];
    for (const d of scriptDirs) if (fs.existsSync(d)) envVarsReadBySource(d, read);
    const stale = Object.keys(INTENTIONALLY_NOT_PASSED).filter((v) => !read.has(v));
    expect(stale, `豁免清单里这些变量代码里已经不读了，删掉免得误导：${stale.join(', ')}`).toEqual([]);
  });

  test('compose 没有 env_file，所以 environment 块就是唯一入口', () => {
    // 这条钉的是上面两条的前提：哪天给 app 加了 env_file，透传规则就变了，
    // 那时该回来重新想清楚（env_file 会让任意 .env 变量进容器，白名单也就不成立了）。
    const yml = fs.readFileSync(path.join(REPO, 'docker-compose.yml'), 'utf8');
    const appBlock = yml.match(/\n {2}app:\n([\s\S]*?)\n {2}\S/)![1];
    expect(appBlock).not.toMatch(/^ {4}env_file:/m);
  });

  test('AI 助手的 key 确实透传了——这是本轮修的那条，单独钉一下', () => {
    expect(composeEnvKeys().has('ANTHROPIC_API_KEY')).toBe(true);
  });

  test('存储驱动可显式指定，不必只靠「有没有密钥」推断', () => {
    expect(composeEnvKeys().has('STORAGE_DRIVER')).toBe(true);
  });
});
