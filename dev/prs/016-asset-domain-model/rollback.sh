#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${PR_DIR}/.backup"

cd "${ROOT_DIR}"

echo "Rolling back PR-016 — Asset Domain Model"

[[ -d "${BACKUP_DIR}" ]] || {
  echo "ERROR: Backup directory not found." >&2
  exit 1
}

for path in \
  packages/core/src/index.ts \
  apps/api/src/index.ts \
  CHANGELOG.md \
  docs/roadmap.md
do
  if [[ -f "${BACKUP_DIR}/${path}.existed" ]]; then
    mkdir -p "$(dirname "${path}")"
    cp "${BACKUP_DIR}/${path}" "${path}"
  fi
done

for path in \
  packages/core/src/inventory/asset.ts \
  packages/core/src/inventory/asset-metric.ts \
  docs/rfc/RFC-0001-device-domain-implementation.md
do
  if [[ -f "${BACKUP_DIR}/${path}.existed" ]]; then
    mkdir -p "$(dirname "${path}")"
    cp "${BACKUP_DIR}/${path}" "${path}"
  else
    rm -f "${path}"
  fi
done

if [[ -f "${BACKUP_DIR}/assets-feature.existed" ]]; then
  rm -rf apps/api/src/features/assets
  cp -a \
    "${BACKUP_DIR}/apps/api/src/features/assets" \
    apps/api/src/features/assets
else
  rm -rf apps/api/src/features/assets
fi

docker compose build api
docker compose up -d api

rm -rf "${BACKUP_DIR}"

echo "PR-016 application code rolled back."
echo "Migration 003 is intentionally preserved."
