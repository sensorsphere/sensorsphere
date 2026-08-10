FROM node:22-alpine AS build

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/shared-config/package.json packages/shared-config/package.json
COPY apps/api/package.json apps/api/package.json

RUN pnpm install --no-frozen-lockfile

COPY packages/shared-types packages/shared-types
COPY packages/shared-config packages/shared-config
COPY apps/api apps/api

RUN pnpm --filter @sensorsphere/shared-types build
RUN pnpm --filter @sensorsphere/shared-config build
RUN pnpm --filter @sensorsphere/api build

FROM node:22-alpine

RUN corepack enable
WORKDIR /app
COPY --from=build /app /app

CMD ["pnpm", "--filter", "@sensorsphere/api", "start"]
