#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${PR_DIR}/.backup"
CLI="${ROOT_DIR}/dev/bin/sensorsphere"

cd "${ROOT_DIR}"

echo "Applying PR-016 — Asset Domain Model"

[[ ! -d "${BACKUP_DIR}" ]] || {
  echo "ERROR: Backup directory already exists." >&2
  exit 1
}

mkdir -p "${BACKUP_DIR}"

for path in \
  infrastructure/timescaledb/migrations/003-assets-metrics.sql \
  packages/core/src/inventory/asset.ts \
  packages/core/src/inventory/asset-metric.ts \
  packages/core/src/index.ts \
  apps/api/src/index.ts \
  docs/rfc/RFC-0001-device-domain-implementation.md \
  CHANGELOG.md \
  docs/roadmap.md
do
  if [[ -f "${path}" ]]; then
    mkdir -p "${BACKUP_DIR}/$(dirname "${path}")"
    cp "${path}" "${BACKUP_DIR}/${path}"
    touch "${BACKUP_DIR}/${path}.existed"
  fi
done

if [[ -d apps/api/src/features/assets ]]; then
  mkdir -p "${BACKUP_DIR}/apps/api/src/features"
  cp -a apps/api/src/features/assets \
    "${BACKUP_DIR}/apps/api/src/features/assets"
  touch "${BACKUP_DIR}/assets-feature.existed"
fi

mkdir -p \
  infrastructure/timescaledb/migrations \
  packages/core/src/inventory \
  apps/api/src/features/assets \
  docs/rfc

cp "${PR_DIR}/payload/infrastructure/timescaledb/migrations/003-assets-metrics.sql" \
  infrastructure/timescaledb/migrations/003-assets-metrics.sql

cp "${PR_DIR}/payload/packages/core/src/inventory/asset.ts" \
  packages/core/src/inventory/asset.ts

cp "${PR_DIR}/payload/packages/core/src/inventory/asset-metric.ts" \
  packages/core/src/inventory/asset-metric.ts

cp -a "${PR_DIR}/payload/apps/api/src/features/assets/." \
  apps/api/src/features/assets/

cp "${PR_DIR}/payload/docs/rfc/RFC-0001-device-domain-implementation.md" \
  docs/rfc/RFC-0001-device-domain-implementation.md

python3 <<'PY'
from pathlib import Path

core_index = Path("packages/core/src/index.ts")
text = core_index.read_text()

for line in [
    'export * from "./inventory/asset.js";',
    'export * from "./inventory/asset-metric.js";',
]:
    if line not in text:
        text = line + "\n" + text

core_index.write_text(text)

api_index = Path("apps/api/src/index.ts")
text = api_index.read_text()

import_block = (
    'import {\n'
    '  registerAssetFeature\n'
    '} from "./features/assets/index.js";\n\n'
)

if "registerAssetFeature" not in text:
    sensor_import = (
        'import {\n'
        '  registerSensorFeature\n'
        '} from "./features/sensors/index.js";\n'
    )

    if sensor_import in text:
        text = text.replace(
            sensor_import,
            sensor_import + "\n" + import_block,
            1,
        )
    else:
        text = import_block + text

registration = (
    'await registerAssetFeature(\n'
    '  app,\n'
    '  {\n'
    '    pool\n'
    '  }\n'
    ');\n\n'
)

if "await registerAssetFeature(" not in text:
    marker = "await registerSensorFeature("
    pos = text.find(marker)

    if pos >= 0:
        text = text[:pos] + registration + text[pos:]
    else:
        pos = text.find("app.listen")
        if pos < 0:
            raise SystemExit(
                "ERROR: Unable to locate API registration point."
            )
        text = text[:pos] + registration + text[pos:]

api_index.write_text(text)

changelog = Path("CHANGELOG.md")
text = changelog.read_text()
needle = "- Asset and Asset Metric domain model."

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

if "- Asset Domain Model ✅" not in text:
    if "- Asset Domain Model" in text:
        text = text.replace(
            "- Asset Domain Model",
            "- Asset Domain Model ✅",
            1,
        )
    else:
        text += "\n- Asset Domain Model ✅\n"

roadmap.write_text(text)
PY

echo "Applying migration 003..."
"${CLI}" db migrate

echo "Building API..."
docker compose build api

echo "Restarting API..."
docker compose up -d api

echo "PR-016 applied."
