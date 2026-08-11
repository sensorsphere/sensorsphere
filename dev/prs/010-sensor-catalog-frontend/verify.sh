#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
REAL_SENSOR_UUID="${REAL_SENSOR_UUID:-f0890bb7-8491-4ba8-8d26-702d3838e310}"

cd "${ROOT_DIR}"

echo "Verifying PR-010 — Sensor Catalog Frontend"
echo

echo "[1/6] Docker Compose"
docker compose config >/dev/null
echo "OK"

echo
echo "[2/6] Frontend build"
docker compose build frontend >/dev/null
echo "OK"

echo
echo "[3/6] Web root"
curl --fail --silent   "${BASE_URL}/"   >/dev/null
echo "OK"

echo
echo "[4/6] Sensor catalog API"
curl --fail --silent   "${BASE_URL}/api/v1/sensors"   >/dev/null
echo "OK"

echo
echo "[5/6] Existing real sensor lookup"
curl --fail --silent   "${BASE_URL}/api/v1/sensors/${REAL_SENSOR_UUID}"   >/dev/null
echo "OK"

echo
echo "[6/6] Telemetry remains available"
curl --fail --silent   "${BASE_URL}/api/v1/measurements/latest"   >/dev/null

curl --fail --silent   "${BASE_URL}/api/v1/measurements/history?sensor_uid=d0_ca_52"   >/dev/null
echo "OK"

echo
echo "PR-010 verification passed."
echo
echo "Manual check:"
echo "  Open ${BASE_URL}/ and verify that:"
echo "  - both sensors are available in History"
echo "  - the Sensors section is visible"
echo "  - Edit opens the sensor metadata dialog"
