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

[ -d "${MIGRATIONS_DIR}" ] \
  || fail "Migration directory not found: ${MIGRATIONS_DIR}"

# ---------------------------------------------------------------------------
# Wait for PostgreSQL
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Migration tracking table
# ---------------------------------------------------------------------------

log "Ensuring migration tracking table exists"

psql_cmd <<'SQL'
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename       text PRIMARY KEY,
  checksum       text NOT NULL,
  applied_at     timestamptz NOT NULL DEFAULT now()
);
SQL

# ---------------------------------------------------------------------------
# Apply migrations in lexical order.
# ---------------------------------------------------------------------------

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

  checksum="$(
    sha256sum "${migration}" \
      | awk '{print $1}'
  )"

  escaped_filename="$(sql_escape "${filename}")"
  escaped_checksum="$(sql_escape "${checksum}")"

  log "Checking ${filename}"

  stored_checksum="$(
    psql_cmd \
      -At \
      -c "
        SELECT checksum
        FROM public.schema_migrations
        WHERE filename = '${escaped_filename}';
      "
  )"

  if [ -n "${stored_checksum}" ]; then

    if [ "${stored_checksum}" != "${checksum}" ]; then
      fail "Checksum mismatch for already-applied migration ${filename}"
    fi

    log "SKIP ${filename} (already applied)"
    skipped_count=$((skipped_count + 1))
    continue
  fi

  log "APPLY ${filename}"

  psql_cmd \
    -f "${migration}"

  psql_cmd \
    -c "
      INSERT INTO public.schema_migrations (
        filename,
        checksum
      )
      VALUES (
        '${escaped_filename}',
        '${escaped_checksum}'
      );
    "

  log "DONE ${filename}"

  applied_count=$((applied_count + 1))

done

log "Migration completed"
log "Found: ${migration_count}"
log "Applied: ${applied_count}"
log "Skipped: ${skipped_count}"
