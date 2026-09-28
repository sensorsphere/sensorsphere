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
- `curl` or `wget` when downloading a Stack Release manifest from a remote URL
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
  --stack 2026.09.28.1 \
  --install-dir /opt/sensorsphere
```

Published manifests are downloaded from the immutable GitHub Release tagged
`stack-<stackVersion>`.

For an offline/local manifest:

```bash
./install.sh install \
  --manifest ./2026.09.28.1.yaml \
  --install-dir /opt/sensorsphere
```

The installer creates a database password when it creates `.env`, applies the
Stack Release versions, validates the authentication policy, pulls images,
starts the stack, waits for migrations, and validates
TimescaleDB/API/frontend/nginx health.

### Authentication during installation

SensorSphere is fail-closed outside DEV.

- `SENSORSPHERE_ENVIRONMENT=DEV`: authentication defaults to disabled.
- any other environment: authentication defaults to enabled and cannot be
  disabled.

When authentication is enabled, installation requires:

```text
SENSORSPHERE_PUBLIC_URL=https://<public-host>
SENSORSPHERE_AUTH_PROVIDERS=google[,microsoft]
SENSORSPHERE_AUTH_BOOTSTRAP_ADMIN_EMAIL=admin@example.com

SENSORSPHERE_GOOGLE_CLIENT_ID=...
SENSORSPHERE_GOOGLE_CLIENT_SECRET=...

SENSORSPHERE_MICROSOFT_CLIENT_ID=...
SENSORSPHERE_MICROSOFT_CLIENT_SECRET=...
SENSORSPHERE_MICROSOFT_TENANT=common
```

Only credentials for providers listed in `SENSORSPHERE_AUTH_PROVIDERS` are
required. The variable is plural; `SENSORSPHERE_AUTH_PROVIDER` is not used.

The installer stops before starting containers when a non-DEV installation
would otherwise be unauthenticated or when an enabled OIDC provider is
incomplete. See `docs/auth/OIDC-App-Registration.md` for provider-console
registration.

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

## Public bootstrap installer

For normal user-facing installations, updates, rollbacks, status checks and removals,
use the public bootstrap entry point documented in the repository `README.md`:

```text
https://raw.githubusercontent.com/sensorsphere/sensorsphere/master/scripts/install.sh
```

The bootstrap downloads the target Stack Release bundle and invokes the lifecycle
script from that target release. This ensures lifecycle files are upgraded together
with application component versions.

## Remove

The low-level lifecycle can remove the running stack while preserving persistent data
and configuration:

```bash
/opt/sensorsphere/install.sh remove --install-dir /opt/sensorsphere
```

Permanent data deletion is intentionally handled only by the public bootstrap with
`ACTION=remove PURGE_DATA=true`, which includes safety checks before deleting the
installation directory.
