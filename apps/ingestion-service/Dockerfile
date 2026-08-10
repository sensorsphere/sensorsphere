FROM node:22-alpine AS build

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/ingestion-service/package.json apps/ingestion-service/package.json

RUN pnpm install --no-frozen-lockfile

COPY packages/core packages/core
COPY packages/shared-types packages/shared-types
COPY apps/ingestion-service apps/ingestion-service

RUN pnpm --filter @sensorsphere/core build
RUN pnpm --filter @iot/shared-types build
RUN pnpm --filter @sensorsphere/ingestion-service build

FROM node:22-alpine

RUN corepack enable
WORKDIR /app

COPY --from=build /app /app

CMD ["pnpm", "--filter", "@sensorsphere/ingestion-service", "start"]
