import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import { join } from 'path';
import { entities } from './entities';

/**
 * 迁移专用 DataSource —— 供 TypeORM CLI（migration:generate / run / revert）与升级脚本 upgrade.sh 使用。
 *
 * 与运行时 (src/database/database.module.ts + src/config/configuration.ts) 读同一批 env、同一批实体、同一驱动，
 * 保证 CLI 生成/执行迁移时连的库、schema 与线上运行完全一致。synchronize 恒 false —— 迁移体系下由版本化迁移
 * 受控演进 schema，不再让 TypeORM 自动"猜表"。migrations glob 同时匹配 .ts（ts-node 生成时）与 .js（线上跑 dist 构建产物）。
 */
const client = (process.env.DB_CLIENT || 'mysql').toLowerCase();
const isPostgres = client === 'postgres' || client === 'postgresql';

export const dataSourceOptions: DataSourceOptions = {
  type: isPostgres ? 'postgres' : 'mysql',
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || (isPostgres ? '5432' : '3306'), 10),
  username: process.env.DB_USER || 'hahasns',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hahasns',
  entities,
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
} as DataSourceOptions;

export default new DataSource(dataSourceOptions);
