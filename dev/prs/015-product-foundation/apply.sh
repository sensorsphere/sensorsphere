#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${PR_DIR}/.backup"

cd "${ROOT_DIR}"

echo "Applying PR-015 — Product Foundation"

[[ ! -d "${BACKUP_DIR}" ]] || {
  echo "ERROR: Backup directory already exists." >&2
  exit 1
}

mkdir -p "${BACKUP_DIR}"

for path in \
  docs/project/constitution.md \
  docs/roadmap/master-plan-v1.0.md \
  docs/adr/ADR-0001-project-principles.md \
  docs/rfc/RFC-0001-device-domain.md \
  docs/development/contribution-conventions.md \
  CHANGELOG.md \
  docs/roadmap.md
do
  if [[ -f "${path}" ]]; then
    mkdir -p "${BACKUP_DIR}/$(dirname "${path}")"
    cp "${path}" "${BACKUP_DIR}/${path}"
    touch "${BACKUP_DIR}/${path}.existed"
  fi
done

mkdir -p \
  docs/project \
  docs/roadmap \
  docs/adr \
  docs/rfc \
  docs/development

cp "${PR_DIR}/payload/docs/project/constitution.md" \
   docs/project/constitution.md

cp "${PR_DIR}/payload/docs/roadmap/master-plan-v1.0.md" \
   docs/roadmap/master-plan-v1.0.md

cp "${PR_DIR}/payload/docs/adr/ADR-0001-project-principles.md" \
   docs/adr/ADR-0001-project-principles.md

cp "${PR_DIR}/payload/docs/rfc/RFC-0001-device-domain.md" \
   docs/rfc/RFC-0001-device-domain.md

cp "${PR_DIR}/payload/docs/development/contribution-conventions.md" \
   docs/development/contribution-conventions.md

python3 <<'PY'
from pathlib import Path

changelog = Path("CHANGELOG.md")
text = changelog.read_text()

needle = "- Product constitution and v1.0 master plan."
if needle not in text:
    marker = "### Added\n"
    if marker in text:
        text = text.replace(marker, marker + "\n" + needle + "\n", 1)
    else:
        text += "\n\n## Unreleased\n\n### Added\n\n" + needle + "\n"
    changelog.write_text(text)

roadmap = Path("docs/roadmap.md")
text = roadmap.read_text()

needle = "- Product foundation ✅"
if needle not in text:
    section = "## v0.2 — Inventory"
    if section in text:
        text = text.replace(
            section,
            section + "\n\n- Product foundation ✅",
            1,
        )
    else:
        text += "\n\n" + needle + "\n"
    roadmap.write_text(text)
PY

echo "PR-015 applied."
