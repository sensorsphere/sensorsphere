#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${PR_DIR}/.backup"

cd "${ROOT_DIR}"

echo "Applying PR-009 — Sensor Catalog API (revision 2)"

if [[ -d "${BACKUP_DIR}" ]]; then
  echo "ERROR: Backup directory already exists: ${BACKUP_DIR}" >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}/apps/api/src/features/sensors"

cp apps/api/package.json   "${BACKUP_DIR}/apps/api/package.json"

for file in dto.ts repository.ts service.ts controller.ts routes.ts
do
  cp     "apps/api/src/features/sensors/${file}"     "${BACKUP_DIR}/apps/api/src/features/sensors/${file}"
done

python3 <<'PY'
import json
from pathlib import Path

path = Path("apps/api/package.json")
data = json.loads(path.read_text())

dependencies = data.setdefault("dependencies", {})
dependencies.setdefault("zod", "^4")

path.write_text(
    json.dumps(data, indent=2) + "\n"
)
PY

cp -a   "${PR_DIR}/payload/apps/api/src/features/sensors/."   "apps/api/src/features/sensors/"

docker compose build api
docker compose up -d api

echo
echo "PR-009 revision 2 applied."
echo "Run:"
echo "  ./dev/tools/pr verify 009"
