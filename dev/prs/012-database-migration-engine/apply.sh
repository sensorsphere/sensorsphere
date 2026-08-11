#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${PR_DIR}/.backup"

cd "${ROOT_DIR}"

echo "Applying PR-012 — Database Migration Engine"

[[ ! -d "${BACKUP_DIR}" ]] || {
  echo "ERROR: Backup directory already exists." >&2
  exit 1
}

mkdir -p "${BACKUP_DIR}"

for path in \
  dev/tools/db \
  docs/database/migrations.md \
  CHANGELOG.md \
  docs/roadmap.md
do
  if [[ -f "${path}" ]]; then
    mkdir -p "${BACKUP_DIR}/$(dirname "${path}")"
    cp "${path}" "${BACKUP_DIR}/${path}"
    touch "${BACKUP_DIR}/${path}.existed"
  fi
done

mkdir -p dev/tools docs/database

cp "${PR_DIR}/payload/dev/tools/db" dev/tools/db.new
chmod +x dev/tools/db.new
mv dev/tools/db.new dev/tools/db

cp \
  "${PR_DIR}/payload/docs/database/migrations.md" \
  docs/database/migrations.md

python3 <<'PY'
from pathlib import Path

changelog = Path("CHANGELOG.md")
text = changelog.read_text()

marker = "## Unreleased\n"
entry = """## Unreleased

### Added

- Database migration engine with status, migrate and history commands.
- SHA-256 integrity validation for applied SQL migrations.
- Database migration documentation.
"""

if "Database migration engine with status, migrate and history commands." not in text:
    if marker in text:
        before, after = text.split(marker, 1)
        # Avoid keeping an immediate old "### Added" heading twice when possible.
        if after.startswith("\n### Added\n"):
            after = after[len("\n### Added\n"):]
            text = before + entry + after
        else:
            text = before + entry + "\n" + after
    else:
        text = text.rstrip() + "\n\n" + entry

    changelog.write_text(text)

roadmap = Path("docs/roadmap.md")
roadmap_text = roadmap.read_text()

old = "- Database migration engine"
new = "- Database migration engine ✅"

if new not in roadmap_text and old in roadmap_text:
    roadmap_text = roadmap_text.replace(old, new, 1)
    roadmap.write_text(roadmap_text)
PY

echo
echo "PR-012 applied."
echo "Next:"
echo "  ./dev/tools/db status"
echo "  ./dev/tools/pr verify 012"
