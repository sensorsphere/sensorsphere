FROM node:22-alpine AS build

RUN corepack enable
WORKDIR /workspace

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/frontend/package.json apps/frontend/package.json

RUN pnpm install --frozen-lockfile --filter @sensorsphere/frontend...

COPY tsconfig.base.json tsconfig.base.json
COPY apps/frontend apps/frontend

RUN pnpm --filter @sensorsphere/frontend build


FROM nginx:1.28-alpine

COPY --from=build /workspace/apps/frontend/dist /usr/share/nginx/html
RUN date -u +%Y-%m-%dT%H:%M:%SZ > /usr/share/nginx/html/build-date.txt

EXPOSE 80