#!/usr/bin/env bash

set -Eeuo pipefail

RESTORE_VERSION="2"

# ---------------------------------------------------------------------------
# Resolve repository root from the real script path, including symlinks.
# ---------------------------------------------------------------------------

SOURCE="${BASH_SOURCE[0]}"

while [[ -L "${SOURCE}" ]]; do
  SCRIPT_DIR="$(cd -P "$(dirname "${SOURCE}")" >/dev/null 2>&1 && pwd)"
  SOURCE="$(readlink "${SOURCE}")"

  if [[ "${SOURCE}" != /* ]]; then
    SOURCE="${SCRIPT_DIR}/${SOURCE}"
  fi
done

SCRIPT_DIR="$(cd -P "$(dirname "${SOURCE}")" >/dev/null 2>&1 && pwd)"

PROJECT_DIR="${PROJECT_DIR:-$(
  cd "${SCRIPT_DIR}/../.." >/dev/null 2>&1
  pwd
)}"

# Preserve only values explicitly supplied by the caller. These must continue
# to take precedence even after the project and its .env have been restored.
CALLER_DB_SERVICE="${DB_SERVICE-}"
CALLER_DB_USER="${DB_USER-}"
CALLER_DB_NAME="${DB_NAME-}"
CALLER_PROJECT_BACKUP_IMAGE="${PROJECT_BACKUP_IMAGE-}"

read_env_value() {
  local variable="$1"
  local env_file="$2"

  if [[ ! -f "${env_file}" ]]; then
    return 0
  fi

  (
    set -a
    # shellcheck disable=SC1090
    source "${env_file}"
    printf '%s' "${!variable-}"
  )
}

load_project_configuration() {
  ENV_FILE="${PROJECT_DIR}/.env"

  local env_db_service
  local env_db_user
  local env_db_name
  local env_postgres_user
  local env_postgres_db
  local env_project_backup_image

  env_db_service="$(read_env_value DB_SERVICE "${ENV_FILE}")"
  env_db_user="$(read_env_value DB_USER "${ENV_FILE}")"
  env_db_name="$(read_env_value DB_NAME "${ENV_FILE}")"
  env_postgres_user="$(read_env_value POSTGRES_USER "${ENV_FILE}")"
  env_postgres_db="$(read_env_value POSTGRES_DB "${ENV_FILE}")"
  env_project_backup_image="$(read_env_value PROJECT_BACKUP_IMAGE "${ENV_FILE}")"

  DB_SERVICE="${CALLER_DB_SERVICE:-${env_db_service:-timescaledb}}"

  DB_USER="${CALLER_DB_USER:-${env_db_user:-${env_postgres_user:-iot_app}}}"

  DB_NAME="${CALLER_DB_NAME:-${env_db_name:-${env_postgres_db:-iot}}}"

  PROJECT_BACKUP_IMAGE="${CALLER_PROJECT_BACKUP_IMAGE:-${env_project_backup_image:-eclipse-mosquitto:2}}"
}

load_project_configuration

BACKUP_DIR="${1:-}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() {
  printf '[%s] %s\n' \
    "$(date '+%Y-%m-%d %H:%M:%S')" \
    "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

usage() {
  cat <<EOF
Usage:
  sensorsphere-restore <backup-directory>

Example:
  sensorsphere-restore /var/backups/sensorsphere/2026-08-16_120000

Optional environment overrides:
  PROJECT_DIR=/path/to/sensorsphere
  DB_SERVICE=timescaledb
  DB_USER=iot_app
  DB_NAME=iot
EOF
}

# ---------------------------------------------------------------------------
# Arguments / preconditions
# ---------------------------------------------------------------------------

if [[ -z "${BACKUP_DIR}" ]]; then
  usage
  exit 1
fi

for command_name in docker tar sha256sum readlink; do
  command -v "${command_name}" >/dev/null 2>&1 \
    || fail "${command_name} is not installed"
done

BACKUP_DIR="$(readlink -f "${BACKUP_DIR}")"

[[ -d "${BACKUP_DIR}" ]] \
  || fail "Backup directory not found: ${BACKUP_DIR}"

REQUIRED_FILES=(
  database.dump
  database-globals.sql
  app-data.tar.gz
  mosquitto.tar.gz
  project.tar.gz
  manifest.txt
  SHA256SUMS
)

for file in "${REQUIRED_FILES[@]}"; do
  [[ -f "${BACKUP_DIR}/${file}" ]] \
    || fail "Missing backup file: ${file}"
done

log "Checking backup integrity"

(
  cd "${BACKUP_DIR}"
  sha256sum -c SHA256SUMS
) || fail "Checksum verification failed"

tar tzf "${BACKUP_DIR}/project.tar.gz" \
  >/dev/null \
  || fail "Project archive validation failed"

tar tzf "${BACKUP_DIR}/mosquitto.tar.gz" \
  >/dev/null \
  || fail "Mosquitto archive validation failed"

echo
echo "WARNING"
echo
echo "This operation will restore SensorSphere from:"
echo "  ${BACKUP_DIR}"
echo
echo "Target project:"
echo "  ${PROJECT_DIR}"
echo
echo "Current application data, Mosquitto data, project files and"
echo "PostgreSQL / TimescaleDB data will be replaced."
echo
echo "The current project directory will first be renamed as a safety copy."
echo

read -r -p 'Type RESTORE to continue: ' confirmation

[[ "${confirmation}" == "RESTORE" ]] \
  || fail "Restore cancelled"

PROJECT_PARENT="$(dirname "${PROJECT_DIR}")"
PROJECT_NAME="$(basename "${PROJECT_DIR}")"
PRE_RESTORE_DIR="${PROJECT_DIR}.pre-restore-$(date +%Y%m%d_%H%M%S)"

# ---------------------------------------------------------------------------
# Stop current stack.
# ---------------------------------------------------------------------------

if [[ -f "${PROJECT_DIR}/docker-compose.yml" ]]; then
  log "Stopping current SensorSphere stack"

  (
    cd "${PROJECT_DIR}"
    docker compose down
  )
fi

# ---------------------------------------------------------------------------
# Keep the current tree as a safety copy.
# ---------------------------------------------------------------------------

if [[ -d "${PROJECT_DIR}" ]]; then
  log "Moving current project to:"
  log "  ${PRE_RESTORE_DIR}"

  mv "${PROJECT_DIR}" "${PRE_RESTORE_DIR}"
fi

mkdir -p "${PROJECT_PARENT}"

# ---------------------------------------------------------------------------
# Restore project.
#
# Extracting as the current user intentionally normalizes ownership of project
# files. Container-specific runtime ownership is recreated for persistent
# runtime directories below.
# ---------------------------------------------------------------------------

log "Restoring SensorSphere project"

tar xzf \
  "${BACKUP_DIR}/project.tar.gz" \
  -C "${PROJECT_PARENT}"

[[ -d "${PROJECT_DIR}" ]] \
  || fail "Project archive did not recreate ${PROJECT_DIR}"

# Configuration must now come from the restored .env.
load_project_configuration

cd "${PROJECT_DIR}"

log "Restored environment: $([[ -f "${ENV_FILE}" ]] && printf '%s' "${ENV_FILE}" || printf 'none')"
log "Database service: ${DB_SERVICE}"
log "Database: ${DB_NAME}"
log "Database user: ${DB_USER}"

docker compose config --quiet \
  || fail "Restored Docker Compose configuration is invalid"

# ---------------------------------------------------------------------------
# Restore application persistent data.
# ---------------------------------------------------------------------------

log "Restoring application persistent data"

rm -rf "${PROJECT_DIR}/data/app"

mkdir -p "${PROJECT_DIR}/data"

tar xzf \
  "${BACKUP_DIR}/app-data.tar.gz" \
  -C "${PROJECT_DIR}"

# ---------------------------------------------------------------------------
# Restore Mosquitto.
#
# Use a root helper container because mosquitto.db normally belongs to the UID
# used by Mosquitto inside its container.
# ---------------------------------------------------------------------------

log "Restoring Mosquitto configuration and data"

mkdir -p \
  "${PROJECT_DIR}/infrastructure/mosquitto"

docker image inspect "${PROJECT_BACKUP_IMAGE}" \
  >/dev/null 2>&1 \
  || fail "Required helper image is not available locally: ${PROJECT_BACKUP_IMAGE}"

docker run \
  --rm \
  --user 0:0 \
  --entrypoint sh \
  -v "${PROJECT_DIR}/infrastructure/mosquitto:/target" \
  -v "${BACKUP_DIR}:/backup:ro" \
  "${PROJECT_BACKUP_IMAGE}" \
  -c '
    rm -rf /target/config /target/data
    mkdir -p /target
    tar xzf /backup/mosquitto.tar.gz -C /target
  '

# ---------------------------------------------------------------------------
# Create a clean TimescaleDB storage directory.
# ---------------------------------------------------------------------------

log "Preparing clean TimescaleDB storage"

rm -rf \
  "${PROJECT_DIR}/infrastructure/timescaledb/data"

# Let Docker/the TimescaleDB entrypoint create the bind directory with the
# ownership it expects.
log "Starting clean TimescaleDB"

docker compose up -d "${DB_SERVICE}"

log "Waiting for TimescaleDB"

database_ready=false

for _ in $(seq 1 60); do
  if docker compose exec -T "${DB_SERVICE}" \
      pg_isready \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
      >/dev/null 2>&1; then

    database_ready=true
    break
  fi

  sleep 2
done

[[ "${database_ready}" == "true" ]] \
  || fail "TimescaleDB did not become ready"

# ---------------------------------------------------------------------------
# Verify target versions.
# A logical TimescaleDB restore should use a compatible PostgreSQL and
# TimescaleDB extension version. The restored compose file normally guarantees
# this because the image version is part of the project snapshot.
# ---------------------------------------------------------------------------

BACKUP_POSTGRES_VERSION="$(
  sed -n 's/^postgres_version=//p' \
    "${BACKUP_DIR}/manifest.txt" \
  | head -1
)"

BACKUP_TIMESCALEDB_VERSION="$(
  sed -n 's/^timescaledb_version=//p' \
    "${BACKUP_DIR}/manifest.txt" \
  | head -1
)"

TARGET_POSTGRES_VERSION="$(
  docker compose exec -T "${DB_SERVICE}" \
    psql \
      -U "${DB_USER}" \
      -d "${DB_NAME}" \
      -At \
      -c "SHOW server_version;" \
    | tr -d '\r'
)"

TARGET_TIMESCALEDB_VERSION="$(
  docker compose exec -T "${DB_SERVICE}" \
    psql \
      -U "${DB_USER}" \
      -d "${DB_NAME}" \
      -At \
      -c "
        SELECT default_version
        FROM pg_available_extensions
        WHERE name = 'timescaledb';
      " \
    | tr -d '\r'
)"

if [[ -n "${BACKUP_POSTGRES_VERSION}" ]]; then
  log "Backup PostgreSQL version: ${BACKUP_POSTGRES_VERSION}"
  log "Target PostgreSQL version: ${TARGET_POSTGRES_VERSION}"
fi

if [[ -n "${BACKUP_TIMESCALEDB_VERSION}" ]]; then
  log "Backup TimescaleDB version: ${BACKUP_TIMESCALEDB_VERSION}"
  log "Target TimescaleDB available version: ${TARGET_TIMESCALEDB_VERSION}"
fi

# ---------------------------------------------------------------------------
# Prepare TimescaleDB for logical restore.
# ---------------------------------------------------------------------------

log "Enabling TimescaleDB extension"

docker compose exec -T "${DB_SERVICE}" \
  psql \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    -v ON_ERROR_STOP=1 \
    -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"

log "Putting TimescaleDB into restore mode"

docker compose exec -T "${DB_SERVICE}" \
  psql \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    -v ON_ERROR_STOP=1 \
    -c "SELECT timescaledb_pre_restore();"

RESTORE_MODE_ACTIVE=true

leave_restore_mode() {
  local exit_code=$?

  if [[ "${RESTORE_MODE_ACTIVE:-false}" == "true" ]]; then
    log "Attempting to leave TimescaleDB restore mode"

    docker compose exec -T "${DB_SERVICE}" \
      psql \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        -c "SELECT timescaledb_post_restore();" \
      >/dev/null 2>&1 \
      || true
  fi

  exit "${exit_code}"
}

trap leave_restore_mode EXIT

# ---------------------------------------------------------------------------
# Restore database.
#
# Do not use pg_restore -j for TimescaleDB catalog restores.
# ---------------------------------------------------------------------------

log "Restoring PostgreSQL / TimescaleDB"

docker compose exec -T "${DB_SERVICE}" \
  pg_restore \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --no-owner \
    --no-privileges \
    --exit-on-error \
  < "${BACKUP_DIR}/database.dump"

# ---------------------------------------------------------------------------
# Finalize TimescaleDB restore.
# ---------------------------------------------------------------------------

log "Leaving TimescaleDB restore mode"

docker compose exec -T "${DB_SERVICE}" \
  psql \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    -v ON_ERROR_STOP=1 \
    -c "SELECT timescaledb_post_restore();"

RESTORE_MODE_ACTIVE=false
trap - EXIT

log "Updating PostgreSQL statistics"

docker compose exec -T "${DB_SERVICE}" \
  psql \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    -v ON_ERROR_STOP=1 \
    -c "ANALYZE;"

# ---------------------------------------------------------------------------
# Start and verify complete stack.
# ---------------------------------------------------------------------------

log "Starting complete SensorSphere stack"

docker compose up -d --build

log "Current service state"

docker compose ps

log "Restore completed successfully"

if [[ -d "${PRE_RESTORE_DIR}" ]]; then
  log "Previous installation kept temporarily at:"
  log "  ${PRE_RESTORE_DIR}"
  log "Remove it manually only after validating the restored system."
fi
