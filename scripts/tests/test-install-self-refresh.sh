#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

VERSION="2099.01.01.2"
INSTALL_DIR="$TMP_DIR/install"
RELEASE_ROOT="$TMP_DIR/releases"
RELEASE_DIR="$RELEASE_ROOT/stack-$VERSION"
STAGE_PARENT="$TMP_DIR/stage"
STAGE_DIR="$STAGE_PARENT/sensorsphere-$VERSION"
BIN_DIR="$TMP_DIR/bin"
DOCKER_LOG="$TMP_DIR/docker.log"

mkdir -p "$INSTALL_DIR" "$RELEASE_DIR" "$STAGE_DIR" "$BIN_DIR"
cp -a "$ROOT_DIR/distribution/." "$INSTALL_DIR/"
printf '\n# stale-local-bundle\n' >> "$INSTALL_DIR/docker-compose.yml"

cat > "$INSTALL_DIR/.env" <<'EOF'
COMPOSE_PROJECT_NAME=self-refresh-test
POSTGRES_DB=sensorsphere
POSTGRES_USER=sensorsphere
POSTGRES_PASSWORD=test
SENSORSPHERE_ENVIRONMENT=DEV
SENSORSPHERE_AUTH_ENABLED=false
SENSORSPHERE_STACK_VERSION=2099.01.01.1
SENSORSPHERE_API_VERSION=1.63.3
SENSORSPHERE_FRONTEND_VERSION=1.112.2
SENSORSPHERE_INGESTION_VERSION=1.0.1
SENSORSPHERE_NGINX_VERSION=1.0.0
SENSORSPHERE_MIGRATIONS_VERSION=81
EOF

cat > "$INSTALL_DIR/.stack-release.yaml" <<'EOF'
stackVersion: 2099.01.01.1
schemaVersion: 3
components:
  api:
    version: 1.63.3
  frontend:
    version: 1.112.2
  ingestion:
    version: 1.0.1
  nginx:
    version: 1.0.0
  migrations:
    version: 81
database:
  migrationLevel: 81
compatibility:
  apiContractVersion: 1
  databaseMinMigrationLevel: 72
  databaseMaxMigrationLevel: 81
EOF

cp -a "$ROOT_DIR/distribution/." "$STAGE_DIR/"
cat > "$STAGE_DIR/stack-release.yaml" <<EOF
stackVersion: $VERSION
schemaVersion: 3
components:
  api:
    version: 1.64.0
  frontend:
    version: 1.113.0
  ingestion:
    version: 1.0.1
  nginx:
    version: 1.0.0
  migrations:
    version: 82
database:
  migrationLevel: 82
compatibility:
  apiContractVersion: 1
  databaseMinMigrationLevel: 72
  databaseMaxMigrationLevel: 82
EOF

cp "$STAGE_DIR/stack-release.yaml" "$RELEASE_DIR/$VERSION.yaml"
(
  cd "$STAGE_PARENT"
  tar -czf "$RELEASE_DIR/sensorsphere-$VERSION.tar.gz" "sensorsphere-$VERSION"
)
(
  cd "$RELEASE_DIR"
  sha256sum "sensorsphere-$VERSION.tar.gz" > "sensorsphere-$VERSION.tar.gz.sha256"
)

cat > "$BIN_DIR/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$DOCKER_LOG"

if [[ "$1" == "compose" && "$2" == "version" ]]; then
  echo "Docker Compose version v2.test"
  exit 0
fi

if [[ "$1" == "compose" ]]; then
  shift
  while [[ "$1" == "--env-file" || "$1" == "-f" ]]; do
    shift 2
  done
  case "$1" in
    pull|up) exit 0 ;;
    ps)
      if [[ "$2" == "-q" ]]; then
        echo "$3-id"
      elif [[ "$2" == "-aq" ]]; then
        echo "$3-id"
      fi
      exit 0
      ;;
  esac
fi

if [[ "$1" == "inspect" ]]; then
  if [[ "$*" == *"ExitCode"* ]]; then
    echo "0"
  else
    echo "healthy"
  fi
  exit 0
fi

echo "Unexpected docker invocation: $*" >&2
exit 1
EOF
chmod +x "$BIN_DIR/docker"

output="$(
  PATH="$BIN_DIR:$PATH" DOCKER_LOG="$DOCKER_LOG" \
  "$INSTALL_DIR/install.sh" update \
    --stack "$VERSION" \
    --release-base-url "file://$RELEASE_ROOT"
)"

grep -Fq "Bundle changes detected for Stack $VERSION" <<<"$output"
grep -Fq "Continuing update with refreshed installer" <<<"$output"
grep -Fq "Updated to Stack Release $VERSION" <<<"$output"

if grep -Fq '# stale-local-bundle' "$INSTALL_DIR/docker-compose.yml"; then
  echo "FAIL: stale docker-compose.yml was not replaced" >&2
  exit 1
fi

grep -Fq '# stale-local-bundle' "$INSTALL_DIR/.bundle.previous/docker-compose.yml"
grep -qx "SENSORSPHERE_STACK_VERSION=$VERSION" "$INSTALL_DIR/.env"
grep -qx "SENSORSPHERE_API_VERSION=1.64.0" "$INSTALL_DIR/.env"
grep -qx "SENSORSPHERE_FRONTEND_VERSION=1.113.0" "$INSTALL_DIR/.env"
grep -qx "SENSORSPHERE_MIGRATIONS_VERSION=82" "$INSTALL_DIR/.env"
grep -Fq "compose --env-file .env -f docker-compose.yml pull" "$DOCKER_LOG"
grep -Fq "compose --env-file .env -f docker-compose.yml up -d" "$DOCKER_LOG"

echo "PASS: update self-refreshes the target Stack Release bundle before runtime update"
