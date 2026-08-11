#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${PR_DIR}/.backup"

cd "${ROOT_DIR}"

echo "Rolling back PR-009 — Sensor Catalog API"

if [[ ! -d "${BACKUP_DIR}" ]]; then
  echo "ERROR: Backup directory not found." >&2
  exit 1
fi

cp   "${BACKUP_DIR}/apps/api/package.json"   apps/api/package.json

cp -a   "${BACKUP_DIR}/apps/api/src/features/sensors/."   "apps/api/src/features/sensors/"

docker compose build api
docker compose up -d api

rm -rf "${BACKUP_DIR}"

echo
echo "PR-009 rolled back successfully."
