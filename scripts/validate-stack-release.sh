#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  cat <<'EOF'
Usage: scripts/validate-stack-release.sh <manifest.yaml>

Validates a SensorSphere Stack Release manifest against the module versions
and migration level in the current source tree.
EOF
}

[[ $# -eq 1 ]] || { usage >&2; exit 2; }
MANIFEST="$1"
[[ -f "$MANIFEST" ]] || { echo "Manifest not found: $MANIFEST" >&2; exit 1; }

yaml_top_value() {
  local key="$1"
  awk -v key="$key" '$1 == key ":" { print $2; exit }' "$MANIFEST"
}

component_value() {
  local component="$1"
  awk -v wanted="$component" '
    /^  [A-Za-z0-9_-]+:$/ {
      current=$1
      sub(/:$/, "", current)
    }
    current == wanted && /^    version:/ {
      print $2
      exit
    }
  ' "$MANIFEST"
}

module_version() {
  local file="$1"
  sed -n 's/^export const MODULE_VERSION = "\([^"]*\)";/\1/p' "$file"
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

STACK_VERSION="$(yaml_top_value stackVersion)"
SCHEMA_VERSION="$(yaml_top_value schemaVersion)"
[[ -n "$STACK_VERSION" ]] || fail "stackVersion is missing"
[[ "$SCHEMA_VERSION" == "1" ]] || fail "schemaVersion must be 1"

API_VERSION="$(component_value api)"
FRONTEND_VERSION="$(component_value frontend)"
INGESTION_VERSION="$(component_value ingestion)"
EXPECTED_API="$(module_version apps/api/src/module_version.ts)"
EXPECTED_FRONTEND="$(module_version apps/frontend/src/module_version.ts)"
EXPECTED_INGESTION="$(module_version apps/ingestion-service/src/module_version.ts)"

[[ "$API_VERSION" == "$EXPECTED_API" ]] || fail "API version $API_VERSION != $EXPECTED_API"
[[ "$FRONTEND_VERSION" == "$EXPECTED_FRONTEND" ]] || fail "Frontend version $FRONTEND_VERSION != $EXPECTED_FRONTEND"
[[ "$INGESTION_VERSION" == "$EXPECTED_INGESTION" ]] || fail "Ingestion version $INGESTION_VERSION != $EXPECTED_INGESTION"

MIGRATION_LEVEL="$(awk '$1 == "migrationLevel:" { print $2; exit }' "$MANIFEST")"
LATEST_MIGRATION="$(
  find infrastructure/timescaledb/migrations -maxdepth 1 -type f -name '[0-9][0-9][0-9]-*.sql'     -printf '%f\n' | sort | tail -1 | cut -c1-3 | sed 's/^0*//'
)"
[[ -n "$LATEST_MIGRATION" ]] || fail "No database migrations found"
[[ "$MIGRATION_LEVEL" == "$LATEST_MIGRATION" ]]   || fail "migrationLevel $MIGRATION_LEVEL != source level $LATEST_MIGRATION"

grep -Fq "ghcr.io/sensorsphere/sensorsphere-api:$API_VERSION" "$MANIFEST"   || fail "API image/version mismatch"
grep -Fq "ghcr.io/sensorsphere/sensorsphere-frontend:$FRONTEND_VERSION" "$MANIFEST"   || fail "Frontend image/version mismatch"
grep -Fq "ghcr.io/sensorsphere/sensorsphere-ingestion-service:$INGESTION_VERSION" "$MANIFEST"   || fail "Ingestion image/version mismatch"

echo "Stack Release $STACK_VERSION is valid"
echo "  API:       $API_VERSION"
echo "  Frontend:  $FRONTEND_VERSION"
echo "  Ingestion: $INGESTION_VERSION"
echo "  DB level:  $MIGRATION_LEVEL"
