#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${PR_DIR}/.backup"

cd "${ROOT_DIR}"

echo "Rolling back PR-010 — Sensor Catalog Frontend"

if [[ ! -d "${BACKUP_DIR}" ]]; then
  echo "ERROR: Backup directory not found." >&2
  exit 1
fi

for file in api.ts types.ts main.tsx
do
  cp     "${BACKUP_DIR}/apps/frontend/src/${file}"     "apps/frontend/src/${file}"
done

if [[ -f "${BACKUP_DIR}/SensorCatalog.existed" ]]; then
  cp     "${BACKUP_DIR}/apps/frontend/src/SensorCatalog.tsx"     apps/frontend/src/SensorCatalog.tsx
else
  rm -f apps/frontend/src/SensorCatalog.tsx
fi

docker compose build frontend
docker compose up -d frontend nginx

rm -rf "${BACKUP_DIR}"

echo
echo "PR-010 rolled back successfully."
