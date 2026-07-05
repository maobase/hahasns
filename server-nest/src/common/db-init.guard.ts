/**
 * 建表防呆（spec 03 §3.2）。
 *
 * 裸机安装者若手动配 env 时跳过 `DB_SYNCHRONIZE=true`，且没有版本化迁移，会得到
 * 「空库 + 每个请求 500」，且报错不指向原因，极难自查。启动时检测核心表是否存在：
 * 缺失且未开 synchronize → fail-fast 并打印带解决办法的错误。
 *
 * 决策抽成纯函数便于测试；调用方对「查询本身失败」一律 fail-open（放行，不阻断启动），
 * 只有在**确定**核心表缺失且未开 synchronize 时才 fail-close。
 */
export function shouldBlockForUninitializedDb(
  coreTableExists: boolean,
  synchronize: boolean | undefined | null,
): boolean {
  // synchronize=true 时 TypeORM 会在启动阶段自动建表，缺表是暂时的 → 不拦。
  // 仅当核心表确实不存在、且没开 synchronize（生产稳定态或漏配）→ 拦。
  return !coreTableExists && synchronize !== true;
}

/** fail-fast 错误文案（缺表且未开 synchronize 时打印）。 */
export const DB_UNINITIALIZED_MESSAGE =
  '[FATAL] 数据库未初始化：核心表 users 不存在，且 DB_SYNCHRONIZE 未开启。\n' +
  '        首次部署请任选其一初始化数据库：\n' +
  '          · 推荐：在 server-nest 目录运行  npm run migration:run  （按版本化迁移建好全部表）；\n' +
  '          · Docker：在 compose 的 app 服务 env 设 DB_MIGRATIONS_RUN=true 让容器启动自动迁移；\n' +
  '          · 或临时设 DB_SYNCHRONIZE=true 让 TypeORM 自动建表，启动成功后改回 false。\n' +
  '        （生产环境请保持 DB_SYNCHRONIZE=false 走迁移。详见仓库 UPGRADE.md。）';
