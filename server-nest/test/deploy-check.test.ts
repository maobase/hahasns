import { describe, expect, it } from 'vitest';
import {
  buildDeployChecks,
  summarizeDeployChecks,
  type DeployFacts,
} from '../src/modules/system/deploy-check';

/** 一份「全绿」基线：每个用例只改自己关心的那一项，避免互相干扰。 */
const CLEAN: DeployFacts = {
  nodeEnv: 'production',
  dbSynchronize: false,
  trustProxy: '1',
  sawForwardedFor: true,
  seedAdminPassword: undefined,
  allowInsecureJwt: undefined,
  storageDriver: 'local',
  storageWarnings: 0,
  localReferencedFiles: 0,
  localOrphanFiles: 0,
  uploadsWritable: true,
  redisOk: true,
};

const byId = (f: Partial<DeployFacts>, id: string) =>
  buildDeployChecks({ ...CLEAN, ...f }).find((c) => c.id === id)!;

describe('buildDeployChecks — 全绿基线', () => {
  it('干净部署每一项都是 ok，整体结论也是 ok', () => {
    const checks = buildDeployChecks(CLEAN);
    expect(checks.every((c) => c.level === 'ok')).toBe(true);
    expect(summarizeDeployChecks(checks)).toEqual({ level: 'ok', fails: 0, warns: 0 });
  });

  it('全绿时不产生存量迁移那一条（只对 s3 有意义）', () => {
    expect(buildDeployChecks(CLEAN).find((c) => c.id === 'storage-migrate')).toBeUndefined();
  });

  it('ok 的项不给改法（没什么要改的）', () => {
    expect(buildDeployChecks(CLEAN).every((c) => !c.fix)).toBe(true);
  });
});

describe('buildDeployChecks — 反代真实 IP', () => {
  it('挂在反代后面却没设 TRUST_PROXY → fail，并指出限流失效', () => {
    const c = byId({ trustProxy: undefined, sawForwardedFor: true }, 'proxy');
    expect(c.level).toBe('fail');
    expect(c.detail).toContain('X-Forwarded-For');
    expect(c.detail).toContain('限流');
    expect(c.fix).toContain('TRUST_PROXY=1');
  });

  it('没观察到反代且没设 TRUST_PROXY → ok（直连部署是正常形态）', () => {
    expect(byId({ trustProxy: undefined, sawForwardedFor: false }, 'proxy').level).toBe('ok');
  });

  it('设了 TRUST_PROXY 就不再看 XFF，并回显实际取值', () => {
    const c = byId({ trustProxy: 'loopback', sawForwardedFor: false }, 'proxy');
    expect(c.level).toBe('ok');
    expect(c.detail).toContain('loopback');
  });
});

describe('buildDeployChecks — 建表开关与种子密码', () => {
  it('DB_SYNCHRONIZE 还开着 → warn（能跑，但改表不可逆）', () => {
    const c = byId({ dbSynchronize: true }, 'db-sync');
    expect(c.level).toBe('warn');
    expect(c.fix).toContain('DB_SYNCHRONIZE=false');
  });

  it('SEED_ADMIN_PASSWORD 残留 → warn，且自检本身不回显密码', () => {
    const c = byId({ seedAdminPassword: 'hunter2' }, 'seed-admin');
    expect(c.level).toBe('warn');
    expect(`${c.detail}${c.fix}`).not.toContain('hunter2');
  });

  it('空字符串的种子密码等同没设', () => {
    expect(byId({ seedAdminPassword: '' }, 'seed-admin').level).toBe('ok');
  });
});

describe('buildDeployChecks — 令牌密钥', () => {
  it('放行了公开占位密钥 → fail，并点明可被伪造管理员令牌', () => {
    const c = byId({ allowInsecureJwt: 'true' }, 'jwt');
    expect(c.level).toBe('fail');
    expect(c.detail).toContain('伪造');
    expect(c.fix).toContain('JWT_SECRET');
  });

  it('只有字面量 true 才算放行', () => {
    expect(byId({ allowInsecureJwt: 'false' }, 'jwt').level).toBe('ok');
  });
});

describe('buildDeployChecks — 运行模式与缓存', () => {
  it('NODE_ENV 不是 production → warn 且回显当前值', () => {
    const c = byId({ nodeEnv: 'development' }, 'node-env');
    expect(c.level).toBe('warn');
    expect(c.detail).toContain('development');
  });

  it('NODE_ENV 完全没设时也说得明白，不出现 undefined', () => {
    const c = byId({ nodeEnv: undefined }, 'node-env');
    expect(c.level).toBe('warn');
    expect(c.detail).toContain('未设置');
    expect(c.detail).not.toContain('undefined');
  });

  it('Redis 不通 → warn（降级不是宕机）', () => {
    const c = byId({ redisOk: false }, 'redis');
    expect(c.level).toBe('warn');
    expect(c.fix).toContain('REDIS_URL');
  });
});

