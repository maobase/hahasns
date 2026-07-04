import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LotteryDraw, LotteryPrize, User } from '../../database/entities';
import { LotteryController } from './lottery.controller';
import { LotteryService } from './lottery.service';
import { SiteModule } from '../site/site.module';

@Module({
  imports: [TypeOrmModule.forFeature([LotteryPrize, LotteryDraw, User]), SiteModule],
  controllers: [LotteryController],
  providers: [LotteryService],
})
export class LotteryModule {}
