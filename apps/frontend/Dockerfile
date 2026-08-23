FROM node:22-alpine AS build

WORKDIR /workspace/apps/frontend

COPY apps/frontend/package.json ./

RUN npm install

COPY tsconfig.base.json /workspace/tsconfig.base.json
COPY apps/frontend ./

RUN npm run build


FROM nginx:1.28-alpine

COPY --from=build /workspace/apps/frontend/dist /usr/share/nginx/html
RUN date -u +%Y-%m-%dT%H:%M:%SZ > /usr/share/nginx/html/build-date.txt

EXPOSE 80