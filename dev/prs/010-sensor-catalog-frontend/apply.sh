#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${PR_DIR}/.backup"

cd "${ROOT_DIR}"

echo "Applying PR-010 — Sensor Catalog Frontend"

if [[ -d "${BACKUP_DIR}" ]]; then
  echo "ERROR: Backup directory already exists: ${BACKUP_DIR}" >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}/apps/frontend/src"

for file in api.ts types.ts main.tsx
do
  cp     "apps/frontend/src/${file}"     "${BACKUP_DIR}/apps/frontend/src/${file}"
done

if [[ -f apps/frontend/src/SensorCatalog.tsx ]]; then
  cp     apps/frontend/src/SensorCatalog.tsx     "${BACKUP_DIR}/apps/frontend/src/SensorCatalog.tsx"
  touch "${BACKUP_DIR}/SensorCatalog.existed"
fi

cp -a   "${PR_DIR}/payload/apps/frontend/src/."   "apps/frontend/src/"

echo "Rebuilding frontend..."
docker compose build frontend

echo "Restarting frontend and nginx..."
docker compose up -d frontend nginx

echo
echo "PR-010 applied."
echo "Run:"
echo "  ./dev/tools/pr verify 010"
