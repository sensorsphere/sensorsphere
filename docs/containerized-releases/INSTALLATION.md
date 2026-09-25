# Non-DEV installation and lifecycle

SensorSphere DIT/PROD installations use the minimal bundle under `distribution/`.
Node.js, pnpm, the application source tree, nginx configuration sources, and SQL
migration sources are not required on the target host.

## Installed layout

Default installation directory:

```text
/opt/sensorsphere
```

The installed bundle contains:

```text
docker-compose.yml
install.sh
.env
.env.example
.stack-release.yaml
config/mosquitto/mosquitto.conf
init/timescaledb/01-init.sql
data/
```

Application, nginx, and migration code comes from versioned container images.

## Requirements

- Docker Engine
- Docker Compose plugin
- `curl` only when downloading a Stack Release manifest from a remote URL
- write access to the selected installation directory

No host Node.js/npm/pnpm toolchain is required.

## Install

From an extracted SensorSphere distribution bundle, the bundled immutable
`stack-release.yaml` is used automatically:

```bash
./install.sh install \
  --install-dir /opt/sensorsphere
```

To select a published Stack Release explicitly:

```bash
./install.sh install \
  --stack 2026.09.25.4 \
  --install-dir /opt/sensorsphere
```

Published manifests are downloaded from the immutable GitHub Release tagged
`stack-<stackVersion>`.

For an offline/local manifest:

```bash
./install.sh install \
  --manifest ./2026.09.25.4.yaml \
  --install-dir /opt/sensorsphere
```

The installer creates a database password when it creates `.env`, applies the
Stack Release versions, pulls images, starts the stack, waits for migrations,
and validates TimescaleDB/API/frontend/nginx health.

## Update

```bash
/opt/sensorsphere/install.sh update \
  --stack <stack-release> \
  --install-dir /opt/sensorsphere
```

Before changing versions, update saves:

```text
.env.previous
.stack-release.previous.yaml
```

It then applies the selected Stack Release, pulls images, runs the Compose
lifecycle, and waits for health checks.

## Rollback

A rollback to the previous application versions is always allowed when the
migration image level is unchanged:

```bash
/opt/sensorsphere/install.sh rollback \
  --install-dir /opt/sensorsphere
```

SensorSphere never automatically reverses database migrations. If the migration
level changed, rollback is allowed only when the previous schema-v3 Stack
Release explicitly declares the current database migration level within its
supported range. Otherwise rollback is blocked.

`--force` exists only for an operator who has independently verified that the
previous application stack is compatible with the current database schema.

The pre-rollback environment is saved as `.env.failed`.

## Status

```bash
/opt/sensorsphere/install.sh status \
  --install-dir /opt/sensorsphere
```

This prints the selected Stack Release/component versions and Compose state.

## Test-only option

`--skip-pull` skips registry pulls. It is intended for local validation using
images that already exist on the Docker host, not normal DIT/PROD operation.
