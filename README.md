# SensorSphere

## Prerequisites

- Docker
- Docker Compose plugin
- Git for source-based development/release work

Node.js and pnpm are not required on the host. Application builds run in Docker.

## DEV

Create the local environment file:

```bash
cp .env.example .env
```

Build and start from local sources:

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  up -d --build
```
## Runtime / DIT / PROD

The base `docker-compose.yml` references versioned application images from
GHCR. Select versions from a validated Stack Release, then run:

```bash
docker compose config
docker compose pull
docker compose up -d
docker compose ps
```

Nginx configuration and database migrations are packaged in dedicated SensorSphere
images. The remaining static runtime assets needed outside the application images are
handled by the minimal non-DEV distribution work in PR3.

## Health and logs

```bash
docker compose logs --tail=100 api frontend ingestion-service
curl -fsS http://127.0.0.1:8080/api/health
```

## Release documentation

- `docs/containerized-releases/PLAN.md`
- `docs/containerized-releases/GHCR-PUBLISHING.md`
- Stack Release manifests: `releases/stacks/`

See `docs/DEPLOYMENT.md` for deployment details.
