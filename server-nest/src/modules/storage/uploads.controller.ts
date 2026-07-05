import {
  BadRequestException,
  Controller,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { HelpersService } from '../../common/helpers.service';
import { User } from '../../database/entities';
import { StorageService } from './storage.service';
import { SiteService } from '../site/site.service';

/**
 * Uploads — POST /api/upload (multipart field "files", up to 9).
 * Mirrors the Express upload route's response: { files: [{url,type,name}] }.
 * Files are streamed to S3-compatible storage (rustfs/MinIO/S3) instead of
 * being written to a local /uploads directory.
 */
@Controller('api/upload')
export class UploadsController {
  constructor(
    private readonly storage: StorageService,
    private readonly site: SiteService,
    private readonly helpers: HelpersService,
  ) {}

  // 上传限制（后台可配，未配置用默认；multer 硬顶 25MB/9 张仍在，配置只能收紧不能放宽）
  private async uploadLimits() {
    const num = async (k: string, def: number) => {
      const v = await this.site.getConfig(k);
      const n = v === null || v === '' ? def : Number(v);
      return Number.isFinite(n) && n > 0 ? n : def;
    };
    return { maxImages: await num('upload_max_images', 9), maxSizeMb: await num('upload_max_size_mb', 25) };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', 9, {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        // SVG/HTML/XML 可携带 <script>，从 /uploads 同源直开会执行→窃 localStorage token。
        // 同时按 mimetype 和 扩展名 双向拦截（两者都是客户端可伪造，任一命中即拒）。
        const okMime =
          /^(image|video|audio)\//.test(file.mimetype) &&
          !/svg|html|xml/i.test(file.mimetype);
        const ext = (file.originalname.match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase();
        const badExt = /^\.(svgz?|html?|xhtml|xml|js|mjs)$/.test(ext);
        const ok = okMime && !badExt;
        // 用 BadRequestException（非普通 Error）→ 全局过滤器保留 400 + 原文案，
        // 而不是被当作未预期错误兜底成 500「服务器出错了」。
        cb(
          ok ? null : new BadRequestException('仅支持图片、视频、音频（不含 SVG/HTML）'),
          ok,
        );
      },
    }),
  )
  async upload(
    @CurrentUser() user: User,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    await this.helpers.enforcePerm('upload', user); // 接口权限门控（默认关；开启后可要求上传需 VIP/等级）
    if (!files || files.length === 0) {
      throw new BadRequestException('请选择要上传的文件');
    }
    const { maxImages, maxSizeMb } = await this.uploadLimits();
    if (files.length > maxImages)
      throw new BadRequestException(`一次最多上传 ${maxImages} 个文件`);
    if (files.some((f) => f.size > maxSizeMb * 1024 * 1024))
      throw new BadRequestException(`单个文件不能超过 ${maxSizeMb}MB`);
    const uploaded = await this.storage.uploadMany(
      files.map((f) => ({
        buffer: f.buffer,
        originalname: f.originalname,
        mimetype: f.mimetype,
      })),
    );
    // strip the internal `key` from the client-facing response
    return { files: uploaded.map(({ url, type, name }) => ({ url, type, name })) };
  }
}
