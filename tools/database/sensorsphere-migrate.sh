#!/usr/bin/env sh

set -eu

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations}"

DB_HOST="${DB_HOST:-timescaledb}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:?DB_NAME is required}"
DB_USER="${DB_USER:?DB_USER is required}"
DB_PASSWORD="${DB_PASSWORD:?DB_PASSWORD is required}"

export PGPASSWORD="${DB_PASSWORD}"

log() {
  printf '[%s] %s\n' \
    "$(date '+%Y-%m-%d %H:%M:%S')" \
    "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

psql_cmd() {
  psql \
    -X \
    -v ON_ERROR_STOP=1 \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    "$@"
}

sql_escape() {
  printf '%s' "$1" \
    | sed "s/'/''/g"
}

log "SensorSphere database migration"
log "Database: ${DB_NAME}"
log "Host: ${DB_HOST}:${DB_PORT}"
log "Migrations: ${MIGRATIONS_DIR}"
log "Tracking table: public.schema_migrations"

[ -d "${MIGRATIONS_DIR}" ] \
  || fail "Migration directory not found: ${MIGRATIONS_DIR}"

# ===========================================================================
# Wait for PostgreSQL
# ===========================================================================

log "Waiting for PostgreSQL"

attempt=0

until pg_isready \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  >/dev/null 2>&1
do
  attempt=$((attempt + 1))

  if [ "${attempt}" -ge 60 ]; then
    fail "PostgreSQL did not become ready"
  fi

  sleep 2
done

log "PostgreSQL is ready"

# ===========================================================================
# Migration tracking table
#
# This is the historical SensorSphere schema and remains the single source
# of truth for database migration state.
# ===========================================================================

log "Ensuring migration tracking table exists"

psql_cmd <<'SQL'
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version           integer PRIMARY KEY,
  filename          text NOT NULL UNIQUE,
  checksum          text NOT NULL,
  executed_at       timestamptz NOT NULL DEFAULT now(),
  execution_time_ms bigint NOT NULL
);
SQL

# ===========================================================================
# Apply migrations in lexical order
# ===========================================================================

migration_count=0
applied_count=0
skipped_count=0

for migration in "${MIGRATIONS_DIR}"/*.sql; do

  if [ ! -f "${migration}" ]; then
    log "No SQL migrations found"
    break
  fi

  migration_count=$((migration_count + 1))

  filename="$(basename "${migration}")"

  case "${filename}" in
    [0-9][0-9][0-9]-*.sql)
      ;;
    *)
      fail "Invalid migration filename: ${filename}"
      ;;
  esac

  version_prefix="${filename%%-*}"

  # Strip leading zeroes safely.
  version="$(
    printf '%s' "${version_prefix}" \
      | sed 's/^0*//'
  )"

  [ -n "${version}" ] || version=0

  checksum="$(
    sha256sum "${migration}" \
      | awk '{print $1}'
  )"

  escaped_filename="$(sql_escape "${filename}")"
  escaped_checksum="$(sql_escape "${checksum}")"

  log "Checking ${filename}"

  existing="$(
    psql_cmd \
      -At \
      -F '|' \
      -c "
        SELECT
          version,
          filename,
          checksum
        FROM public.schema_migrations
        WHERE version = ${version}
           OR filename = '${escaped_filename}'
        ORDER BY version
        LIMIT 1;
      "
  )"

  if [ -n "${existing}" ]; then

    stored_version="$(
      printf '%s' "${existing}" \
        | cut -d'|' -f1
    )"

    stored_filename="$(
      printf '%s' "${existing}" \
        | cut -d'|' -f2
    )"

    stored_checksum="$(
      printf '%s' "${existing}" \
        | cut -d'|' -f3
    )"

    if [ "${stored_version}" != "${version}" ]; then
      fail "Migration filename ${filename} conflicts with existing version ${stored_version}"
    fi

    if [ "${stored_filename}" != "${filename}" ]; then
      fail "Migration version ${version} is already used by ${stored_filename}"
    fi

    if [ "${stored_checksum}" != "${checksum}" ]; then
      fail "Checksum mismatch for already-applied migration ${filename}"
    fi

    log "SKIP ${filename} (already applied)"

    skipped_count=$((skipped_count + 1))

    continue
  fi

  # =========================================================================
  # Apply new migration
  # =========================================================================

  log "APPLY ${filename}"

  started_at="$(
    date +%s
  )"

  psql_cmd \
    -f "${migration}"

  finished_at="$(
    date +%s
  )"

  execution_time_ms="$(
    expr \
      "${finished_at}" \
      - \
      "${started_at}"
  )"

  execution_time_ms="$(
    expr \
      "${execution_time_ms}" \
      \* \
      1000
  )"

  # Register only after the migration SQL completed successfully.

  psql_cmd \
    -c "
      INSERT INTO public.schema_migrations (
        version,
        filename,
        checksum,
        execution_time_ms
      )
      VALUES (
        ${version},
        '${escaped_filename}',
        '${escaped_checksum}',
        ${execution_time_ms}
      );
    "

  log "DONE ${filename} (${execution_time_ms} ms)"

  applied_count=$((applied_count + 1))

done

# ===========================================================================
# Summary
# ===========================================================================

log "Migration completed"
log "Found: ${migration_count}"
log "Applied: ${applied_count}"
log "Skipped: ${skipped_count}"
