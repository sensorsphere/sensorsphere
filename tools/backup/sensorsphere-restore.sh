#!/usr/bin/env bash
set -Eeuo pipefail
RESTORE_VERSION="3"

SOURCE="${BASH_SOURCE[0]}"
while [[ -L "${SOURCE}" ]]; do
  SCRIPT_DIR="$(cd -P "$(dirname "${SOURCE}")" >/dev/null 2>&1 && pwd)"
  SOURCE="$(readlink "${SOURCE}")"
  [[ "${SOURCE}" = /* ]] || SOURCE="${SCRIPT_DIR}/${SOURCE}"
done
SCRIPT_DIR="$(cd -P "$(dirname "${SOURCE}")" >/dev/null 2>&1 && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$(cd "${SCRIPT_DIR}/../.." >/dev/null 2>&1 && pwd)}"

CALLER_DB_SERVICE="${DB_SERVICE-}"
CALLER_DB_USER="${DB_USER-}"
CALLER_DB_NAME="${DB_NAME-}"
CALLER_PROJECT_BACKUP_IMAGE="${PROJECT_BACKUP_IMAGE-}"
CALLER_DATA_ROOT="${DATA_ROOT-}"
CALLER_COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME-}"

TARGET_ENV_COPY=""

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

usage() {
  cat <<EOF
Usage:
  sensorsphere-restore <backup-directory>

Optional environment overrides:
  PROJECT_DIR=/path/to/sensorsphere
  COMPOSE_PROJECT_NAME=sensorsphere
  DATA_ROOT=./data
  DB_SERVICE=timescaledb
  DB_USER=sensorsphere
  DB_NAME=sensorsphere
EOF
}

read_env_value() {
  local variable="$1"
  local env_file="$2"
  [[ -f "${env_file}" ]] || return 0
  (
    set -a
    # shellcheck disable=SC1090
    source "${env_file}"
    printf '%s' "${!variable-}"
  )
}

load_project_configuration() {
  ENV_FILE="${PROJECT_DIR}/.env"

  local env_db_service env_db_user env_db_name
  local env_postgres_user env_postgres_db
  local env_project_backup_image env_data_root env_compose_project_name

  env_db_service="$(read_env_value DB_SERVICE "${ENV_FILE}")"
  env_db_user="$(read_env_value DB_USER "${ENV_FILE}")"
  env_db_name="$(read_env_value DB_NAME "${ENV_FILE}")"
  env_postgres_user="$(read_env_value POSTGRES_USER "${ENV_FILE}")"
  env_postgres_db="$(read_env_value POSTGRES_DB "${ENV_FILE}")"
  env_project_backup_image="$(read_env_value PROJECT_BACKUP_IMAGE "${ENV_FILE}")"
  env_data_root="$(read_env_value DATA_ROOT "${ENV_FILE}")"
  env_compose_project_name="$(read_env_value COMPOSE_PROJECT_NAME "${ENV_FILE}")"

  DB_SERVICE="${CALLER_DB_SERVICE:-${env_db_service:-timescaledb}}"
  DB_USER="${CALLER_DB_USER:-${env_db_user:-${env_postgres_user:-sensorsphere}}}"
  DB_NAME="${CALLER_DB_NAME:-${env_db_name:-${env_postgres_db:-sensorsphere}}}"
  PROJECT_BACKUP_IMAGE="${CALLER_PROJECT_BACKUP_IMAGE:-${env_project_backup_image:-eclipse-mosquitto:2}}"
  DATA_ROOT_RAW="${CALLER_DATA_ROOT:-${env_data_root:-./data}}"
  COMPOSE_PROJECT_NAME="${CALLER_COMPOSE_PROJECT_NAME:-${env_compose_project_name:-sensorsphere}}"

  export COMPOSE_PROJECT_NAME

  if [[ "${DATA_ROOT_RAW}" = /* ]]; then
    DATA_ROOT_ABS="$(readlink -m "${DATA_ROOT_RAW}")"
  else
    DATA_ROOT_ABS="$(readlink -m "${PROJECT_DIR}/${DATA_ROOT_RAW}")"
  fi

  [[ "${DATA_ROOT_ABS}" != "${PROJECT_DIR}" ]] || fail "DATA_ROOT cannot be the project root itself"
}

manifest_value() {
  local key="$1"
  sed -n "s/^${key}=//p" "${BACKUP_DIR}/manifest.txt" | head -1
}

cleanup_target_env_copy() {
  [[ -n "${TARGET_ENV_COPY}" && -f "${TARGET_ENV_COPY}" ]] && rm -f "${TARGET_ENV_COPY}"
}

trap cleanup_target_env_copy EXIT
load_project_configuration

BACKUP_DIR="${1:-}"
[[ -n "${BACKUP_DIR}" ]] || { usage; exit 1; }

for command_name in docker tar sha256sum readlink; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "${command_name} is not installed"
done

BACKUP_DIR="$(readlink -m "${BACKUP_DIR}")"
[[ -d "${BACKUP_DIR}" ]] || fail "Backup directory not found: ${BACKUP_DIR}"

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
  [[ -f "${BACKUP_DIR}/${file}" ]] || fail "Missing backup file: ${file}"
done

log "Checking backup integrity"
(cd "${BACKUP_DIR}" && sha256sum -c SHA256SUMS) || fail "Checksum verification failed"

for archive in project.tar.gz app-data.tar.gz mosquitto.tar.gz; do
  tar tzf "${BACKUP_DIR}/${archive}" >/dev/null || fail "${archive} validation failed"
done

BACKUP_FORMAT_VERSION="$(manifest_value backup_version)"
BACKUP_PROJECT_NAME="$(manifest_value project_name)"
[[ -n "${BACKUP_PROJECT_NAME}" ]] || BACKUP_PROJECT_NAME="$(basename "${PROJECT_DIR}")"

echo
echo "WARNING"
echo
echo "Backup: ${BACKUP_DIR}"
echo "Target project: ${PROJECT_DIR}"
echo "Target Compose project: ${COMPOSE_PROJECT_NAME}"
echo "Target DATA_ROOT: ${DATA_ROOT_ABS}"
echo
echo "Current application data, Mosquitto data, project files and"
echo "PostgreSQL / TimescaleDB data will be replaced."
echo "The current project directory will first be renamed as a safety copy."
echo

read -r -p 'Type RESTORE to continue: ' confirmation
[[ "${confirmation}" == "RESTORE" ]] || fail "Restore cancelled"

PROJECT_PARENT="$(dirname "${PROJECT_DIR}")"
PROJECT_NAME="$(basename "${PROJECT_DIR}")"
PRE_RESTORE_DIR="${PROJECT_DIR}.pre-restore-$(date +%Y%m%d_%H%M%S)"

if [[ -f "${PROJECT_DIR}/.env" ]]; then
  TARGET_ENV_COPY="$(mktemp)"
  cp -a "${PROJECT_DIR}/.env" "${TARGET_ENV_COPY}"
  log "Preserving target .env configuration"
fi

if [[ -f "${PROJECT_DIR}/docker-compose.yml" ]]; then
  log "Stopping current SensorSphere stack"
  (cd "${PROJECT_DIR}" && docker compose down)
fi

if [[ -d "${PROJECT_DIR}" ]]; then
  log "Moving current project to ${PRE_RESTORE_DIR}"
  mv "${PROJECT_DIR}" "${PRE_RESTORE_DIR}"
fi

mkdir -p "${PROJECT_PARENT}"

log "Restoring SensorSphere project"
tar xzf "${BACKUP_DIR}/project.tar.gz" -C "${PROJECT_PARENT}"

RESTORED_PROJECT_DIR="${PROJECT_PARENT}/${BACKUP_PROJECT_NAME}"
[[ -d "${RESTORED_PROJECT_DIR}" ]] || fail "Project archive did not recreate ${RESTORED_PROJECT_DIR}"

if [[ "${RESTORED_PROJECT_DIR}" != "${PROJECT_DIR}" ]]; then
  mv "${RESTORED_PROJECT_DIR}" "${PROJECT_DIR}"
fi

if [[ -n "${TARGET_ENV_COPY}" && -f "${TARGET_ENV_COPY}" ]]; then
  cp -a "${TARGET_ENV_COPY}" "${PROJECT_DIR}/.env"
fi

load_project_configuration
cd "${PROJECT_DIR}"

log "Restored environment: $([[ -f "${ENV_FILE}" ]] && printf '%s' "${ENV_FILE}" || printf 'none')"
log "Compose project: ${COMPOSE_PROJECT_NAME}"
log "DATA_ROOT: ${DATA_ROOT_ABS}"
log "Database service: ${DB_SERVICE}"
log "Database: ${DB_NAME}"
log "Database user: ${DB_USER}"

docker compose config --quiet || fail "Restored Docker Compose configuration is invalid"

log "Restoring application persistent data"
rm -rf "${DATA_ROOT_ABS}/app"
mkdir -p "${DATA_ROOT_ABS}"

if [[ "${BACKUP_FORMAT_VERSION:-0}" =~ ^[0-9]+$ ]] && (( BACKUP_FORMAT_VERSION >= 7 )); then
  tar xzf "${BACKUP_DIR}/app-data.tar.gz" -C "${DATA_ROOT_ABS}"
else
  LEGACY_APP_TMP="$(mktemp -d)"
  tar xzf "${BACKUP_DIR}/app-data.tar.gz" -C "${LEGACY_APP_TMP}"
  mkdir -p "${DATA_ROOT_ABS}/app"
  [[ -d "${LEGACY_APP_TMP}/data/app" ]] && cp -a "${LEGACY_APP_TMP}/data/app/." "${DATA_ROOT_ABS}/app/"
  rm -rf "${LEGACY_APP_TMP}"
fi

log "Restoring Mosquitto persistent data"
mkdir -p "${DATA_ROOT_ABS}/mosquitto"

docker image inspect "${PROJECT_BACKUP_IMAGE}" >/dev/null 2>&1 \
  || fail "Required helper image is not available locally: ${PROJECT_BACKUP_IMAGE}"

if [[ "${BACKUP_FORMAT_VERSION:-0}" =~ ^[0-9]+$ ]] && (( BACKUP_FORMAT_VERSION >= 7 )); then
  docker run \
    --rm \
    --user 0:0 \
    --entrypoint sh \
    -v "${DATA_ROOT_ABS}/mosquitto:/target" \
    -v "${BACKUP_DIR}:/backup:ro" \
    "${PROJECT_BACKUP_IMAGE}" \
    -c '
      set -e
      rm -rf /target/data /target/log
      mkdir -p /target
      tar xzf /backup/mosquitto.tar.gz -C /target
    '
else
  docker run \
    --rm \
    --user 0:0 \
    --entrypoint sh \
    -v "${DATA_ROOT_ABS}/mosquitto:/target" \
    -v "${BACKUP_DIR}:/backup:ro" \
    "${PROJECT_BACKUP_IMAGE}" \
    -c '
      set -e
      work="$(mktemp -d)"
      tar xzf /backup/mosquitto.tar.gz -C "${work}"
      rm -rf /target/data
      mkdir -p /target/data /target/log
      [ -d "${work}/data" ] && cp -a "${work}/data/." /target/data/
      rm -rf "${work}"
    '
fi

log "Preparing clean TimescaleDB storage"
mkdir -p "${DATA_ROOT_ABS}"

docker image inspect "${PROJECT_BACKUP_IMAGE}" \
  >/dev/null 2>&1 \
  || fail "Required helper image is not available locally: ${PROJECT_BACKUP_IMAGE}"

docker run \
  --rm \
  --user 0:0 \
  --entrypoint sh \
  -v "${DATA_ROOT_ABS}:/target" \
  "${PROJECT_BACKUP_IMAGE}" \
  -c '
    set -e
    rm -rf /target/timescaledb
  '

log "Starting clean TimescaleDB"
docker compose up -d "${DB_SERVICE}"

log "Waiting for TimescaleDB"
database_ready=false

for _ in $(seq 1 60); do
  if docker compose exec -T "${DB_SERVICE}" \
      pg_isready -U "${DB_USER}" -d "${DB_NAME}" >/dev/null 2>&1; then
    database_ready=true
    break
  fi
  sleep 2
done

[[ "${database_ready}" == "true" ]] || fail "TimescaleDB did not become ready"

log "Recreating empty target database before logical restore"

docker compose exec -T "${DB_SERVICE}" \
  psql \
    -U "${DB_USER}" \
    -d postgres \
    -v ON_ERROR_STOP=1 \
    -c "
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = '${DB_NAME}'
        AND pid <> pg_backend_pid();
    "

docker compose exec -T "${DB_SERVICE}" \
  dropdb \
    -U "${DB_USER}" \
    --if-exists \
    "${DB_NAME}"

docker compose exec -T "${DB_SERVICE}" \
  createdb \
    -U "${DB_USER}" \
    -O "${DB_USER}" \
    "${DB_NAME}"

log "Empty target database created"

BACKUP_POSTGRES_VERSION="$(manifest_value postgres_version)"
BACKUP_TIMESCALEDB_VERSION="$(manifest_value timescaledb_version)"

TARGET_POSTGRES_VERSION="$(
  docker compose exec -T "${DB_SERVICE}" \
    psql -U "${DB_USER}" -d "${DB_NAME}" -At -c "SHOW server_version;" \
  | tr -d '\r'
)"

TARGET_TIMESCALEDB_VERSION="$(
  docker compose exec -T "${DB_SERVICE}" \
    psql -U "${DB_USER}" -d "${DB_NAME}" -At -c "
      SELECT default_version
      FROM pg_available_extensions
      WHERE name = 'timescaledb';
    " \
  | tr -d '\r'
)"

[[ -n "${BACKUP_POSTGRES_VERSION}" ]] && {
  log "Backup PostgreSQL version: ${BACKUP_POSTGRES_VERSION}"
  log "Target PostgreSQL version: ${TARGET_POSTGRES_VERSION}"
}

[[ -n "${BACKUP_TIMESCALEDB_VERSION}" ]] && {
  log "Backup TimescaleDB version: ${BACKUP_TIMESCALEDB_VERSION}"
  log "Target TimescaleDB available version: ${TARGET_TIMESCALEDB_VERSION}"
}

log "Enabling TimescaleDB extension"
docker compose exec -T "${DB_SERVICE}" \
  psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 \
  -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"

log "Putting TimescaleDB into restore mode"
docker compose exec -T "${DB_SERVICE}" \
  psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 \
  -c "SELECT timescaledb_pre_restore();"

RESTORE_MODE_ACTIVE=true

leave_restore_mode() {
  local exit_code=$?
  if [[ "${RESTORE_MODE_ACTIVE:-false}" == "true" ]]; then
    log "Attempting to leave TimescaleDB restore mode"
    docker compose exec -T "${DB_SERVICE}" \
      psql -U "${DB_USER}" -d "${DB_NAME}" \
      -c "SELECT timescaledb_post_restore();" \
      >/dev/null 2>&1 || true
  fi
  cleanup_target_env_copy
  exit "${exit_code}"
}
trap leave_restore_mode EXIT

log "Restoring PostgreSQL / TimescaleDB"
docker compose exec -T "${DB_SERVICE}" \
  pg_restore \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    --no-owner \
    --no-privileges \
    --exit-on-error \
  < "${BACKUP_DIR}/database.dump"

log "Leaving TimescaleDB restore mode"
docker compose exec -T "${DB_SERVICE}" \
  psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 \
  -c "SELECT timescaledb_post_restore();"

RESTORE_MODE_ACTIVE=false
trap cleanup_target_env_copy EXIT

log "Updating PostgreSQL statistics"
docker compose exec -T "${DB_SERVICE}" \
  psql -U "${DB_USER}" -d "${DB_NAME}" -v ON_ERROR_STOP=1 \
  -c "ANALYZE;"

log "Starting complete SensorSphere stack"
docker compose up -d --build

log "Current service state"
docker compose ps

cleanup_target_env_copy
TARGET_ENV_COPY=""
trap - EXIT

log "Restore completed successfully"

if [[ -d "${PRE_RESTORE_DIR}" ]]; then
  log "Previous installation kept temporarily at:"
  log "  ${PRE_RESTORE_DIR}"
  log "Remove it manually only after validating the restored system."
fi
