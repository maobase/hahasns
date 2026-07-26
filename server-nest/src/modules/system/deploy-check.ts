/**
 * 部署自检：把「只写进 stdout、站长永远看不到」的部署级问题摆到后台页面上。
 *
 * 面板部署（1Panel / 宝塔）的站长几乎不看容器日志，所以启动时的告警等于没发生。
 * 这里把同一批事实重新算一遍并回给后台，每条都说清「哪儿不对 + 怎么改」。
 * 纯函数：事实由调用方采集后整体传入，不读 process.env，方便测。
 */

export type CheckLevel = 'ok' | 'warn' | 'fail';

export interface DeployCheck {
  /** 稳定标识，前端按它做 key，也方便日后单独引用某一项 */
  id: string;
  level: CheckLevel;
  title: string;
  /** 现状描述——只说观察到了什么 */
  detail: string;
  /** 该怎么改。level 为 ok 时通常没有 */
  fix?: string;
}

/** 自检所需的全部运行时事实。调用方负责采集，本模块只负责判断。 */
export interface DeployFacts {
  nodeEnv?: string;
  /** TypeORM 是否还在按实体自动改表结构 */
  dbSynchronize: boolean;
  /** TRUST_PROXY 原始值（未设为空） */
  trustProxy?: string;
  /** 本进程启动以来是否收到过带 X-Forwarded-For 的请求 */
  sawForwardedFor: boolean;
  /** SEED_ADMIN_PASSWORD 是否还留在环境变量里 */
  seedAdminPassword?: string;
  /** ALLOW_INSECURE_JWT_SECRET —— 放行了公开占位密钥 */
  allowInsecureJwt?: string;
  storageDriver: 'local' | 's3';
  /** 存储页那份配置预警的条数 */
  storageWarnings: number;
  /**
   * 本地上传目录里「还被内容引用」的文件数（切了对象存储才有意义）。
   * 只数文件个数会把孤儿也算成待迁——env2 实测报「还剩 2 个」，迁移脚本 dry-run 待重写 0 个。
   */
  localReferencedFiles: number;
  /** 本地上传目录里没人引用的残留文件数。不需要迁，只作为附注提一句。 */
  localOrphanFiles: number;
  /** 本地上传目录可写；s3 驱动下不适用，传 null */
  uploadsWritable: boolean | null;
  /** Redis 读写往返是否通 */
  redisOk: boolean;
}

const RANK: Record<CheckLevel, number> = { ok: 0, warn: 1, fail: 2 };

