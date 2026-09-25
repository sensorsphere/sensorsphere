# Deployment

SensorSphere uses two Compose modes.

## DEV

DEV builds application modules from the local source tree:

```bash
cp .env.example .env

docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  config

docker compose \
  -f docker-compose.yml \
  -f docker-compose.dev.yml \
  up -d --build
```

## DIT / PROD

The base `docker-compose.yml` is the runtime stack. API, frontend and ingestion
use versioned GHCR images selected through environment variables / Stack Release.

```bash
cp .env.example .env
# Set SENSORSPHERE_*_VERSION values from the selected Stack Release.

docker compose config
docker compose pull
docker compose up -d
```

Nginx configuration and database migrations are packaged in dedicated
SensorSphere images. The runtime stack no longer bind-mounts those files from
the source tree.

The current runtime Compose still references repository-provided Mosquitto
configuration and TimescaleDB initialization SQL. PR3 will define the minimal
non-DEV distribution bundle around those remaining static runtime assets.

## Verification

```bash
docker compose ps
docker compose logs --tail=100 api frontend ingestion-service
curl -fsS http://127.0.0.1:8080/api/health
```

See `docs/containerized-releases/INSTALLATION.md` for the non-DEV
install/update/rollback workflow, `docs/containerized-releases/PLAN.md` for
rollout status, and `docs/containerized-releases/GHCR-PUBLISHING.md` for
registry preparation.
