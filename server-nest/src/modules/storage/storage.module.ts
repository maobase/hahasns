import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { UploadsController } from './uploads.controller';
import { SiteModule } from '../site/site.module';

/**
 * S3-compatible object storage module (rustfs/MinIO/S3) + the uploads
 * controller. @Global so any feature module can inject StorageService to
 * store/retrieve media.
 */
@Global()
@Module({
  imports: [SiteModule],
  controllers: [UploadsController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
