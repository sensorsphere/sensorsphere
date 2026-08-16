#!/usr/bin/env bash

set -Eeuo pipefail

BACKUP_VERSION="6"

# ===========================================================================
# Resolve SensorSphere project directory
# ===========================================================================

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

ENV_FILE="${PROJECT_DIR}/.env"


# ===========================================================================
# Read configuration
#
# Priority:
#
#   1. Environment variable explicitly supplied by caller
#   2. SensorSphere .env
#   3. Default value
# ===========================================================================

read_env_value() {
  local variable="$1"

  if [[ ! -f "${ENV_FILE}" ]]; then
    return 0
  fi

  (
    set -a

    # shellcheck disable=SC1090
    source "${ENV_FILE}"

    printf '%s' "${!variable-}"
  )
}


CALLER_DB_SERVICE="${DB_SERVICE-}"
CALLER_DB_USER="${DB_USER-}"
CALLER_DB_NAME="${DB_NAME-}"
CALLER_BACKUP_ROOT="${BACKUP_ROOT-}"
CALLER_PROJECT_BACKUP_IMAGE="${PROJECT_BACKUP_IMAGE-}"


ENV_DB_SERVICE="$(read_env_value DB_SERVICE)"
ENV_DB_USER="$(read_env_value DB_USER)"
ENV_DB_NAME="$(read_env_value DB_NAME)"

ENV_POSTGRES_USER="$(read_env_value POSTGRES_USER)"
ENV_POSTGRES_DB="$(read_env_value POSTGRES_DB)"

ENV_BACKUP_ROOT="$(read_env_value BACKUP_ROOT)"
ENV_PROJECT_BACKUP_IMAGE="$(read_env_value PROJECT_BACKUP_IMAGE)"


DB_SERVICE="${CALLER_DB_SERVICE:-${ENV_DB_SERVICE:-timescaledb}}"

DB_USER="${CALLER_DB_USER:-${ENV_DB_USER:-${ENV_POSTGRES_USER:-iot_app}}}"

DB_NAME="${CALLER_DB_NAME:-${ENV_DB_NAME:-${ENV_POSTGRES_DB:-iot}}}"

BACKUP_ROOT="${CALLER_BACKUP_ROOT:-${ENV_BACKUP_ROOT:-/var/backups/sensorsphere}}"

PROJECT_BACKUP_IMAGE="${CALLER_PROJECT_BACKUP_IMAGE:-${ENV_PROJECT_BACKUP_IMAGE:-eclipse-mosquitto:2}}"


TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"


# ===========================================================================
# Helpers
# ===========================================================================

log() {
  printf '[%s] %s\n' \
    "$(date '+%Y-%m-%d %H:%M:%S')" \
    "$*"
}


fail() {
  log "ERROR: $*"
  exit 1
}


on_exit() {
  local exit_code=$?

  if (( exit_code != 0 )); then
    log "Backup failed."

    if [[ -d "${BACKUP_DIR}" ]]; then
      log "Incomplete backup kept for diagnostics: ${BACKUP_DIR}"
    fi
  fi

  exit "${exit_code}"
}


trap on_exit EXIT


# ===========================================================================
# Preconditions
# ===========================================================================

for command_name in docker tar sha256sum grep git; do
  command -v "${command_name}" >/dev/null 2>&1 \
    || fail "${command_name} is not installed"
done


[[ -d "${PROJECT_DIR}" ]] \
  || fail "Project directory not found: ${PROJECT_DIR}"


[[ -f "${PROJECT_DIR}/docker-compose.yml" ]] \
  || fail "docker-compose.yml not found in ${PROJECT_DIR}"


mkdir -p "${BACKUP_ROOT}" 2>/dev/null \
  || fail "Unable to create backup root: ${BACKUP_ROOT}"


mkdir -p "${BACKUP_DIR}"


cd "${PROJECT_DIR}"


log "Starting SensorSphere backup"
log "Backup format version: ${BACKUP_VERSION}"
log "Project: ${PROJECT_DIR}"

if [[ -f "${ENV_FILE}" ]]; then
  log "Environment: ${ENV_FILE}"
else
  log "Environment: none"
fi

log "Database service: ${DB_SERVICE}"
log "Database: ${DB_NAME}"
log "Database user: ${DB_USER}"
log "Destination: ${BACKUP_DIR}"


docker compose config --quiet \
  || fail "Docker Compose configuration is invalid"


docker compose exec -T "${DB_SERVICE}" \
  pg_isready \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
  >/dev/null \
  || fail "Database is not ready"


# ===========================================================================
# PostgreSQL / TimescaleDB
# ===========================================================================

log "Backing up PostgreSQL / TimescaleDB"


docker compose exec -T "${DB_SERVICE}" \
  pg_dump \
    -U "${DB_USER}" \
    -d "${DB_NAME}" \
    -Fc \
  > "${BACKUP_DIR}/database.dump"


