#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CLI="${ROOT_DIR}/dev/bin/sensorsphere"
BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
REAL_ASSET_UUID="${REAL_ASSET_UUID:-f0890bb7-8491-4ba8-8d26-702d3838e310}"

cd "${ROOT_DIR}"

echo "Verifying PR-016 — Asset Domain Model"

"${CLI}" db status | grep -q "003-assets-metrics.sql"

docker compose build api >/dev/null

curl --fail --silent \
  "${BASE_URL}/api/v1/assets" \
  >/tmp/sensorsphere-pr016-assets.json

curl --fail --silent \
  "${BASE_URL}/api/v1/assets/${REAL_ASSET_UUID}" \
  >/tmp/sensorsphere-pr016-asset.json

python3 <<'PY'
import json

asset = json.load(
    open("/tmp/sensorsphere-pr016-asset.json")
)

metrics = asset.get("metrics", [])

if not metrics:
    raise SystemExit("ERROR: Asset has no metrics.")

keys = {
    metric.get("key")
    for metric in metrics
}

if "temperature" not in keys:
    raise SystemExit(
        "ERROR: Expected temperature metric."
    )

print("Metrics:", ", ".join(sorted(keys)))
PY

curl --fail --silent \
  "${BASE_URL}/api/v1/sensors" \
  >/dev/null

curl --fail --silent \
  "${BASE_URL}/api/v1/measurements/latest" \
  >/dev/null

"${CLI}" doctor >/dev/null

rm -f \
  /tmp/sensorsphere-pr016-assets.json \
  /tmp/sensorsphere-pr016-asset.json

echo "PR-016 verification passed."
