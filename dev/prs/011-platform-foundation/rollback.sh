#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${PR_DIR}/.backup"

cd "${ROOT_DIR}"

echo "Rolling back PR-011 — Platform Foundation revision 2"

[[ -d "${BACKUP_DIR}" ]] || {
  echo "ERROR: Backup directory not found." >&2
  exit 1
}

if [[ -f "${BACKUP_DIR}/dev/tools/pr" ]]; then
  cp "${BACKUP_DIR}/dev/tools/pr" dev/tools/pr
  chmod +x dev/tools/pr
fi

for path in \
  CHANGELOG.md \
  docs/roadmap.md \
  docs/architecture/vision.md \
  docs/architecture/dev-workflow.md \
  docs/architecture/api-guidelines.md
do
  if [[ -f "${BACKUP_DIR}/${path}.existed" ]]; then
    mkdir -p "$(dirname "${path}")"
    cp "${BACKUP_DIR}/${path}" "${path}"
  else
    rm -f "${path}"
  fi
done

rm -rf "${BACKUP_DIR}"

echo "PR-011 revision 2 rolled back successfully."
