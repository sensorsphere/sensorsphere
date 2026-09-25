FROM node:22-alpine AS build

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/shared-config/package.json packages/shared-config/package.json
COPY packages/shared-logger/package.json packages/shared-logger/package.json
COPY apps/ingestion-service/package.json apps/ingestion-service/package.json

RUN pnpm install --frozen-lockfile

COPY packages/core packages/core
COPY packages/shared-types packages/shared-types
COPY packages/shared-config packages/shared-config
COPY packages/shared-logger packages/shared-logger
COPY apps/ingestion-service apps/ingestion-service

RUN pnpm --filter @sensorsphere/core build
RUN pnpm --filter @sensorsphere/shared-types build
RUN pnpm --filter @sensorsphere/shared-config build
RUN pnpm --filter @sensorsphere/shared-logger build
RUN pnpm --filter @sensorsphere/ingestion-service build
RUN date -u +%Y-%m-%dT%H:%M:%SZ > /app/apps/ingestion-service/build-date.txt

FROM node:22-alpine

RUN corepack enable
WORKDIR /app

COPY --from=build /app /app

CMD ["pnpm", "--filter", "@sensorsphere/ingestion-service", "start"]
