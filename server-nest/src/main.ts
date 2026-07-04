import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { isInsecureJwtSecret } from './common/jwt-secret.guard';
import { shouldBlockForUninitializedDb, DB_UNINITIALIZED_MESSAGE } from './common/db-init.guard';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // 10mb JSON body to match the Express express.json({ limit: '10mb' })
    bodyParser: true,
  });

  const config = app.get(ConfigService);

  // 安全硬化：拒绝以「公开仓库可见的开发占位 JWT 密钥」启动。未设 JWT_SECRET 会静默回退到该占位串，
  // 任何人可据此伪造任意用户/管理员令牌（曾因线上漏配中招）。生产必须设强随机 JWT_SECRET（openssl rand -hex 32）；
  // 仅本地开发确需占位串时设 ALLOW_INSECURE_JWT_SECRET=true 放行。
  if (isInsecureJwtSecret(config.get<string>('jwt.secret'), process.env.ALLOW_INSECURE_JWT_SECRET)) {
    // eslint-disable-next-line no-console
    console.error(
      '[FATAL] 拒绝启动：JWT_SECRET 未设置或仍是 .env.example 的示例占位值，任何人可据此伪造登录令牌。\n' +
        '        生产环境请设置强随机 JWT_SECRET（如 openssl rand -hex 32）后重启。\n' +
        '        仅本地开发确需使用占位串时，可设 ALLOW_INSECURE_JWT_SECRET=true 放行。',
    );
    await app.close();
    process.exit(1);
  }

  // 建表防呆（spec 03 §3.2）：核心表缺失且未开 synchronize → 拒绝启动并给出解决办法，
  // 避免裸机安装者漏配 DB_SYNCHRONIZE 后陷入「空库 + 每请求 500 且不指向原因」。
  // 此时 TypeORM 已完成连接与（若开启的）synchronize 建表，检测结果是可信的。
  // 查询本身失败（权限/方言差异等）一律 fail-open：只 warn 不阻断启动。
  try {
    const dataSource = app.get(DataSource);
    const qr = dataSource.createQueryRunner();
    let usersExists = true;
    try {
      usersExists = await qr.hasTable('users');
    } finally {
      await qr.release();
    }
    if (
      shouldBlockForUninitializedDb(
        usersExists,
        config.get<boolean>('database.synchronize'),
      )
    ) {
      // eslint-disable-next-line no-console
      console.error(DB_UNINITIALIZED_MESSAGE);
      await app.close();
      process.exit(1);
    }
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn('[db-init-guard] 建表检查跳过（放行）:', e?.message || e);
  }

  // 不暴露技术栈指纹（默认 Express 会带 X-Powered-By: Express）
  app.getHttpAdapter().getInstance().disable('x-powered-by');

  // 反代信任：默认直连(req.ip=socket IP，适合 :5388 直连)。置于 nginx/面板反代后，
  // 设 TRUST_PROXY 让 req.ip 取 X-Forwarded-For（注册 IP 限流等需要真实客户端 IP）。
  // 取值：数字(信任前 N 跳，常用 1)、'loopback'、或 'true'(全信任，仅当反代已剥离伪造头时用)。
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) {
    const v =
      trustProxy === 'true'
        ? true
        : /^\d+$/.test(trustProxy)
          ? Number(trustProxy)
          : trustProxy;
    app.getHttpAdapter().getInstance().set('trust proxy', v);
  } else {
    // 反代防呆（spec 03 §3.4）：未设 TRUST_PROXY 却收到带 X-Forwarded-For 的请求（说明在反代后面）
    // → 打一次 warning。否则按 IP 的注册/发帖限流会全部看成来自反代 IP 而失效，且无人察觉。
    let xffWarned = false;
    app.use((req: any, _res: any, next: any) => {
      if (!xffWarned && req.headers['x-forwarded-for']) {
        xffWarned = true;
        // eslint-disable-next-line no-console
        console.warn(
          '[TRUST_PROXY] 检测到 X-Forwarded-For 但未设置 TRUST_PROXY：按 IP 的注册/发帖限流将失效' +
            '（所有请求看似来自反代 IP）。若部署在 Nginx / 宝塔 / 1Panel / Cloudflare 后面，请设 TRUST_PROXY=1 后重启。',
        );
      }
      next();
    });
  }

  // CORS open like the Express server
  app.enableCors();

  // gzip 压缩所有可压缩响应（静态 JS/CSS/HTML + API JSON）。43.226 无前置反代 → 必须本进程压。
  // 实测主 JS 729KB→226KB、CSS 564KB→67KB，首屏传输 ~1.3MB→~293KB，慢网/移动端首载快很多。
  // 置于静态中间件之前，才能压到 useStaticAssets 的产物。
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const compression = require('compression');
  app.use(compression());

  // 安全响应头（零依赖手写；覆盖 API + 静态 SPA + /uploads，故置于静态中间件之前）。
  // 不设 CSP——本站大量内联样式 + SPA，贸然加 CSP 会破页面；CSP/HSTS 交给前置反代按部署环境配置。
  app.use((_req: any, res: any, next: any) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); // 禁 MIME 嗅探
    res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // 防点击劫持(禁跨源 iframe 嵌入)
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    next();
  });

  // ── 单进程同时伺服 /uploads(历史本地图) + 内置 SPA，与 Express 一致 ──
  // 切换 systemd 到 server-nest 后整站靠这一个进程，故必须接管这两类静态资源。
  // 路径用 env 覆盖(切换时指向线上 ~/hahasns/server/uploads 与 ~/hahasns/client/dist)。
  const uploadsDir =
    process.env.UPLOADS_DIR || join(__dirname, '..', 'uploads');
  if (fs.existsSync(uploadsDir)) {
    app.useStaticAssets(uploadsDir, {
      prefix: '/uploads',
      maxAge: '7d',
      setHeaders: (res, p: string) => {
        res.setHeader('Cache-Control', 'public, max-age=604800');
        // 纵深防御：历史遗留/绕过的 svg/html/xml 强制下载，绝不同源内联执行脚本
        if (/\.(svgz?|html?|xhtml|xml)$/i.test(p))
          res.setHeader('Content-Disposition', 'attachment');
      },
    });
  }
  const clientDist =
    process.env.CLIENT_DIST || join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    // K 静态缓存：/assets/* 一年 immutable；字体 30 天；html 不缓存(每次拿新哈希)
    app.useStaticAssets(clientDist, {
      setHeaders: (res, p: string) => {
        if (p.includes('/assets/'))
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else if (p.includes('/fonts/'))
          res.setHeader('Cache-Control', 'public, max-age=2592000');
        else if (p.endsWith('.html'))
          res.setHeader('Cache-Control', 'no-cache');
      },
    });
  }

  // larger JSON bodies (base64 media in posts, etc.)
  const express = require('express');
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // class-validator DTOs; whitelist strips unknown props, transform coerces types
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // normalize all errors to { error: "..." } (Express-compatible)
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = config.get<number>('port') || 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`HahaSNS (NestJS) API running on http://localhost:${port}`);
}

bootstrap();
