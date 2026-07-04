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
import { StorageService } from './storage.service';

/**
 * Uploads — POST /api/upload (multipart field "files", up to 9).
 * Mirrors the Express upload route's response: { files: [{url,type,name}] }.
 * Files are streamed to S3-compatible storage (rustfs/MinIO/S3) instead of
 * being written to a local /uploads directory.
 */
@Controller('api/upload')
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

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
  async upload(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('请选择要上传的文件');
    }
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
