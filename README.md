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

The examples below install SensorSphere under the current user's home directory, so they do not require running the whole installer with `sudo`. If you deliberately choose a system directory such as `/opt/sensorsphere`, create/chown that directory first or invoke the required privileged filesystem operation separately.

## Install

The public bootstrap installer downloads the requested Stack Release, verifies its SHA-256 checksum,
installs the versioned runtime bundle, generates the database password, pulls the container images,
runs migrations, starts the stack, and performs health checks.

Example for a FIT instance using Google OIDC:

```bash
export SENSORSPHERE_GOOGLE_CLIENT_SECRET='<google-client-secret>'

env \
  SENSORSPHERE_ENVIRONMENT=FIT \
  INSTANCE_NAME="SensorSphere [FIT]" \
  WEB_PORT=8082 \
  MQTT_PORT=1892 \
  INSTALL_DIR="$HOME/sensorsphere-fit" \
  VERSION=2026.09.29.2 \
  SENSORSPHERE_PUBLIC_URL="https://fit.example.com" \
  SENSORSPHERE_AUTH_PROVIDERS=google \
  SENSORSPHERE_AUTH_BOOTSTRAP_ADMIN_EMAIL="admin@example.com" \
  SENSORSPHERE_GOOGLE_CLIENT_ID="<google-client-id>.apps.googleusercontent.com" \
  SENSORSPHERE_GOOGLE_CLIENT_SECRET="$SENSORSPHERE_GOOGLE_CLIENT_SECRET" \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/sensorsphere/sensorsphere/master/scripts/install.sh)"
```

For non-DEV environments, authentication is enabled by default and cannot be disabled. A fresh DIT/TEST1/FIT/PROD installation therefore requires a valid public HTTPS URL, a bootstrap admin email, and complete credentials for every provider listed in `SENSORSPHERE_AUTH_PROVIDERS`.

For DEV, authentication defaults to disabled. Set `SENSORSPHERE_AUTH_ENABLED=true` explicitly when testing real OIDC in DEV.

The leading `env` scopes these variables to the installer command only. Do not put a space after an assignment operator; for example use `INSTALL_DIR="$HOME/sensorsphere-fit"`, not `INSTALL_DIR= "$HOME/sensorsphere-fit"`.
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
| `SENSORSPHERE_AUTH_ENABLED` | Enable OIDC authentication | `false` in DEV, `true` in non-DEV |
| `SENSORSPHERE_PUBLIC_URL` | Public HTTPS origin used to build OIDC callbacks | required when auth is enabled |
| `SENSORSPHERE_AUTH_PROVIDERS` | Comma-separated OIDC providers: `google`, `microsoft` | `google` |
| `SENSORSPHERE_AUTH_BOOTSTRAP_ADMIN_EMAIL` | Initial protected admin email on a fresh install | required when auth is enabled |

The generated runtime configuration is stored in `/opt/sensorsphere/.env` by default.
Values not supplied on a later update are preserved.

All examples use `curl` to fetch the public bootstrap. On a host with `wget` instead,
replace the final bootstrap command with:

```bash
bash -c "$(wget -qO- https://raw.githubusercontent.com/sensorsphere/sensorsphere/master/scripts/install.sh)"
```

### Authentication variables

The installer is fail-closed outside DEV:

- `DEV`: authentication defaults to `false` and may be disabled explicitly.
- any non-DEV environment, including `DIT`, `TEST1`, `FIT`, and `PROD`: authentication defaults to `true` and `SENSORSPHERE_AUTH_ENABLED=false` is rejected.

When authentication is enabled, the installer requires:

```text
SENSORSPHERE_PUBLIC_URL=https://<public-host>
SENSORSPHERE_AUTH_PROVIDERS=google,microsoft
SENSORSPHERE_AUTH_BOOTSTRAP_ADMIN_EMAIL=admin@example.com

# Google, when listed in SENSORSPHERE_AUTH_PROVIDERS
SENSORSPHERE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
SENSORSPHERE_GOOGLE_CLIENT_SECRET=...

# Microsoft, when listed in SENSORSPHERE_AUTH_PROVIDERS
SENSORSPHERE_MICROSOFT_CLIENT_ID=...
SENSORSPHERE_MICROSOFT_CLIENT_SECRET=...
SENSORSPHERE_MICROSOFT_TENANT=common
```