[[ -s "${BACKUP_DIR}/database.dump" ]] \
  || fail "Database dump is empty"


log "Validating PostgreSQL dump catalog"


docker compose exec -T "${DB_SERVICE}" \
  pg_restore -l \
  < "${BACKUP_DIR}/database.dump" \
  >/dev/null \
  || fail "PostgreSQL dump catalog validation failed"


log "Backing up PostgreSQL globals"


docker compose exec -T "${DB_SERVICE}" \
  pg_dumpall \
    -U "${DB_USER}" \
    --globals-only \
  > "${BACKUP_DIR}/database-globals.sql"


POSTGRES_VERSION="$(
  docker compose exec -T "${DB_SERVICE}" \
    psql \
      -U "${DB_USER}" \
      -d "${DB_NAME}" \
      -At \
      -c "SHOW server_version;" \
    | tr -d '\r'
)"


TIMESCALEDB_VERSION="$(
  docker compose exec -T "${DB_SERVICE}" \
    psql \
      -U "${DB_USER}" \
      -d "${DB_NAME}" \
      -At \
      -c "
        SELECT extversion
        FROM pg_extension
        WHERE extname = 'timescaledb';
      " \
    | tr -d '\r'
)"


# ===========================================================================
# Application persistent data
# ===========================================================================

log "Backing up application data"


if [[ -d "${PROJECT_DIR}/data/app" ]]; then

  tar czf \
    "${BACKUP_DIR}/app-data.tar.gz" \
    -C "${PROJECT_DIR}" \
    data/app

else

  log "No data/app directory found; creating empty archive"

  tar czf \
    "${BACKUP_DIR}/app-data.tar.gz" \
    --files-from /dev/null

fi


tar tzf "${BACKUP_DIR}/app-data.tar.gz" \
  >/dev/null \
  || fail "Application data archive validation failed"


# ===========================================================================
# Mosquitto
#
# Archive Mosquitto from inside its container.
# This avoids host-side permission problems with mosquitto.db.
# ===========================================================================

log "Backing up Mosquitto"


docker compose exec -T mosquitto \
  tar czf - \
    -C /mosquitto \
    config \
    data \
  > "${BACKUP_DIR}/mosquitto.tar.gz"


[[ -s "${BACKUP_DIR}/mosquitto.tar.gz" ]] \
  || fail "Mosquitto backup is empty"


tar tzf "${BACKUP_DIR}/mosquitto.tar.gz" \
  >/dev/null \
  || fail "Mosquitto archive validation failed"


# ===========================================================================
# SensorSphere project
#
# The project is read through a temporary root container so files created by
# containers do not cause host-side permission errors.
#
# Persistent runtime data is backed up separately and therefore excluded.
#
# Rebuildable/generated content is also excluded:
#
#   .git
#   .pnpm-store
#   node_modules
#   esphome/.esphome
#   dev/bin
#   .backup
#   tmp
# ===========================================================================

log "Backing up SensorSphere project"


PROJECT_PARENT="$(dirname "${PROJECT_DIR}")"
PROJECT_NAME="$(basename "${PROJECT_DIR}")"


docker image inspect "${PROJECT_BACKUP_IMAGE}" \
  >/dev/null 2>&1 \
  || fail "Required helper image is not available locally: ${PROJECT_BACKUP_IMAGE}"


docker run \
  --rm \
  --user 0:0 \
  --entrypoint sh \
  -e PROJECT_NAME="${PROJECT_NAME}" \
  -v "${PROJECT_PARENT}:/source:ro" \
  "${PROJECT_BACKUP_IMAGE}" \
  -c '
    set -e

    cd /source

    tar czf - \
      --exclude="${PROJECT_NAME}/infrastructure/timescaledb/data" \
      --exclude="${PROJECT_NAME}/infrastructure/timescaledb/data/*" \
      --exclude="${PROJECT_NAME}/infrastructure/mosquitto/data" \
      --exclude="${PROJECT_NAME}/infrastructure/mosquitto/data/*" \
      --exclude="${PROJECT_NAME}/data/app" \
      --exclude="${PROJECT_NAME}/data/app/*" \
      --exclude="*/.git" \
      --exclude="*/.git/*" \
      --exclude="*/.pnpm-store" \
      --exclude="*/.pnpm-store/*" \
      --exclude="*/node_modules" \
      --exclude="*/node_modules/*" \
      --exclude="${PROJECT_NAME}/esphome/.esphome" \
      --exclude="${PROJECT_NAME}/esphome/.esphome/*" \
      --exclude="${PROJECT_NAME}/dev/bin" \
      --exclude="${PROJECT_NAME}/dev/bin/*" \
      --exclude="*/.backup" \
      --exclude="*/.backup/*" \
      --exclude="${PROJECT_NAME}/tmp" \
      --exclude="${PROJECT_NAME}/tmp/*" \
      "${PROJECT_NAME}"
  ' \
  > "${BACKUP_DIR}/project.tar.gz"


