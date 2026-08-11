#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${PR_DIR}/.backup"
LINK_PATH="${HOME}/.local/bin/sensorsphere"

cd "${ROOT_DIR}"

echo "Rolling back PR-013 — SensorSphere CLI revision 2"

[[ -d "${BACKUP_DIR}" ]] || {
  echo "ERROR: Backup directory not found." >&2
  exit 1
}

for path in \
  tools/cli/go.mod \
  tools/cli/main.go \
  docs/development/cli.md \
  CHANGELOG.md \
  docs/roadmap.md \
  dev/bin/sensorsphere
do
  if [[ -f "${BACKUP_DIR}/${path}.existed" ]]; then
    mkdir -p "$(dirname "${path}")"
    cp "${BACKUP_DIR}/${path}" "${path}"
  else
    rm -f "${path}"
  fi
done

if [[ -f "${BACKUP_DIR}/local-bin.existed" ]]; then
  mkdir -p "$(dirname "${LINK_PATH}")"
  rm -f "${LINK_PATH}"
  cp -a "${BACKUP_DIR}/local-bin/sensorsphere" "${LINK_PATH}"
else
  rm -f "${LINK_PATH}"
fi

rm -rf "${BACKUP_DIR}"

echo "PR-013 revision 2 rolled back successfully."
