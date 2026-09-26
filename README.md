# SensorSphere

SensorSphere is distributed as versioned container images and immutable Stack Releases.
A normal installation does **not** require cloning this repository or installing Node.js/npm/pnpm.

## Requirements

- Linux host
- Docker Engine
- Docker Compose plugin (`docker compose`)
- `curl` **or** `wget`
- `tar` and `sha256sum`
- outbound HTTPS access to GitHub Releases and GHCR

The examples below install SensorSphere under `/opt/sensorsphere`, so they use `sudo`.

## Install

The public bootstrap installer downloads the requested Stack Release, verifies its SHA-256 checksum,
installs the versioned runtime bundle, generates the database password, pulls the container images,
runs migrations, starts the stack, and performs health checks.

Example for a FIT instance:

```bash
sudo env \
  SENSORSPHERE_ENVIRONMENT=FIT \
  INSTANCE_NAME="SensorSphere [FIT]" \
  WEB_PORT=8082 \
  MQTT_PORT=1892 \
  VERSION=2026.09.26.2 \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/sensorsphere/sensorsphere/master/scripts/install.sh)"
```
The main installation variables are:

| Variable | Purpose | Default |
| --- | --- | --- |
| `VERSION` | SensorSphere Stack Release to install/update | required for install/update |
| `SENSORSPHERE_ENVIRONMENT` | Environment label such as `DEV`, `FIT`, `DIT`, `PROD` | `DEFAULT` |
| `INSTANCE_NAME` | Name displayed in the SensorSphere UI | `SensorSphere` |
| `INSTANCE_NAME_COLOR` | Optional CSS color for the instance name | unset |
| `WEB_PORT` | Host port for the web UI | `8080` |
| `MQTT_PORT` | Host port for MQTT | `1883` |
| `INSTALL_DIR` | Installation directory | `/opt/sensorsphere` |
| `SENSORSPHERE_PROJECT_TODOS_ENABLED` | Show the development Project Todos feature | `false` |

The generated runtime configuration is stored in `/opt/sensorsphere/.env` by default.
Values not supplied on a later update are preserved.

All examples use `curl` to fetch the public bootstrap. On a host with `wget` instead,
replace the final bootstrap command with:

```bash
bash -c "$(wget -qO- https://raw.githubusercontent.com/sensorsphere/sensorsphere/master/scripts/install.sh)"
```

### Authentication variables

Auth-enabled SensorSphere releases can also be configured during installation with:

```text
SENSORSPHERE_AUTH_ENABLED=true
SENSORSPHERE_AUTH_PROVIDER=google
SENSORSPHERE_AUTH_BOOTSTRAP_ADMIN_EMAIL=admin@example.com
SENSORSPHERE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
SENSORSPHERE_GOOGLE_CLIENT_SECRET=...
```

Avoid putting long-lived secrets directly in shell history. Export the Google client secret first
or provide it through your normal secret-management mechanism, then preserve that environment
variable when invoking the installer.
## Update

Updating uses the **target Stack Release bundle**, so lifecycle files such as `install.sh`,
`docker-compose.yml`, configuration templates and runtime assets are updated together with the
application image versions.

```bash
sudo env \
  ACTION=update \
  VERSION=2026.09.26.2 \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/sensorsphere/sensorsphere/master/scripts/install.sh)"
```

Before applying an update, SensorSphere stores the previous application state in:

```text
/opt/sensorsphere/.env.previous
/opt/sensorsphere/.stack-release.previous.yaml
```

Running the default `ACTION=install` against an existing installation also detects it and switches
to update automatically.

## Rollback

Rollback restores the previously saved application Stack Release:

```bash
sudo env \
  ACTION=rollback \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/sensorsphere/sensorsphere/master/scripts/install.sh)"
```
Database migrations are **never automatically reversed**. A rollback is accepted only when the
previous application declares compatibility with the current database migration level. The
lower-level lifecycle has a `--force` escape hatch for an operator who has independently verified
compatibility; it is intentionally not exposed as the normal bootstrap path.

## Status

```bash
sudo env \
  ACTION=status \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/sensorsphere/sensorsphere/master/scripts/install.sh)"
```

This shows the selected Stack Release, component versions and Docker Compose state.

## Remove

The safe remove operation stops and removes SensorSphere containers and networks while preserving
the installation directory, database files, application data and `.env` configuration:

```bash
sudo env \
  ACTION=remove \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/sensorsphere/sensorsphere/master/scripts/install.sh)"
```

To permanently remove the installation directory and its persistent data as well:
```bash
sudo env \
  ACTION=remove \
  PURGE_DATA=true \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/sensorsphere/sensorsphere/master/scripts/install.sh)"
```

> **Warning:** `PURGE_DATA=true` permanently deletes the configured SensorSphere installation directory.

## Reinstall after a safe remove

Because a normal remove preserves data and configuration, reinstall with the desired Stack Release:

```bash
sudo env \
  SENSORSPHERE_ENVIRONMENT=FIT \
  VERSION=2026.09.26.2 \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/sensorsphere/sensorsphere/master/scripts/install.sh)"
```

The existing `.env` and persistent data are reused.

## Advanced and development documentation

- Development/source build: [`dev.md`](dev.md)
- Detailed non-DEV lifecycle: [`docs/containerized-releases/INSTALLATION.md`](docs/containerized-releases/INSTALLATION.md)
- Stack compatibility model: [`docs/containerized-releases/COMPATIBILITY.md`](docs/containerized-releases/COMPATIBILITY.md)
- GHCR publication: [`docs/containerized-releases/GHCR-PUBLISHING.md`](docs/containerized-releases/GHCR-PUBLISHING.md)
- Stack Release manifests: [`releases/stacks/`](releases/stacks/)
