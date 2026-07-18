# HahaSNS 生产镜像：server-nest(NestJS) 单进程，伺服 client/dist + /api + /uploads(:4000)
# 后端为 NestJS + TypeORM(MySQL/MariaDB) + Redis；配套 docker-compose 起 mariadb + redis。
# 纯 JS 依赖(mysql2/ioredis/bcryptjs/aws-sdk)，无需原生编译。
# npm 镜像源：默认官方；大陆构建可传 --build-arg NPM_REGISTRY=https://registry.npmmirror.com 加速
ARG NPM_REGISTRY=https://registry.npmjs.org
# 构建期 Node 堆上限（MB）。小内存机器(2G)默认 1024，让 vite/tsc 不至于把内存吃爆导致 OOM 崩机；
# 想更快可在内存充裕的机器上 --build-arg NODE_HEAP_MB=3072。低配机仍强烈建议加 2–4G swap 兜底。
ARG NODE_HEAP_MB=1024

# ---- 1) 构建前端 ----
FROM node:20-bookworm-slim AS client
ARG NPM_REGISTRY
ARG NODE_HEAP_MB
ENV NODE_OPTIONS=--max-old-space-size=${NODE_HEAP_MB}
WORKDIR /app/client
COPY client/package*.json ./
RUN npm config set registry "$NPM_REGISTRY" && npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ---- 2) 构建 server-nest(tsc → dist)，再裁剪到仅生产依赖 ----
FROM node:20-bookworm-slim AS server
ARG NPM_REGISTRY
ARG NODE_HEAP_MB
ENV NODE_OPTIONS=--max-old-space-size=${NODE_HEAP_MB}
WORKDIR /app/server-nest
COPY server-nest/package*.json ./
RUN npm config set registry "$NPM_REGISTRY" && npm ci --no-audit --no-fund
COPY server-nest/ ./
RUN npm run build && npm prune --omit=dev

# ---- 3) 运行时 ----
FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000 \
    CLIENT_DIST=/app/client/dist \
    UPLOADS_DIR=/app/uploads
COPY --from=server /app/server-nest/dist ./server-nest/dist
COPY --from=server /app/server-nest/node_modules ./server-nest/node_modules
COPY --from=server /app/server-nest/package.json ./server-nest/package.json
COPY --from=server /app/server-nest/scripts ./server-nest/scripts
COPY --from=client /app/client/dist ./client/dist
RUN mkdir -p /app/uploads
EXPOSE 4000
WORKDIR /app/server-nest
CMD ["node", "dist/main.js"]
