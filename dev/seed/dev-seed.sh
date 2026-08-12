#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
API_URL="${BASE_URL}/api/v1"

require_command() {
  local command_name="$1"

  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "ERROR: Required command not found: ${command_name}" >&2
    exit 1
  fi
}

require_command curl
require_command jq

get_locations() {
  curl -fsS "${API_URL}/locations"
}

find_location_id() {
  local name="$1"
  local parent_id="${2:-}"

  get_locations \
    | jq -r \
      --arg name "${name}" \
      --arg parent_id "${parent_id}" \
      '
        .[]
        | select(.name == $name)
        | select(
            (($parent_id == "") and (.parentId == null))
            or
            (($parent_id != "") and (.parentId == $parent_id))
          )
        | .id
      ' \
    | head -n 1
}

create_location() {
  local type="$1"
  local name="$2"
  local parent_id="${3:-}"
  local description="${4:-}"

  local payload

  if [[ -n "${parent_id}" ]]; then
    payload="$(
      jq -n \
        --arg parent_id "${parent_id}" \
        --arg type "${type}" \
        --arg name "${name}" \
        --arg description "${description}" \
        '{
          parentId: $parent_id,
          type: $type,
          name: $name,
          description: (
            if $description == ""
            then null
            else $description
            end
          )
        }'
    )"
  else
    payload="$(
      jq -n \
        --arg type "${type}" \
        --arg name "${name}" \
        --arg description "${description}" \
        '{
          type: $type,
          name: $name,
          description: (
            if $description == ""
            then null
            else $description
            end
          )
        }'
    )"
  fi

  curl -fsS \
    -X POST \
    -H "Content-Type: application/json" \
    -d "${payload}" \
    "${API_URL}/locations" \
    | jq -r '.id'
}

ensure_location() {
  local type="$1"
  local name="$2"
  local parent_id="${3:-}"
  local description="${4:-}"

  local existing_id
  existing_id="$(
    find_location_id \
      "${name}" \
      "${parent_id}"
  )"

  if [[ -n "${existing_id}" ]]; then
    echo "EXISTS: ${name} (${existing_id})" >&2
    printf '%s\n' "${existing_id}"
    return
  fi

  local created_id
  created_id="$(
    create_location \
      "${type}" \
      "${name}" \
      "${parent_id}" \
      "${description}"
  )"

  echo "CREATED: ${name} (${created_id})" >&2
  printf '%s\n' "${created_id}"
}

health_status="$(
  curl -sS \
    -o /dev/null \
    -w "%{http_code}" \
    "${BASE_URL}/api/health"
)"

if [[ "${health_status}" != "200" ]]; then
  echo "ERROR: API health check failed with HTTP ${health_status}" >&2
  exit 1
fi

echo "SensorSphere Development Seed"
echo "API: ${API_URL}"
echo

home_id="$(
  ensure_location \
    "SITE" \
    "Main Home" \
    "" \
    "Primary demonstration site"
)"

ground_floor_id="$(
  ensure_location \
    "FLOOR" \
    "Ground Floor" \
    "${home_id}"
)"

first_floor_id="$(
  ensure_location \
    "FLOOR" \
    "First Floor" \
    "${home_id}"
)"

ensure_location \
  "ROOM" \
  "Living Room" \
  "${ground_floor_id}" \
  >/dev/null

ensure_location \
  "ROOM" \
  "Kitchen" \
  "${ground_floor_id}" \
  >/dev/null

ensure_location \
  "ROOM" \
  "Garage" \
  "${ground_floor_id}" \
  >/dev/null

ensure_location \
  "ROOM" \
  "Laundry" \
  "${ground_floor_id}" \
  >/dev/null

ensure_location \
  "ROOM" \
  "Office" \
  "${first_floor_id}" \
  >/dev/null

ensure_location \
  "ROOM" \
  "Bedroom" \
  "${first_floor_id}" \
  >/dev/null

ensure_location \
  "ROOM" \
  "Bathroom" \
  "${first_floor_id}" \
  >/dev/null

echo
echo "Development seed completed."
echo
echo "Current location tree:"
curl -fsS "${API_URL}/locations/tree" | jq
