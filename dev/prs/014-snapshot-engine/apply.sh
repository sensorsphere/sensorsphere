#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${PR_DIR}/.backup"
BINARY_PATH="${ROOT_DIR}/dev/bin/sensorsphere"

cd "${ROOT_DIR}"

echo "Applying PR-014 — Snapshot Engine"

[[ ! -d "${BACKUP_DIR}" ]] || {
  echo "ERROR: Backup directory already exists." >&2
  exit 1
}

mkdir -p "${BACKUP_DIR}"

for path in \
  tools/cli/main.go \
  docs/development/snapshots.md \
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

mkdir -p tools/cli docs/development dev/bin

cp "${PR_DIR}/payload/tools/cli/main.go" tools/cli/main.go
cp "${PR_DIR}/payload/docs/development/snapshots.md" docs/development/snapshots.md

rm -f "${BINARY_PATH}"

echo "Building SensorSphere CLI..."

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

python3 <<'PY'
from pathlib import Path

changelog = Path("CHANGELOG.md")
text = changelog.read_text()

needle = "- Snapshot creation and inspection."
if needle not in text:
    marker = "### Added\n"
    if marker in text:
        text = text.replace(
            marker,
            marker + "\n" + needle + "\n",
            1,
        )
    else:
        text += "\n\n## Unreleased\n\n### Added\n\n" + needle + "\n"
    changelog.write_text(text)

roadmap = Path("docs/roadmap.md")
text = roadmap.read_text()
old = "- Project snapshots"
new = "- Project snapshots ✅"

if new not in text and old in text:
    roadmap.write_text(text.replace(old, new, 1))
PY

echo "PR-014 applied."
