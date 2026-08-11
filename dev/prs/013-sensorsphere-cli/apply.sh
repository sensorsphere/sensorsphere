#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${PR_DIR}/.backup"
LOCAL_BIN="${HOME}/.local/bin"
LINK_PATH="${LOCAL_BIN}/sensorsphere"
BINARY_PATH="${ROOT_DIR}/dev/bin/sensorsphere"

cd "${ROOT_DIR}"

echo "Applying PR-013 — SensorSphere CLI revision 2"

# Revision 1 may have created a root-owned binary before failing.
if [[ -e "${BINARY_PATH}" && ! -w "${BINARY_PATH}" ]]; then
  echo "ERROR: Existing CLI binary is not writable by the current user:"
  ls -l "${BINARY_PATH}"
  echo
  echo "Remove it once with:"
  echo "  sudo rm -f ${BINARY_PATH}"
  echo
  echo "Then run apply again."
  exit 1
fi

[[ ! -d "${BACKUP_DIR}" ]] || {
  echo "ERROR: Backup directory already exists." >&2
  echo "If revision 1 failed, remove this extracted PR and extract revision 2 fresh." >&2
  exit 1
}

mkdir -p "${BACKUP_DIR}"

for path in \
  tools/cli/go.mod \
  tools/cli/main.go \
  docs/development/cli.md \
  CHANGELOG.md \
  docs/roadmap.md \
  dev/bin/sensorsphere
do
  if [[ -f "${path}" ]]; then
    mkdir -p "${BACKUP_DIR}/$(dirname "${path}")"
    cp "${path}" "${BACKUP_DIR}/${path}"
    touch "${BACKUP_DIR}/${path}.existed"
  fi
done

if [[ -L "${LINK_PATH}" || -f "${LINK_PATH}" ]]; then
  mkdir -p "${BACKUP_DIR}/local-bin"
  cp -a "${LINK_PATH}" "${BACKUP_DIR}/local-bin/sensorsphere"
  touch "${BACKUP_DIR}/local-bin.existed"
fi

mkdir -p \
  tools/cli \
  dev/bin \
  docs/development \
  "${LOCAL_BIN}"

cp "${PR_DIR}/payload/tools/cli/go.mod" tools/cli/go.mod
cp "${PR_DIR}/payload/tools/cli/main.go" tools/cli/main.go
cp "${PR_DIR}/payload/docs/development/cli.md" docs/development/cli.md

rm -f "${BINARY_PATH}"

echo "Building SensorSphere CLI as UID $(id -u), GID $(id -g)..."

docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/tmp \
  -e GOCACHE=/tmp/go-build \
  -v "${ROOT_DIR}:/workspace" \
  -w /workspace/tools/cli \
  golang:alpine \
  go build \
    -trimpath \
    -o /workspace/dev/bin/sensorsphere \
    .

[[ -x "${BINARY_PATH}" ]] || {
  echo "ERROR: CLI binary was not created as executable." >&2
  exit 1
}

OWNER_UID="$(stat -c '%u' "${BINARY_PATH}")"
OWNER_GID="$(stat -c '%g' "${BINARY_PATH}")"

if [[ "${OWNER_UID}" != "$(id -u)" || "${OWNER_GID}" != "$(id -g)" ]]; then
  echo "ERROR: CLI binary ownership is incorrect." >&2
  ls -l "${BINARY_PATH}" >&2
  exit 1
fi

ln -sfn "${BINARY_PATH}" "${LINK_PATH}"

python3 <<'PY'
from pathlib import Path

changelog = Path("CHANGELOG.md")
text = changelog.read_text()

needle = "- Go-based SensorSphere CLI."
if needle not in text:
    marker = "### Added\n"
    if marker in text:
        text = text.replace(marker, marker + "\n" + needle + "\n", 1)
    else:
        text += "\n\n## Unreleased\n\n### Added\n\n" + needle + "\n"
    changelog.write_text(text)

roadmap = Path("docs/roadmap.md")
text = roadmap.read_text()
old = "- SensorSphere CLI"
new = "- SensorSphere CLI ✅"

if new not in text and old in text:
    roadmap.write_text(text.replace(old, new, 1))
PY

echo
echo "PR-013 revision 2 applied."
echo
ls -l "${BINARY_PATH}"