`SENSORSPHERE_AUTH_PROVIDERS` is plural. The obsolete singular spelling
`SENSORSPHERE_AUTH_PROVIDER` is not used.

Avoid putting long-lived secrets directly in shell history. Export provider
secrets first or inject them through your normal secret-management mechanism,
then pass the exported variables to the installer.

The complete Google and Microsoft registration walkthrough is in
[`docs/auth/OIDC-App-Registration.md`](docs/auth/OIDC-App-Registration.md).
## Update

Updating uses the **target Stack Release bundle**, so lifecycle files such as `install.sh`,
`docker-compose.yml`, configuration templates and runtime assets are updated together with the
application image versions.

```bash
env \
  ACTION=update \
  INSTALL_DIR="$HOME/sensorsphere-fit" \
  VERSION=2026.09.29.2 \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/sensorsphere/sensorsphere/master/scripts/install.sh)"
```

Before applying an update, SensorSphere stores the previous application state in the selected
`INSTALL_DIR`, for example:

```text
$HOME/sensorsphere-fit/.env.previous
$HOME/sensorsphere-fit/.stack-release.previous.yaml
```

Running the default `ACTION=install` against an existing installation also detects it and switches
to update automatically.

## Rollback

Rollback restores the previously saved application Stack Release:

```bash
env \
  ACTION=rollback \
  INSTALL_DIR="$HOME/sensorsphere-fit" \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/sensorsphere/sensorsphere/master/scripts/install.sh)"
```
Database migrations are **never automatically reversed**. A rollback is accepted only when the
previous application declares compatibility with the current database migration level. The
lower-level lifecycle has a `--force` escape hatch for an operator who has independently verified
compatibility; it is intentionally not exposed as the normal bootstrap path.

## Status

```bash
env \
  ACTION=status \
  INSTALL_DIR="$HOME/sensorsphere-fit" \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/sensorsphere/sensorsphere/master/scripts/install.sh)"
```

This shows the selected Stack Release, component versions and Docker Compose state.

## Remove

The safe remove operation stops and removes SensorSphere containers and networks while preserving
the installation directory, database files, application data and `.env` configuration:

```bash
env \
  ACTION=remove \
  INSTALL_DIR="$HOME/sensorsphere-fit" \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/sensorsphere/sensorsphere/master/scripts/install.sh)"
```

To permanently remove the installation directory and its persistent data as well:
```bash
env \
  ACTION=remove \
  PURGE_DATA=true \
  INSTALL_DIR="$HOME/sensorsphere-fit" \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/sensorsphere/sensorsphere/master/scripts/install.sh)"
```

> **Warning:** `PURGE_DATA=true` permanently deletes the configured SensorSphere installation directory.

## Reinstall after a safe remove

Because a normal remove preserves data and configuration, reinstall with the desired Stack Release
and the same `INSTALL_DIR`:

```bash
env \
  SENSORSPHERE_ENVIRONMENT=FIT \
  INSTALL_DIR="$HOME/sensorsphere-fit" \
  VERSION=2026.09.29.2 \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/sensorsphere/sensorsphere/master/scripts/install.sh)"
```

The existing `.env` and persistent data are reused, including OIDC credentials.

## Advanced and development documentation

- Development/source build: [`dev.md`](dev.md)
- Detailed non-DEV lifecycle: [`docs/containerized-releases/INSTALLATION.md`](docs/containerized-releases/INSTALLATION.md)
- Stack compatibility model: [`docs/containerized-releases/COMPATIBILITY.md`](docs/containerized-releases/COMPATIBILITY.md)
- GHCR publication: [`docs/containerized-releases/GHCR-PUBLISHING.md`](docs/containerized-releases/GHCR-PUBLISHING.md)
- Stack Release manifests: [`releases/stacks/`](releases/stacks/)
