/**
 * 决定「迁移回滚清单」写到哪里，以及那个位置是不是留得住。
 *
 * 起因：清单默认写在 cwd。宿主机直跑时 cwd 是仓库目录，没问题；但文档教 docker 用户跑的是
 *   docker compose exec app node scripts/migrate-uploads-to-s3.mjs --execute --yes
 * cwd 是容器里的 /app/server-nest —— 可写层，不是卷。清单看着写成功了，宿主机上看不见，
 * 下次 `docker compose up -d --build` 一重建就没了。等于「改库前有回滚清单兜底」这句承诺
 * 在 docker 路径上是空头支票，而且恰恰是最需要它的时候才发现。
 *
 * 这里只做判断和措辞，不落地：判定逻辑是纯函数（事实整体传入，不读 fs / process.env），
 * 采集事实的那一半在 collectManifestFacts()。
 */

/** 这些文件系统上的东西活不过容器重建，写进去等于没写。 */
const EPHEMERAL_FSTYPES = new Set([
  'overlay', 'overlay2', 'aufs', 'tmpfs', 'ramfs', 'devtmpfs', 'proc', 'sysfs',
  'devpts', 'cgroup', 'cgroup2', 'mqueue', 'securityfs', 'debugfs', 'tracefs',
  'fusectl', 'pstore', 'bpf', 'configfs', 'nsfs', 'binfmt_misc', 'shm',
]);

/**
 * 解析 /proc/mounts，取出「持久」挂载点（卷 / bind mount）。
 * 容器里 / 是 overlay、/dev 是 tmpfs，都会被滤掉；剩下的才是宿主机上真存在的东西。
 */
export function parsePersistentMounts(mountsText) {
  const out = [];
  for (const line of String(mountsText || '').split('\n')) {
    const parts = line.split(' ');
    if (parts.length < 3) continue;
    const point = parts[1].replace(/\\040/g, ' ').replace(/\\011/g, '\t');
    const fstype = parts[2];
    if (!point.startsWith('/') || point === '/') continue;
    if (EPHEMERAL_FSTYPES.has(fstype)) continue;
    out.push(point);
  }
  return out;
}

/** dir 是否落在某个挂载点里（含挂载点本身）。 */
function isUnder(dir, mountPoint) {
  return dir === mountPoint || dir.startsWith(mountPoint.replace(/\/$/, '') + '/');
}

/**
 * 决定清单目录 + 它留不留得住 + 会不会被公开访问。
 *
 * @param {object} facts
 * @param {string}   facts.cwd           进程当前目录（默认落点）
 * @param {string=}  facts.explicitDir   --manifest-dir 指定的目录
 * @param {boolean=} facts.inContainer   是不是跑在容器里
 * @param {string[]=} facts.mountPoints  持久挂载点（见 parsePersistentMounts）
 * @param {string=}  facts.uploadsDir    上传目录 —— 它整个被 /uploads 静态伺服，清单落这儿会被公网下载
 * @param {string=}  facts.containerHint docker cp 用的容器名/ID（os.hostname() 即可）
 * @returns {{dir: string, persistent: boolean, publiclyServed: boolean, containerHint: string, warnings: string[]}}
 */
export function resolveManifestTarget(facts) {
  const { cwd, explicitDir, inContainer = false, mountPoints = [], uploadsDir, containerHint } = facts;
  const dir = explicitDir || cwd;
  // 宿主机直跑时 cwd 本来就在真实磁盘上，不必翻挂载表；只有容器里才有「写了等于没写」的坑。
  const persistent = !inContainer || mountPoints.some((mp) => isUnder(dir, mp));
  const publiclyServed = !!uploadsDir && isUnder(dir, uploadsDir);

  const warnings = [];
  if (!persistent) {
    const target = containerHint || '<容器名>';
    warnings.push(
      `⚠ 回滚清单会写在容器里的 ${dir}，这不是挂载卷 —— 容器一重建（含 docker compose up -d --build）就没了。`,
      `  改库后请立刻拷到宿主机: docker cp ${target}:${dir}/migrate-rollback-*.json ./`,
      `  更省事的做法是让它直接落到宿主机: 加 --manifest-dir /app/manifests`,
      `  （仓库自带 docker-compose.yml 已把 /app/manifests 挂到宿主机的 ./.migrate-manifests；`,
      `    自己写的 compose 就换成你挂进来的任意目录，指错了这条警告还会再出现）`,
    );
  }
  if (publiclyServed) {
    warnings.push(
      `⚠ ${dir} 在上传目录里，而上传目录整个通过 /uploads 对外伺服 —— 清单会变成公网可下载的文件（含库中媒体路径与行号）。换个目录。`,
    );
  }
  return { dir, persistent, publiclyServed, containerHint: containerHint || '', warnings };
}

/**
 * 采集上面那些事实（这一半碰 fs / process，故与判定分开）。
 * 非 Linux（开发机 macOS）拿不到 /proc，直接按「不在容器里」处理，不误报。
 */
export function collectManifestFacts({ fs, os, cwd, explicitDir, uploadsDir }) {
  let inContainer = false;
  let mountPoints = [];
  try {
    inContainer = fs.existsSync('/.dockerenv');
    if (!inContainer && fs.existsSync('/proc/1/cgroup')) {
      inContainer = /docker|containerd|kubepods/.test(fs.readFileSync('/proc/1/cgroup', 'utf8'));
    }
    if (inContainer && fs.existsSync('/proc/mounts')) {
      mountPoints = parsePersistentMounts(fs.readFileSync('/proc/mounts', 'utf8'));
    }
  } catch {
    // 读不到就当宿主机处理：这只是提醒，不该因为探测失败中断迁移
  }
  return {
    cwd,
    explicitDir,
    uploadsDir,
    inContainer,
    mountPoints,
    containerHint: (() => { try { return os.hostname(); } catch { return ''; } })(),
  };
}
