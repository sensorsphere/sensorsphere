#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"

cd "${ROOT_DIR}"

echo "Verifying PR-012 — Database Migration Engine"

echo
echo "[1/6] Tool syntax"
bash -n dev/tools/db
echo "OK"

echo
echo "[2/6] Docker Compose"
docker compose config >/dev/null
echo "OK"

echo
echo "[3/6] Database migration status"
./dev/tools/db status
echo "OK"

echo
echo "[4/6] Apply pending migrations"
./dev/tools/db migrate
echo "OK"

echo
echo "[5/6] Migration history"
./dev/tools/db history
echo "OK"

echo
echo "[6/6] Existing API"
curl --fail --silent "${BASE_URL}/api/health" >/dev/null
curl --fail --silent "${BASE_URL}/api/v1/sensors" >/dev/null
curl --fail --silent "${BASE_URL}/api/v1/measurements/latest" >/dev/null
echo "OK"

echo
echo "PR-012 verification passed."
