import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { CommonModule } from './common/common.module';
import { RedisCacheModule } from './modules/cache/redis-cache.module';
import { StorageModule } from './modules/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PostsModule } from './modules/posts/posts.module';
import { CommentsModule } from './modules/comments/comments.module';
import { TopicsModule } from './modules/topics/topics.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MessagesModule } from './modules/messages/messages.module';
import { SearchModule } from './modules/search/search.module';
import { CirclesModule } from './modules/circles/circles.module';
import { QaModule } from './modules/qa/qa.module';
import { FlashModule } from './modules/flash/flash.module';
import { NavModule } from './modules/nav/nav.module';
import { AchievementsModule } from './modules/achievements/achievements.module';
import { MallModule } from './modules/mall/mall.module';
import { ForumModule } from './modules/forum/forum.module';
import { ReportsModule } from './modules/reports/reports.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { AdminModule } from './modules/admin/admin.module';
import { AiModule } from './modules/ai/ai.module';
import { SystemModule } from './modules/system/system.module';
import { SiteModule } from './modules/site/site.module';
import { NoticesModule } from './modules/notices/notices.module';
import { CheckinModule } from './modules/checkin/checkin.module';
import { LotteryModule } from './modules/lottery/lottery.module';
import { ArticlesModule } from './modules/articles/articles.module';
import { HistoryModule } from './modules/history/history.module';
import { EventsModule } from './modules/events/events.module';
import { CollectionsModule } from './modules/collections/collections.module';
import { PayModule } from './modules/pay/pay.module';
import { AppController } from './app.controller';

/**
 * Root module. Infrastructure (config/db/redis/storage/common) loads first,
 * then the ported feature modules (auth/users/posts). Add new feature modules
 * here as they are ported — see README "Remaining modules to port".
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      // reads server-nest/.env (copy from .env.example)
      envFilePath: ['.env'],
    }),
    DatabaseModule,
    CommonModule,
    RedisCacheModule,
    StorageModule,
    AuthModule,
    UsersModule,
    PostsModule,
    CommentsModule,
    TopicsModule,
    NotificationsModule,
    MessagesModule,
    SearchModule,
    CirclesModule,
    QaModule,
    FlashModule,
    NavModule,
    AchievementsModule,
    MallModule,
    ForumModule,
    ReportsModule,
    FeedbackModule,
    AdminModule,
    AiModule,
    SystemModule,
    SiteModule,
    NoticesModule,
    CheckinModule,
    LotteryModule,
    ArticlesModule,
    HistoryModule,
    EventsModule,
    CollectionsModule,
    PayModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
