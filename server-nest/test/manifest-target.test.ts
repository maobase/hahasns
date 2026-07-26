import { describe, test, expect } from 'vitest';
// @ts-expect-error —— 脚本侧是纯 JS（.mjs），没有类型声明，这里只测行为
import { parsePersistentMounts, resolveManifestTarget } from '../scripts/lib/manifest-target.mjs';

/**
 * 迁移回滚清单的落点判断。
 * 要钉住的核心事实：容器里 cwd 是可写层不是卷，清单写进去看着成功、容器一重建就没了——
 * 而它恰恰是「迁错了能还原」这个承诺的全部依托。
 */

// 容器里 /proc/mounts 的典型形状：/ 是 overlay，/app/uploads 是卷，/etc/hosts 是单文件 bind
const CONTAINER_MOUNTS = `overlay / overlay rw,relatime,lowerdir=/var/lib/docker/overlay2/l/AAA 0 0
proc /proc proc rw,nosuid,nodev,noexec,relatime 0 0
tmpfs /dev tmpfs rw,nosuid,size=65536k,mode=755 0 0
sysfs /sys sysfs ro,nosuid,nodev,noexec,relatime 0 0
/dev/vda1 /app/uploads ext4 rw,relatime 0 0
/dev/vda1 /etc/hosts ext4 rw,relatime 0 0
shm /dev/shm tmpfs rw,nosuid,nodev,noexec,relatime,size=65536k 0 0`;

describe('parsePersistentMounts', () => {
  test('只留下真正落在宿主机磁盘上的挂载点', () => {
    expect(parsePersistentMounts(CONTAINER_MOUNTS)).toEqual(['/app/uploads', '/etc/hosts']);
  });

  test('根挂载点不算（容器的 / 就是那层活不过重建的可写层）', () => {
    expect(parsePersistentMounts(CONTAINER_MOUNTS)).not.toContain('/');
  });

  test('tmpfs / overlay / 伪文件系统一律排除，它们都不持久', () => {
    const points = parsePersistentMounts(CONTAINER_MOUNTS);
    for (const p of ['/dev', '/proc', '/sys', '/dev/shm']) expect(points).not.toContain(p);
  });

  test('挂载点里的转义空格还原（\\040）', () => {
    expect(parsePersistentMounts('/dev/sdb /mnt/my\\040disk ext4 rw 0 0')).toEqual(['/mnt/my disk']);
  });

  test('空输入 / 残缺行不抛异常', () => {
    expect(parsePersistentMounts('')).toEqual([]);
    expect(parsePersistentMounts('garbage\n/dev/sda\n')).toEqual([]);
    expect(parsePersistentMounts(undefined as any)).toEqual([]);
  });
});

describe('resolveManifestTarget', () => {
  test('宿主机直跑：cwd 即落点，不翻挂载表，也不啰嗦', () => {
    const t = resolveManifestTarget({ cwd: '/home/tt/hahasns', inContainer: false });
    expect(t.dir).toBe('/home/tt/hahasns');
    expect(t.persistent).toBe(true);
    expect(t.warnings).toEqual([]);
  });

  test('容器里落在可写层：判为非持久，并给出能直接粘的 docker cp', () => {
    const t = resolveManifestTarget({
      cwd: '/app/server-nest',
      inContainer: true,
      mountPoints: parsePersistentMounts(CONTAINER_MOUNTS),
      uploadsDir: '/app/uploads',
      containerHint: 'hahasns',
    });
    expect(t.persistent).toBe(false);
    const text = t.warnings.join('\n');
    expect(text).toContain('docker cp hahasns:/app/server-nest/migrate-rollback-*.json');
    expect(text).toContain('--manifest-dir /app/manifests');
  });

  test('提示里给的 /app/manifests 必须真的挂在仓库 compose 里，否则是又一张空头支票', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const yml = fs.readFileSync(path.join(__dirname, '../../docker-compose.yml'), 'utf8');
    expect(yml).toMatch(/:\/app\/manifests\s*$/m);
  });

  test('拿不到容器名时占位符兜底，命令不会印出半截', () => {
    const t = resolveManifestTarget({ cwd: '/app/server-nest', inContainer: true, mountPoints: [] });
    expect(t.warnings.join('\n')).toContain('docker cp <容器名>:/app/server-nest/');
  });

  test('容器里但指到挂载卷上：算持久，不再警告', () => {
    const t = resolveManifestTarget({
      cwd: '/app/server-nest',
      explicitDir: '/app/backup',
      inContainer: true,
      mountPoints: ['/app/backup'],
    });
    expect(t.dir).toBe('/app/backup');
    expect(t.persistent).toBe(true);
    expect(t.warnings).toEqual([]);
  });

  test('挂载点的子目录也算持久', () => {
    const t = resolveManifestTarget({
      cwd: '/data/vol/sub/dir',
      inContainer: true,
      mountPoints: ['/data/vol'],
    });
    expect(t.persistent).toBe(true);
  });

  test('只是前缀像但不是子目录的，不算（/app/uploads-old ≠ /app/uploads 下）', () => {
    const t = resolveManifestTarget({
      cwd: '/app/uploads-old',
      inContainer: true,
      mountPoints: ['/app/uploads'],
    });
    expect(t.persistent).toBe(false);
  });

  test('--manifest-dir 覆盖 cwd', () => {
    const t = resolveManifestTarget({ cwd: '/tmp', explicitDir: '/srv/manifests' });
    expect(t.dir).toBe('/srv/manifests');
  });

  test('指到上传目录里会被拦：那整个目录是 /uploads 公开伺服的', () => {
    const t = resolveManifestTarget({
      cwd: '/app/server-nest',
      explicitDir: '/app/uploads',
      inContainer: true,
      mountPoints: ['/app/uploads'],
      uploadsDir: '/app/uploads',
    });
    // 持久是持久，但公网能下载 —— 两件事分开报，别因为「持久」就放行
    expect(t.persistent).toBe(true);
    expect(t.publiclyServed).toBe(true);
    expect(t.warnings.join('\n')).toContain('/uploads');
  });

  test('没配 uploadsDir 时不会误判成公开目录', () => {
    const t = resolveManifestTarget({ cwd: '/app/server-nest' });
    expect(t.publiclyServed).toBe(false);
  });
});

describe('脚本确实用了这套判断', () => {
  test('migrate-uploads-to-s3.mjs 的清单路径基于 manifest.dir，不是写死的 cwd', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '../scripts/migrate-uploads-to-s3.mjs'),
      'utf8',
    );
    expect(src).toContain('resolveManifestTarget');
    expect(src).toMatch(/path\.resolve\(manifest\.dir,\s*`migrate-rollback-/);
    // 回到 process.cwd() 就等于把这轮修的坑又埋回去了
    expect(src).not.toMatch(/path\.resolve\(process\.cwd\(\),\s*`migrate-rollback-/);
  });
});
