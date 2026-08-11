#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${PR_DIR}/.backup"

cd "${ROOT_DIR}"

echo "Applying PR-011 — Platform Foundation revision 2"

[[ ! -d "${BACKUP_DIR}" ]] || {
  echo "ERROR: Backup directory already exists." >&2
  exit 1
}

mkdir -p "${BACKUP_DIR}"

if [[ -f dev/tools/pr ]]; then
  mkdir -p "${BACKUP_DIR}/dev/tools"
  cp dev/tools/pr "${BACKUP_DIR}/dev/tools/pr"
fi

for path in \
  CHANGELOG.md \
  docs/roadmap.md \
  docs/architecture/vision.md \
  docs/architecture/dev-workflow.md \
  docs/architecture/api-guidelines.md
do
  if [[ -f "${path}" ]]; then
    mkdir -p "${BACKUP_DIR}/$(dirname "${path}")"
    cp "${path}" "${BACKUP_DIR}/${path}"
    touch "${BACKUP_DIR}/${path}.existed"
  fi
done

cp -a "${PR_DIR}/payload/." .

chmod +x dev/tools/pr

echo
echo "PR-011 revision 2 applied."
echo "Run:"
echo "  ./dev/tools/pr verify 011"