export function buildDeployChecks(f: DeployFacts): DeployCheck[] {
  const checks: DeployCheck[] = [];

  // ── 令牌密钥。main.ts 会因占位密钥 fail-fast，只有显式放行才跑得起来 ──
  if (f.allowInsecureJwt === 'true') {
    checks.push({
      id: 'jwt',
      level: 'fail',
      title: '登录令牌密钥',
      detail:
        '设了 ALLOW_INSECURE_JWT_SECRET=true，放行了公开仓库里的示例密钥。任何人照着仓库就能伪造管理员令牌登录。',
      fix: '设一个强随机 JWT_SECRET（openssl rand -hex 32），删掉 ALLOW_INSECURE_JWT_SECRET 后重启。改密钥会让现有登录态全部失效，属正常。',
    });
  } else {
    checks.push({
      id: 'jwt',
      level: 'ok',
      title: '登录令牌密钥',
      detail: '已使用自定义 JWT_SECRET。',
    });
  }

  // ── 反代真实 IP ──
  if (f.trustProxy) {
    checks.push({
      id: 'proxy',
      level: 'ok',
      title: '访客真实 IP',
      detail: `已设 TRUST_PROXY=${f.trustProxy}，按 IP 的注册/发帖限流取的是真实访客 IP。`,
    });
  } else if (f.sawForwardedFor) {
    checks.push({
      id: 'proxy',
      level: 'fail',
      title: '访客真实 IP',
      detail:
        '请求带着 X-Forwarded-For 进来，说明站点挂在反向代理（Nginx / 宝塔 / 1Panel / Cloudflare）后面，但没设 TRUST_PROXY。所有访客在后端看来都来自同一个代理 IP，按 IP 的注册与发帖限流形同虚设。',
      fix: '在 .env 里设 TRUST_PROXY=1（只信任最近一跳）后重启。',
    });
  } else {
    checks.push({
      id: 'proxy',
      level: 'ok',
      title: '访客真实 IP',
      detail: '没观察到反向代理，按直连处理，req.ip 就是访客 IP。',
    });
  }

  // ── 表结构自动同步 ──
  checks.push(
    f.dbSynchronize
      ? {
          id: 'db-sync',
          level: 'warn',
          title: '表结构自动同步',
          detail:
            'DB_SYNCHRONIZE 还开着：每次启动 TypeORM 都会按实体去改表结构。建表用完就该关，否则一次改错是不可逆的。',
          fix: '在 .env 里设 DB_SYNCHRONIZE=false 后重启。',
        }
      : {
          id: 'db-sync',
          level: 'ok',
          title: '表结构自动同步',
          detail: 'DB_SYNCHRONIZE 已关闭，启动不会自动改表。',
        },
  );

  // ── 首启管理员种子 ──
  checks.push(
    f.seedAdminPassword
      ? {
          id: 'seed-admin',
          level: 'warn',
          title: '首启管理员种子',
          detail:
            'SEED_ADMIN_PASSWORD 还留在环境变量里。管理员建好后它不再起作用，但等于把后台密码明文放在配置文件中。',
          fix: '删掉 SEED_ADMIN_USER / SEED_ADMIN_PASSWORD 两行后重启。',
        }
      : {
          id: 'seed-admin',
          level: 'ok',
          title: '首启管理员种子',
          detail: '环境变量里没有残留的管理员初始密码。',
        },
  );

  // ── 运行模式 ──
  checks.push(
    f.nodeEnv === 'production'
      ? {
          id: 'node-env',
          level: 'ok',
          title: '运行模式',
          detail: 'NODE_ENV=production。',
        }
      : {
          id: 'node-env',
          level: 'warn',
          title: '运行模式',
          detail: `NODE_ENV 当前是 ${f.nodeEnv || '（未设置）'}，不是 production。部分依赖会走开发分支，日志更啰嗦、性能也更差。`,
          fix: '在 .env 里设 NODE_ENV=production 后重启。',
        },
  );

  // ── 缓存 ──
  checks.push(
    f.redisOk
      ? { id: 'redis', level: 'ok', title: '缓存（Redis）', detail: 'Redis 读写往返正常。' }
      : {
          id: 'redis',
          level: 'warn',
          title: '缓存（Redis）',
          detail:
            'Redis 读写不通，缓存整体降级。站点还能用，但每个请求都要落数据库，人一多就慢。',
          fix: '检查 REDIS_URL 指向的实例是否在跑、端口是否放行。',
        },
  );

  // ── 存储 ──
  if (f.storageDriver === 'local' && f.uploadsWritable === false) {
    checks.push({
      id: 'storage',
      level: 'fail',
      title: '媒体存储',
      detail: '本地上传目录写不进去，用户一发图就会失败。',
      fix: '检查 UPLOADS_DIR 指向的目录是否存在、进程有没有写权限（docker 部署多半是卷挂载的属主问题）。',
    });
  } else if (f.storageWarnings > 0) {
    checks.push({
      id: 'storage',
      level: 'warn',
      title: '媒体存储',
      detail: `存储配置有 ${f.storageWarnings} 条待处理提示（驱动：${f.storageDriver}）。`,
      fix: '到「系统 → 存储」页看提示详情，并点一次「测试连接」实测。',
    });
  } else {
    checks.push({
      id: 'storage',
      level: 'ok',
      title: '媒体存储',
      detail:
        f.storageDriver === 's3' ? '对象存储配置完整。' : '本地磁盘存储，上传目录可写。',
    });
  }

  // 切了对象存储但存量没搬走：老图仍走本地目录，换机器/重建容器就全丢。
  // 只报「还被内容引用」的那部分——没人引用的残留迁过去只是往桶里添孤儿，迁移脚本本来也不碰。
  if (f.storageDriver === 's3' && f.localReferencedFiles > 0) {
    const orphanNote = f.localOrphanFiles > 0 ? `（另有 ${f.localOrphanFiles} 个无引用残留，不用管）` : '';
    checks.push({
      id: 'storage-migrate',
      level: 'warn',
      title: '存量文件迁移',
      detail: `已切到对象存储，但本地上传目录里还有 ${f.localReferencedFiles} 个文件仍被内容引用${orphanNote}。它们还从本机 /uploads 提供，换机器或重建容器（未挂卷）这些图就裂。`,
      fix: '运行 node server-nest/scripts/migrate-uploads-to-s3.mjs --execute --yes 把被引用的存量搬到桶里。',
    });
  } else if (f.storageDriver === 's3' && f.localOrphanFiles > 0) {
    checks.push({
      id: 'storage-migrate',
      level: 'ok',
      title: '存量文件迁移',
      detail: `本地上传目录还剩 ${f.localOrphanFiles} 个文件，但库里已经没有内容引用它们（删过的帖子、测试残留）。不用迁，迁过去也只是给桶里添孤儿。`,
    });
  }

  return checks;
}

/** 整体结论：取最严重的一项，并给出计数供页面做摘要。 */
export function summarizeDeployChecks(checks: DeployCheck[]): {
  level: CheckLevel;
  fails: number;
  warns: number;
} {
  let level: CheckLevel = 'ok';
  let fails = 0;
  let warns = 0;
  for (const c of checks) {
    if (c.level === 'fail') fails++;
    else if (c.level === 'warn') warns++;
    if (RANK[c.level] > RANK[level]) level = c.level;
  }
  return { level, fails, warns };
}
