#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/distribution/docker-compose.yml"

rendered="$(
  POSTGRES_PASSWORD=test   SENSORSPHERE_INSTALL_HOST=test-host   SENSORSPHERE_INSTALL_DIR=/test/install   SENSORSPHERE_COMPOSE_PROJECT=test-compose   docker compose -f "$COMPOSE_FILE" config
)"

grep -Fq 'SENSORSPHERE_INSTALL_HOST: test-host' <<<"$rendered"
grep -Fq 'SENSORSPHERE_INSTALL_DIR: /test/install' <<<"$rendered"
grep -Fq 'SENSORSPHERE_COMPOSE_PROJECT: test-compose' <<<"$rendered"

echo "PASS: distribution compose exposes installation metadata to API"
