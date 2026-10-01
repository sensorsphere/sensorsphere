#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INSTALLER="$ROOT_DIR/distribution/install.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

INSTALL_DIR="$TMP_DIR/install"
TEST_INSTALLER="$TMP_DIR/install.sh"
mkdir -p "$INSTALL_DIR"

cat > "$INSTALL_DIR/.env" <<'EOF'
SENSORSPHERE_API_VERSION=1.64.0
SENSORSPHERE_FRONTEND_VERSION=1.113.0
SENSORSPHERE_MIGRATIONS_VERSION=82
EOF

cat > "$INSTALL_DIR/docker-compose.yml" <<'EOF'
services:
  api:
    image: ghcr.io/sensorsphere/sensorsphere-api:${SENSORSPHERE_API_VERSION}
  frontend:
    image: ghcr.io/sensorsphere/sensorsphere-frontend:${SENSORSPHERE_FRONTEND_VERSION}
  migrations:
    image: ghcr.io/sensorsphere/sensorsphere-migrations:${SENSORSPHERE_MIGRATIONS_VERSION}
EOF

sed '/^case "$COMMAND" in$/,$c\compose config --images' "$INSTALLER" > "$TEST_INSTALLER"
chmod +x "$TEST_INSTALLER"

actual="$(
  SENSORSPHERE_API_VERSION=1.63.3 \
  SENSORSPHERE_FRONTEND_VERSION=1.112.2 \
  SENSORSPHERE_MIGRATIONS_VERSION=81 \
  "$TEST_INSTALLER" status --install-dir "$INSTALL_DIR"
)"

grep -qx 'ghcr.io/sensorsphere/sensorsphere-api:1.64.0' <<<"$actual"
grep -qx 'ghcr.io/sensorsphere/sensorsphere-frontend:1.113.0' <<<"$actual"
grep -qx 'ghcr.io/sensorsphere/sensorsphere-migrations:82' <<<"$actual"

if grep -Eq '1\.63\.3|1\.112\.2|:81$' <<<"$actual"; then
  echo "FAIL: exported shell versions overrode .env" >&2
  printf '%s\n' "$actual" >&2
  exit 1
fi

echo "PASS: .env remains authoritative over exported shell variables"
