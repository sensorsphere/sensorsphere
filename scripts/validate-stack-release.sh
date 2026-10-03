#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CHECK_SOURCE=0

usage() {
  cat <<'EOF'
Usage: scripts/validate-stack-release.sh [--source] <manifest.yaml>

Validates the structure and compatibility metadata of a SensorSphere Stack
Release. With --source, component versions and compatibility constants must
also match the current source tree.
EOF
}

if [[ "${1:-}" == "--source" ]]; then
  CHECK_SOURCE=1
  shift
fi

[[ $# -eq 1 ]] || { usage >&2; exit 2; }
MANIFEST="$1"
[[ -f "$MANIFEST" ]] || { echo "Manifest not found: $MANIFEST" >&2; exit 1; }

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

top_value() {
  local key="$1"
  awk -v key="$key" '$1 == key ":" { print $2; exit }' "$MANIFEST"
}

component_field() {
  local component="$1" field="$2"
  awk -v wanted="$component" -v field="$field" '
    /^  [A-Za-z0-9_-]+:$/ {
      current=$1
      sub(/:$/, "", current)
    }
    current == wanted && $1 == field ":" {
      print $2
      exit
    }
  ' "$MANIFEST"
}

compatibility_value() {
  local key="$1"
  awk -v key="$key" '
    /^compatibility:$/ { inside=1; next }
    inside && /^[^ ]/ { exit }
    inside && $1 == key ":" { print $2; exit }
  ' "$MANIFEST"
}

module_version() {
  local file="$1"
  sed -n 's/^export const MODULE_VERSION = "\([^"]*\)";/\1/p' "$file"
}

constant_integer() {
  local file="$1" name="$2"
  sed -n "s/^export const $name = \([0-9][0-9]*\);/\1/p" "$file"
}

require_component() {
  local component="$1" repository="$2"
  local version image

  version="$(component_field "$component" version)"
  image="$(component_field "$component" image)"

  [[ -n "$version" ]] || fail "$component version is missing"
  [[ -n "$image" ]] || fail "$component image is missing"
  [[ "$image" == "ghcr.io/sensorsphere/$repository:$version" ]]     || fail "$component image/version mismatch"

  printf '%s' "$version"
}

STACK_VERSION="$(top_value stackVersion)"
SCHEMA_VERSION="$(top_value schemaVersion)"

[[ -n "$STACK_VERSION" ]] || fail "stackVersion is missing"
[[ "$SCHEMA_VERSION" =~ ^[1234]$ ]] || fail "schemaVersion must be 1, 2, 3 or 4"

API_VERSION="$(require_component api sensorsphere-api)"
FRONTEND_VERSION="$(require_component frontend sensorsphere-frontend)"
INGESTION_VERSION="$(require_component ingestion sensorsphere-ingestion-service)"

NGINX_VERSION=""
MIGRATIONS_VERSION=""
BACKUP_VERSION=""

if (( SCHEMA_VERSION >= 2 )); then
  NGINX_VERSION="$(require_component nginx sensorsphere-nginx)"
  MIGRATIONS_VERSION="$(require_component migrations sensorsphere-migrations)"
fi
if (( SCHEMA_VERSION >= 4 )); then
  BACKUP_VERSION="$(require_component backup sensorsphere-backup)"
fi

MIGRATION_LEVEL="$(awk '$1 == "migrationLevel:" { print $2; exit }' "$MANIFEST")"
[[ "$MIGRATION_LEVEL" =~ ^[0-9]+$ ]] || fail "database migrationLevel must be an integer"

if (( SCHEMA_VERSION >= 2 )); then
  [[ "$MIGRATIONS_VERSION" == "$MIGRATION_LEVEL" ]]     || fail "migrations image version $MIGRATIONS_VERSION != migrationLevel $MIGRATION_LEVEL"
fi

if (( SCHEMA_VERSION >= 3 )); then
  API_CONTRACT="$(compatibility_value apiContractVersion)"
  FRONTEND_CONTRACT="$(compatibility_value frontendRequiredApiContractVersion)"
  DB_MIN="$(compatibility_value databaseMinMigrationLevel)"
  DB_MAX="$(compatibility_value databaseMaxMigrationLevel)"

  [[ "$API_CONTRACT" =~ ^[0-9]+$ ]] || fail "apiContractVersion must be an integer"
  [[ "$FRONTEND_CONTRACT" =~ ^[0-9]+$ ]] || fail "frontendRequiredApiContractVersion must be an integer"
  [[ "$DB_MIN" =~ ^[0-9]+$ ]] || fail "databaseMinMigrationLevel must be an integer"
  [[ "$DB_MAX" =~ ^[0-9]+$ ]] || fail "databaseMaxMigrationLevel must be an integer"
  [[ "$API_CONTRACT" == "$FRONTEND_CONTRACT" ]]     || fail "frontend/API contract mismatch: frontend=$FRONTEND_CONTRACT api=$API_CONTRACT"
  (( DB_MIN <= MIGRATION_LEVEL && MIGRATION_LEVEL <= DB_MAX ))     || fail "migrationLevel $MIGRATION_LEVEL is outside API DB compatibility range $DB_MIN..$DB_MAX"
fi

if [[ "$CHECK_SOURCE" -eq 1 ]]; then
  EXPECTED_API="$(module_version apps/api/src/module_version.ts)"
  EXPECTED_FRONTEND="$(module_version apps/frontend/src/module_version.ts)"
  EXPECTED_INGESTION="$(module_version apps/ingestion-service/src/module_version.ts)"
  LATEST_MIGRATION="$(
    find infrastructure/timescaledb/migrations -maxdepth 1 -type f -name '[0-9][0-9][0-9]-*.sql'       -printf '%f\n' | sort | tail -1 | cut -c1-3 | sed 's/^0*//'
  )"

  [[ "$API_VERSION" == "$EXPECTED_API" ]] || fail "API version $API_VERSION != source $EXPECTED_API"
  [[ "$FRONTEND_VERSION" == "$EXPECTED_FRONTEND" ]] || fail "Frontend version $FRONTEND_VERSION != source $EXPECTED_FRONTEND"
  [[ "$INGESTION_VERSION" == "$EXPECTED_INGESTION" ]] || fail "Ingestion version $INGESTION_VERSION != source $EXPECTED_INGESTION"
  [[ "$MIGRATION_LEVEL" == "$LATEST_MIGRATION" ]] || fail "migrationLevel $MIGRATION_LEVEL != source level $LATEST_MIGRATION"

  if (( SCHEMA_VERSION >= 2 )); then
    EXPECTED_NGINX="$(tr -d '[:space:]' < infrastructure/nginx/VERSION)"
    EXPECTED_MIGRATIONS="$(tr -d '[:space:]' < infrastructure/timescaledb/migrations/VERSION)"
    [[ "$NGINX_VERSION" == "$EXPECTED_NGINX" ]] || fail "nginx version $NGINX_VERSION != source $EXPECTED_NGINX"
    [[ "$MIGRATIONS_VERSION" == "$EXPECTED_MIGRATIONS" ]] || fail "migrations version $MIGRATIONS_VERSION != source $EXPECTED_MIGRATIONS"
  fi

  if (( SCHEMA_VERSION >= 4 )); then
    EXPECTED_BACKUP="$(tr -d '[:space:]' < apps/backup/VERSION)"
    [[ "$BACKUP_VERSION" == "$EXPECTED_BACKUP" ]] || fail "backup version $BACKUP_VERSION != source $EXPECTED_BACKUP"
  fi

  if (( SCHEMA_VERSION >= 3 )); then
    EXPECTED_API_CONTRACT="$(constant_integer apps/api/src/compatibility.ts API_CONTRACT_VERSION)"
    EXPECTED_FRONTEND_CONTRACT="$(constant_integer apps/frontend/src/compatibility.ts REQUIRED_API_CONTRACT_VERSION)"
    EXPECTED_DB_MIN="$(constant_integer apps/api/src/compatibility.ts DATABASE_MIN_MIGRATION_LEVEL)"
    EXPECTED_DB_MAX="$(constant_integer apps/api/src/compatibility.ts DATABASE_MAX_MIGRATION_LEVEL)"

    [[ "$API_CONTRACT" == "$EXPECTED_API_CONTRACT" ]] || fail "apiContractVersion $API_CONTRACT != source $EXPECTED_API_CONTRACT"
    [[ "$FRONTEND_CONTRACT" == "$EXPECTED_FRONTEND_CONTRACT" ]] || fail "frontendRequiredApiContractVersion $FRONTEND_CONTRACT != source $EXPECTED_FRONTEND_CONTRACT"
    [[ "$DB_MIN" == "$EXPECTED_DB_MIN" ]] || fail "databaseMinMigrationLevel $DB_MIN != source $EXPECTED_DB_MIN"
    [[ "$DB_MAX" == "$EXPECTED_DB_MAX" ]] || fail "databaseMaxMigrationLevel $DB_MAX != source $EXPECTED_DB_MAX"
  fi
fi

echo "Stack Release $STACK_VERSION is valid"
echo "  Schema:     $SCHEMA_VERSION"
echo "  API:        $API_VERSION"
echo "  Frontend:   $FRONTEND_VERSION"
echo "  Ingestion:  $INGESTION_VERSION"
if (( SCHEMA_VERSION >= 2 )); then
  echo "  nginx:      $NGINX_VERSION"
  echo "  migrations: $MIGRATIONS_VERSION"
fi
if (( SCHEMA_VERSION >= 4 )); then
  echo "  backup:     $BACKUP_VERSION"
fi
echo "  DB level:   $MIGRATION_LEVEL"
if (( SCHEMA_VERSION >= 3 )); then
  echo "  API contract: $API_CONTRACT"
  echo "  DB range:     $DB_MIN..$DB_MAX"
fi
