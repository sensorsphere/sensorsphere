#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${PR_DIR}/.backup"

cd "${ROOT_DIR}"

echo "Rolling back PR-012 — Database Migration Engine"

[[ -d "${BACKUP_DIR}" ]] || {
  echo "ERROR: Backup directory not found." >&2
  exit 1
}

for path in \
  dev/tools/db \
  docs/database/migrations.md \
  CHANGELOG.md \
  docs/roadmap.md
do
  if [[ -f "${BACKUP_DIR}/${path}.existed" ]]; then
    mkdir -p "$(dirname "${path}")"
    cp "${BACKUP_DIR}/${path}" "${path}"
  else
    rm -f "${path}"
  fi
done

rm -rf "${BACKUP_DIR}"

echo
echo "PR-012 rolled back successfully."
echo
echo "Note: schema_migrations is intentionally preserved."
