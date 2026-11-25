# Coolify: Build Pack = Dockerfile, yol apps/api/Dockerfile, build bağlamı = repo kökü.
# Yalnızca @takip/shared ve @takip/api derlenir; çalışma imajında dist + üretim bağımlılıkları.

FROM node:22-alpine AS build
WORKDIR /repo
RUN npm install -g pnpm@12.23.0
# mongodb-memory-server (yalnız test) kurulumda mongod indirmesin.
ENV MONGOMS_DISABLE_POSTINSTALL=1 CI=true

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @takip/api...

COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @takip/shared build \
 && pnpm --filter @takip/api build \
 && pnpm --filter @takip/api deploy --prod --legacy /out \
 && rm -rf /out/src /out/test /out/Dockerfile /out/vitest.config.ts /out/tsconfig*.json

FROM node:22-alpine AS run
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
