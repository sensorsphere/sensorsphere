#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${PR_DIR}/.backup"

cd "${ROOT_DIR}"

echo "Rolling back PR-015 — Product Foundation"

[[ -d "${BACKUP_DIR}" ]] || {
  echo "ERROR: Backup directory not found." >&2
  exit 1
}

for path in \
  docs/project/constitution.md \
  docs/roadmap/master-plan-v1.0.md \
  docs/adr/ADR-0001-project-principles.md \
  docs/rfc/RFC-0001-device-domain.md \
  docs/development/contribution-conventions.md \
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

echo "PR-015 rolled back successfully."
