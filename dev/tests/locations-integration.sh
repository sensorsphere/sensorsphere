#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
API_URL="${BASE_URL}/api/v1"

ROOT_ID=""
CHILD_ID=""

cleanup() {
  set +e

  if [[ -n "${CHILD_ID}" ]]; then
    curl -sS -o /dev/null \
      -X DELETE \
      "${API_URL}/locations/${CHILD_ID}" || true
  fi

  if [[ -n "${ROOT_ID}" ]]; then
    curl -sS -o /dev/null \
      -X DELETE \
      "${API_URL}/locations/${ROOT_ID}" || true
  fi
}

trap cleanup EXIT

require_command() {
  local command_name="$1"

  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "ERROR: Required command not found: ${command_name}" >&2
    exit 1
  fi
}

assert_status() {
  local expected="$1"
  local actual="$2"
  local label="$3"

  if [[ "${actual}" != "${expected}" ]]; then
    echo "FAIL: ${label}"
    echo "Expected HTTP ${expected}, got ${actual}"
    exit 1
  fi

  echo "PASS: ${label}"
}

request() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local response_file="$4"

  if [[ -n "${body}" ]]; then
    curl -sS \
      -o "${response_file}" \
      -w "%{http_code}" \
      -X "${method}" \
      -H "Content-Type: application/json" \
      -d "${body}" \
      "${url}"
  else
    curl -sS \
      -o "${response_file}" \
      -w "%{http_code}" \
      -X "${method}" \
      "${url}"
  fi
}

require_command curl
require_command jq

TMP_DIR="$(mktemp -d)"
trap 'cleanup; rm -rf "${TMP_DIR}"' EXIT

echo "SensorSphere Locations Integration Tests"
echo "API: ${API_URL}"
echo

health_status="$(
  curl -sS \
    -o "${TMP_DIR}/health.json" \
    -w "%{http_code}" \
    "${BASE_URL}/api/health"
)"
assert_status "200" "${health_status}" "API health"

suffix="$(date +%s)-$$"
root_name="Integration Root ${suffix}"
child_name="Integration Child ${suffix}"

status="$(
  request \
    POST \
    "${API_URL}/locations" \
    "{\"type\":\"SITE\",\"name\":\"${root_name}\"}" \
    "${TMP_DIR}/create-root.json"
)"
assert_status "201" "${status}" "Create root location"

ROOT_ID="$(jq -r '.id // empty' "${TMP_DIR}/create-root.json")"

if [[ -z "${ROOT_ID}" ]]; then
  echo "FAIL: Create root location did not return an ID"
  exit 1
fi

status="$(
  request \
    POST \
    "${API_URL}/locations" \
    "{\"parentId\":\"${ROOT_ID}\",\"type\":\"ROOM\",\"name\":\"${child_name}\"}" \
    "${TMP_DIR}/create-child.json"
)"
assert_status "201" "${status}" "Create child location"

CHILD_ID="$(jq -r '.id // empty' "${TMP_DIR}/create-child.json")"

if [[ -z "${CHILD_ID}" ]]; then
  echo "FAIL: Create child location did not return an ID"
  exit 1
fi

status="$(
  request \
    GET \
    "${API_URL}/locations/${ROOT_ID}" \
    "" \
    "${TMP_DIR}/get-root.json"
)"
assert_status "200" "${status}" "Get location by ID"

jq -e \
  --arg id "${ROOT_ID}" \
  --arg name "${root_name}" \
  '.id == $id and .name == $name' \
  "${TMP_DIR}/get-root.json" \
  >/dev/null

echo "PASS: Get location payload"

status="$(
  request \
    PATCH \
    "${API_URL}/locations/${CHILD_ID}" \
    '{"description":"Updated by integration test","metadata":{"integration":true}}' \
    "${TMP_DIR}/update-child.json"
)"
assert_status "200" "${status}" "Update location"

jq -e \
  '.description == "Updated by integration test" and .metadata.integration == true' \
  "${TMP_DIR}/update-child.json" \
  >/dev/null

echo "PASS: Update location payload"

status="$(
  request \
    PATCH \
    "${API_URL}/locations/${ROOT_ID}/move" \
    "{\"parentId\":\"${CHILD_ID}\"}" \
    "${TMP_DIR}/cycle.json"
)"
assert_status "400" "${status}" "Reject hierarchy cycle"

status="$(
  request \
    PATCH \
    "${API_URL}/locations/${CHILD_ID}/move" \
    "{\"parentId\":\"${CHILD_ID}\"}" \
    "${TMP_DIR}/self-parent.json"
)"
assert_status "400" "${status}" "Reject self parent"

status="$(
  request \
    DELETE \
    "${API_URL}/locations/${ROOT_ID}" \
    "" \
    "${TMP_DIR}/delete-root-conflict.json"
)"
assert_status "409" "${status}" "Protect location with child locations"

status="$(
  request \
    GET \
    "${API_URL}/locations/tree" \
    "" \
    "${TMP_DIR}/tree.json"
)"
assert_status "200" "${status}" "Get location tree"

jq -e \
  --arg root_id "${ROOT_ID}" \
  --arg child_id "${CHILD_ID}" \
  '
    any(
      .[];
      .id == $root_id
      and any(.children[]?; .id == $child_id)
    )
  ' \
  "${TMP_DIR}/tree.json" \
  >/dev/null

echo "PASS: Location tree hierarchy"

status="$(
  request \
    DELETE \
    "${API_URL}/locations/${CHILD_ID}" \
    "" \
    "${TMP_DIR}/delete-child.json"
)"
assert_status "204" "${status}" "Delete leaf location"
CHILD_ID=""

status="$(
  request \
    DELETE \
    "${API_URL}/locations/${ROOT_ID}" \
    "" \
    "${TMP_DIR}/delete-root.json"
)"
assert_status "204" "${status}" "Delete empty root location"
ROOT_ID=""

status="$(
  request \
    GET \
    "${API_URL}/locations/00000000-0000-0000-0000-000000000000" \
    "" \
    "${TMP_DIR}/not-found.json"
)"
assert_status "404" "${status}" "Return 404 for unknown location"

status="$(
  request \
    PATCH \
    "${API_URL}/locations/00000000-0000-0000-0000-000000000000" \
    '{}' \
    "${TMP_DIR}/invalid-payload.json"
)"
assert_status "400" "${status}" "Reject empty update payload"

echo
echo "All location integration tests passed."
