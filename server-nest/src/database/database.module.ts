import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';
import { entities } from './entities';

/**
 * TypeORM root module with an env-driven driver switch.
 * DB_CLIENT=mysql  -> mysql2 driver (default)
 * DB_CLIENT=postgres -> pg driver
 *
 * Host/port/user/pass/db all come from config (see src/config/configuration.ts).
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions => {
        const db = config.get('database');
        const isPostgres = db.client === 'postgres' || db.client === 'postgresql';
        return {
          type: isPostgres ? 'postgres' : 'mysql',
          host: db.host,
          port: db.port,
          username: db.username,
          password: db.password,
          database: db.database,
          entities,
          synchronize: db.synchronize,
          logging: db.logging,
          // 版本化迁移（升级用）：运行时加载 dist 构建的迁移文件；DB_MIGRATIONS_RUN=true 时启动即自动跑
          // 待执行迁移（否则由 upgrade.sh / `npm run migration:run` 显式执行）。表名与 data-source.ts 一致。
          migrations: [join(__dirname, 'migrations', '*.js')],
          migrationsTableName: 'typeorm_migrations',
          migrationsRun: process.env.DB_MIGRATIONS_RUN === 'true',
          // keep app boot resilient while infra spins up
          retryAttempts: 5,
          retryDelay: 2000,
          autoLoadEntities: true,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
