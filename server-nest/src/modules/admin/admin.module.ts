import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AdminLog,
  Board,
  Comment,
  Moderator,
  Post,
  Product,
  Report,
  Thread,
  Topic,
  User,
} from '../../database/entities';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SiteModule } from '../site/site.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Post,
      Thread,
      Comment,
      Topic,
      Board,
      Moderator,
      Report,
      Product,
      AdminLog,
    ]),
    SiteModule, // 复用 SiteService.getConfig/setConfig + MODULE_KEYS
    StorageModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