describe('buildDeployChecks — 媒体存储', () => {
  it('本地目录写不进去 → fail，压过配置预警', () => {
    const c = byId({ uploadsWritable: false, storageWarnings: 3 }, 'storage');
    expect(c.level).toBe('fail');
    expect(c.detail).toContain('发图');
  });

  it('配置有预警 → warn 并报出条数', () => {
    const c = byId({ storageDriver: 's3', uploadsWritable: null, storageWarnings: 2 }, 'storage');
    expect(c.level).toBe('warn');
    expect(c.detail).toContain('2 条');
  });

  it('s3 驱动下 uploadsWritable=null 不会被当成写不进去', () => {
    expect(byId({ storageDriver: 's3', uploadsWritable: null }, 'storage').level).toBe('ok');
  });

  it('切了 s3 且存量还被引用 → 多一条迁移提醒，并给出脚本命令', () => {
    const c = byId(
      { storageDriver: 's3', uploadsWritable: null, localReferencedFiles: 42 },
      'storage-migrate',
    );
    expect(c.level).toBe('warn');
    expect(c.detail).toContain('42');
    expect(c.fix).toContain('migrate-uploads-to-s3.mjs');
  });

  it('被引用与孤儿同时存在 → 报被引用的数量，孤儿只作附注', () => {
    const c = byId(
      { storageDriver: 's3', uploadsWritable: null, localReferencedFiles: 3, localOrphanFiles: 7 },
      'storage-migrate',
    );
    expect(c.level).toBe('warn');
    expect(c.detail).toContain('3');
    expect(c.detail).toContain('7');
    expect(c.detail).toContain('不用管');
  });

  it('存量全是孤儿 → 报 ok 并说明不用迁（env2 实测就是这个形状）', () => {
    const c = byId(
      { storageDriver: 's3', uploadsWritable: null, localReferencedFiles: 0, localOrphanFiles: 2 },
      'storage-migrate',
    );
    expect(c.level).toBe('ok');
    expect(c.detail).toContain('2');
    expect(c.fix).toBeUndefined(); // 没问题就没有「改法」
  });

  it('本地驱动下有存量文件是常态，不提示迁移', () => {
    const checks = buildDeployChecks({
      ...CLEAN,
      localReferencedFiles: 99,
      localOrphanFiles: 99,
    });
    expect(checks.find((c) => c.id === 'storage-migrate')).toBeUndefined();
  });
});

describe('summarizeDeployChecks', () => {
  it('有 fail 时整体取 fail，即使 warn 更多', () => {
    const checks = buildDeployChecks({
      ...CLEAN,
      trustProxy: undefined,
      sawForwardedFor: true,
      dbSynchronize: true,
      redisOk: false,
    });
    expect(summarizeDeployChecks(checks)).toEqual({ level: 'fail', fails: 1, warns: 2 });
  });

  it('只有 warn 时整体取 warn', () => {
    const checks = buildDeployChecks({ ...CLEAN, dbSynchronize: true });
    expect(summarizeDeployChecks(checks)).toMatchObject({ level: 'warn', fails: 0, warns: 1 });
  });

  it('空列表按 ok 处理', () => {
    expect(summarizeDeployChecks([])).toEqual({ level: 'ok', fails: 0, warns: 0 });
  });
});

describe('buildDeployChecks — 结构约定', () => {
  it('每条都有唯一 id、非空标题与现状描述', () => {
    const checks = buildDeployChecks({
      ...CLEAN,
      storageDriver: 's3',
      uploadsWritable: null,
      localReferencedFiles: 5,
    });
    const ids = checks.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(checks.every((c) => c.title && c.detail)).toBe(true);
  });

  it('非 ok 的项一律带改法——只报问题不给出路等于没报', () => {
    const checks = buildDeployChecks({
      ...CLEAN,
      nodeEnv: 'development',
      dbSynchronize: true,
      trustProxy: undefined,
      sawForwardedFor: true,
      seedAdminPassword: 'x',
      allowInsecureJwt: 'true',
      redisOk: false,
      uploadsWritable: false,
    });
    expect(checks.filter((c) => c.level !== 'ok').every((c) => !!c.fix)).toBe(true);
  });
});