[[ -s "${BACKUP_DIR}/project.tar.gz" ]] \
  || fail "Project archive is empty"


log "Validating SensorSphere project archive"


tar tzf "${BACKUP_DIR}/project.tar.gz" \
  >/dev/null \
  || fail "Project archive validation failed"


# ===========================================================================
# Validate project exclusions
# ===========================================================================

log "Validating project exclusions"


PROJECT_CONTENTS="$(
  tar tzf "${BACKUP_DIR}/project.tar.gz"
)"


if grep -Eq '(^|/)\.git(/|$)' <<< "${PROJECT_CONTENTS}"; then
  fail "A .git directory was found in project.tar.gz"
fi


if grep -Eq '(^|/)\.pnpm-store(/|$)' <<< "${PROJECT_CONTENTS}"; then
  fail "A .pnpm-store directory was found in project.tar.gz"
fi


if grep -Eq '(^|/)node_modules(/|$)' <<< "${PROJECT_CONTENTS}"; then
  fail "A node_modules directory was found in project.tar.gz"
fi


if grep -Eq '(^|/)esphome/\.esphome(/|$)' <<< "${PROJECT_CONTENTS}"; then
  fail "esphome/.esphome was found in project.tar.gz"
fi


if grep -Eq '(^|/)dev/bin(/|$)' <<< "${PROJECT_CONTENTS}"; then
  fail "dev/bin was found in project.tar.gz"
fi


if grep -Eq '(^|/)\.backup(/|$)' <<< "${PROJECT_CONTENTS}"; then
  fail "A .backup directory was found in project.tar.gz"
fi


if grep -Eq '(^|/)tmp(/|$)' <<< "${PROJECT_CONTENTS}"; then
  fail "tmp was found in project.tar.gz"
fi


if grep -Eq '/infrastructure/timescaledb/data(/|$)' <<< "${PROJECT_CONTENTS}"; then
  fail "TimescaleDB runtime data was found in project.tar.gz"
fi


if grep -Eq '/infrastructure/mosquitto/data(/|$)' <<< "${PROJECT_CONTENTS}"; then
  fail "Mosquitto runtime data was found in project.tar.gz"
fi


if grep -Eq '/data/app(/|$)' <<< "${PROJECT_CONTENTS}"; then
  fail "Application runtime data was found in project.tar.gz"
fi


log "Project exclusions validated"


# ===========================================================================
# Manifest
# ===========================================================================

log "Creating manifest"


{
  echo "backup_version=${BACKUP_VERSION}"
  echo "timestamp=${TIMESTAMP}"
  echo "hostname=$(hostname)"
  echo "project_dir=${PROJECT_DIR}"

  echo "db_service=${DB_SERVICE}"
  echo "db_name=${DB_NAME}"
  echo "db_user=${DB_USER}"

  echo "postgres_version=${POSTGRES_VERSION}"
  echo "timescaledb_version=${TIMESCALEDB_VERSION}"

  echo "git_commit=$(git rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "git_branch=$(git branch --show-current 2>/dev/null || echo unknown)"

  echo

  echo "[git_status]"
  git status --short 2>/dev/null || true

  echo

  echo "[docker_compose_images]"
  docker compose images 2>/dev/null || true

} > "${BACKUP_DIR}/manifest.txt"


# ===========================================================================
# Checksums
# ===========================================================================

log "Generating checksums"


(
  cd "${BACKUP_DIR}"

  sha256sum \
    database.dump \
    database-globals.sql \
    app-data.tar.gz \
    mosquitto.tar.gz \
    project.tar.gz \
    manifest.txt \
    > SHA256SUMS
)


log "Verifying checksums"


(
  cd "${BACKUP_DIR}"

  sha256sum -c SHA256SUMS
)


# ===========================================================================
# Summary
# ===========================================================================

trap - EXIT


BACKUP_SIZE="$(
  du -sh "${BACKUP_DIR}" \
    | awk '{print $1}'
)"


PROJECT_ARCHIVE_SIZE="$(
  du -h "${BACKUP_DIR}/project.tar.gz" \
    | awk '{print $1}'
)"


DATABASE_ARCHIVE_SIZE="$(
  du -h "${BACKUP_DIR}/database.dump" \
    | awk '{print $1}'
)"


log "Backup completed successfully"
log "Backup directory: ${BACKUP_DIR}"
log "Total backup size: ${BACKUP_SIZE}"
log "Project archive size: ${PROJECT_ARCHIVE_SIZE}"
log "Database dump size: ${DATABASE_ARCHIVE_SIZE}"
