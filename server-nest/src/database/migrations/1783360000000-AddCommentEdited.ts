import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * comments 表加 `edited` 标记列（默认 0；被作者编辑过置 1，前端显示「· 已编辑」）。
 * 用 ADD COLUMN IF NOT EXISTS（MariaDB 支持）保持幂等：即便某实例已由 synchronize 建过该列，
 * 迁移也不会报错——便于将来 brownfield 接入迁移体系。
 */
export class AddCommentEdited1783360000000 implements MigrationInterface {
  name = 'AddCommentEdited1783360000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `comments` ADD COLUMN IF NOT EXISTS `edited` smallint NOT NULL DEFAULT '0'",
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `comments` DROP COLUMN IF EXISTS `edited`',
    );
  }
}
