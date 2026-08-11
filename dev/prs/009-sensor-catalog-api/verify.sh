#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"

cd "${ROOT_DIR}"

echo "Verifying PR-009 — Sensor Catalog API"

docker compose config >/dev/null
docker compose build api >/dev/null

curl --fail --silent   "${BASE_URL}/api/health"   >/dev/null

curl --fail --silent   "${BASE_URL}/api/v1/sensors"   >/dev/null

curl --fail --silent   "${BASE_URL}/api/v1/measurements/latest"   >/dev/null

HTTP_CODE="$(
  curl     --silent     --output /tmp/sensorsphere-pr009-invalid.json     --write-out '%{http_code}'     -X PATCH     "${BASE_URL}/api/v1/sensors/not-a-uuid"     -H 'Content-Type: application/json'     -d '{"name":"test"}'
)"

[[ "${HTTP_CODE}" == "400" ]] || {
  echo "ERROR: Invalid UUID expected 400, got ${HTTP_CODE}" >&2
  exit 1
}

UNKNOWN_UUID="00000000-0000-4000-8000-000000000000"

HTTP_CODE="$(
  curl     --silent     --output /tmp/sensorsphere-pr009-notfound.json     --write-out '%{http_code}'     -X PATCH     "${BASE_URL}/api/v1/sensors/${UNKNOWN_UUID}"     -H 'Content-Type: application/json'     -d '{"name":"test"}'
)"

[[ "${HTTP_CODE}" == "404" ]] || {
  echo "ERROR: Unknown UUID expected 404, got ${HTTP_CODE}" >&2
  exit 1
}

rm -f   /tmp/sensorsphere-pr009-invalid.json   /tmp/sensorsphere-pr009-notfound.json

echo "PR-009 verification passed."
