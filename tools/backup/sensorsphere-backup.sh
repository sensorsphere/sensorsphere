#!/usr/bin/env bash
set -Eeuo pipefail
BACKUP_VERSION="7"

SOURCE="${BASH_SOURCE[0]}"
while [[ -L "${SOURCE}" ]]; do
  SCRIPT_DIR="$(cd -P "$(dirname "${SOURCE}")" >/dev/null 2>&1 && pwd)"
  SOURCE="$(readlink "${SOURCE}")"
  [[ "${SOURCE}" = /* ]] || SOURCE="${SCRIPT_DIR}/${SOURCE}"
done
SCRIPT_DIR="$(cd -P "$(dirname "${SOURCE}")" >/dev/null 2>&1 && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$(cd "${SCRIPT_DIR}/../.." >/dev/null 2>&1 && pwd)}"
ENV_FILE="${PROJECT_DIR}/.env"

read_env_value() {
  local variable="$1"
  [[ -f "${ENV_FILE}" ]] || return 0
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
CALLER_DATA_ROOT="${DATA_ROOT-}"
CALLER_COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME-}"

ENV_DB_SERVICE="$(read_env_value DB_SERVICE)"
ENV_DB_USER="$(read_env_value DB_USER)"
ENV_DB_NAME="$(read_env_value DB_NAME)"
ENV_POSTGRES_USER="$(read_env_value POSTGRES_USER)"
ENV_POSTGRES_DB="$(read_env_value POSTGRES_DB)"
ENV_BACKUP_ROOT="$(read_env_value BACKUP_ROOT)"
ENV_PROJECT_BACKUP_IMAGE="$(read_env_value PROJECT_BACKUP_IMAGE)"
ENV_DATA_ROOT="$(read_env_value DATA_ROOT)"
ENV_COMPOSE_PROJECT_NAME="$(read_env_value COMPOSE_PROJECT_NAME)"

DB_SERVICE="${CALLER_DB_SERVICE:-${ENV_DB_SERVICE:-timescaledb}}"
DB_USER="${CALLER_DB_USER:-${ENV_DB_USER:-${ENV_POSTGRES_USER:-sensorsphere}}}"
DB_NAME="${CALLER_DB_NAME:-${ENV_DB_NAME:-${ENV_POSTGRES_DB:-sensorsphere}}}"
COMPOSE_PROJECT_NAME="${CALLER_COMPOSE_PROJECT_NAME:-${ENV_COMPOSE_PROJECT_NAME:-sensorsphere}}"
PROJECT_BACKUP_IMAGE="${CALLER_PROJECT_BACKUP_IMAGE:-${ENV_PROJECT_BACKUP_IMAGE:-eclipse-mosquitto:2}}"
DATA_ROOT_RAW="${CALLER_DATA_ROOT:-${ENV_DATA_ROOT:-./data}}"
BACKUP_ROOT="${CALLER_BACKUP_ROOT:-${ENV_BACKUP_ROOT:-/var/backups/${COMPOSE_PROJECT_NAME}}}"
export COMPOSE_PROJECT_NAME

if [[ "${DATA_ROOT_RAW}" = /* ]]; then
  DATA_ROOT_ABS="$(readlink -m "${DATA_ROOT_RAW}")"
else
  DATA_ROOT_ABS="$(readlink -m "${PROJECT_DIR}/${DATA_ROOT_RAW}")"
fi

[[ "${DATA_ROOT_ABS}" != "${PROJECT_DIR}" ]] || {
  echo "ERROR: DATA_ROOT cannot be the project root itself" >&2
  exit 1
}

DATA_ROOT_REL=""
case "${DATA_ROOT_ABS}" in
  "${PROJECT_DIR}"/*) DATA_ROOT_REL="${DATA_ROOT_ABS#${PROJECT_DIR}/}" ;;
esac

TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

on_exit() {
  local exit_code=$?
  if (( exit_code != 0 )); then
    log "Backup failed."
    [[ -d "${BACKUP_DIR}" ]] && log "Incomplete backup kept for diagnostics: ${BACKUP_DIR}"
  fi
  exit "${exit_code}"
}
trap on_exit EXIT

for command_name in docker tar sha256sum grep git readlink; do
  command -v "${command_name}" >/dev/null 2>&1 || fail "${command_name} is not installed"
done

[[ -d "${PROJECT_DIR}" ]] || fail "Project directory not found: ${PROJECT_DIR}"
[[ -f "${PROJECT_DIR}/docker-compose.yml" ]] || fail "docker-compose.yml not found in ${PROJECT_DIR}"

mkdir -p "${BACKUP_ROOT}" 2>/dev/null || fail "Unable to create backup root: ${BACKUP_ROOT}"
mkdir -p "${BACKUP_DIR}"

cd "${PROJECT_DIR}"

log "Starting SensorSphere backup"
log "Backup format version: ${BACKUP_VERSION}"
log "Compose project: ${COMPOSE_PROJECT_NAME}"
log "Project: ${PROJECT_DIR}"
log "DATA_ROOT: ${DATA_ROOT_ABS}"
log "Environment: $([[ -f "${ENV_FILE}" ]] && printf '%s' "${ENV_FILE}" || printf 'none')"
log "Database service: ${DB_SERVICE}"
log "Database: ${DB_NAME}"
log "Database user: ${DB_USER}"
log "Destination: ${BACKUP_DIR}"

docker compose config --quiet || fail "Docker Compose configuration is invalid"

docker compose exec -T "${DB_SERVICE}" \
  pg_isready -U "${DB_USER}" -d "${DB_NAME}" >/dev/null \
  || fail "Database is not ready"

log "Backing up PostgreSQL / TimescaleDB"
docker compose exec -T "${DB_SERVICE}" \
  pg_dump -U "${DB_USER}" -d "${DB_NAME}" -Fc \
  > "${BACKUP_DIR}/database.dump"

[[ -s "${BACKUP_DIR}/database.dump" ]] || fail "Database dump is empty"

log "Validating PostgreSQL dump catalog"
docker compose exec -T "${DB_SERVICE}" \
  pg_restore -l \
  < "${BACKUP_DIR}/database.dump" \
  >/dev/null \
  || fail "PostgreSQL dump catalog validation failed"

log "Backing up PostgreSQL globals"
docker compose exec -T "${DB_SERVICE}" \
  pg_dumpall -U "${DB_USER}" --globals-only \
  > "${BACKUP_DIR}/database-globals.sql"

POSTGRES_VERSION="$(
  docker compose exec -T "${DB_SERVICE}" \
    psql -U "${DB_USER}" -d "${DB_NAME}" -At -c "SHOW server_version;" \
  | tr -d '\r'
)"

TIMESCALEDB_VERSION="$(
  docker compose exec -T "${DB_SERVICE}" \
    psql -U "${DB_USER}" -d "${DB_NAME}" -At -c "
      SELECT extversion
      FROM pg_extension
      WHERE extname = 'timescaledb';
    " \
  | tr -d '\r'
)"

log "Backing up application data"
if [[ -d "${DATA_ROOT_ABS}/app" ]]; then
  tar czf "${BACKUP_DIR}/app-data.tar.gz" -C "${DATA_ROOT_ABS}" app
else
  log "No ${DATA_ROOT_ABS}/app directory found; creating empty archive"
  tar czf "${BACKUP_DIR}/app-data.tar.gz" --files-from /dev/null
fi
tar tzf "${BACKUP_DIR}/app-data.tar.gz" >/dev/null || fail "Application data archive validation failed"

log "Backing up Mosquitto persistent data"
docker compose exec -T mosquitto \
  tar czf - -C /mosquitto data log \
  > "${BACKUP_DIR}/mosquitto.tar.gz"

[[ -s "${BACKUP_DIR}/mosquitto.tar.gz" ]] || fail "Mosquitto backup is empty"
tar tzf "${BACKUP_DIR}/mosquitto.tar.gz" >/dev/null || fail "Mosquitto archive validation failed"

log "Backing up SensorSphere project"

PROJECT_PARENT="$(dirname "${PROJECT_DIR}")"
PROJECT_NAME="$(basename "${PROJECT_DIR}")"

docker image inspect "${PROJECT_BACKUP_IMAGE}" >/dev/null 2>&1 \
  || fail "Required helper image is not available locally: ${PROJECT_BACKUP_IMAGE}"

PROJECT_DATA_EXCLUDE=""
if [[ -n "${DATA_ROOT_REL}" ]]; then
  PROJECT_DATA_EXCLUDE="${PROJECT_NAME}/${DATA_ROOT_REL}"
  log "Excluding project DATA_ROOT from project archive: ${PROJECT_DATA_EXCLUDE}"
else
  log "DATA_ROOT is outside the project tree; no project exclusion is required"
fi

docker run \
  --rm \
  --user 0:0 \
  --entrypoint sh \
  -e PROJECT_NAME="${PROJECT_NAME}" \
  -e PROJECT_DATA_EXCLUDE="${PROJECT_DATA_EXCLUDE}" \
  -v "${PROJECT_PARENT}:/source:ro" \
  "${PROJECT_BACKUP_IMAGE}" \
  -c '
    set -e
    cd /source

    set -- \
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
      --exclude="${PROJECT_NAME}/tmp/*"

    if [ -n "${PROJECT_DATA_EXCLUDE}" ]; then
      set -- "$@" \
        --exclude="${PROJECT_DATA_EXCLUDE}" \
        --exclude="${PROJECT_DATA_EXCLUDE}/*"
    fi

    tar czf - "$@" "${PROJECT_NAME}"
  ' \
  > "${BACKUP_DIR}/project.tar.gz"

[[ -s "${BACKUP_DIR}/project.tar.gz" ]] || fail "Project archive is empty"
tar tzf "${BACKUP_DIR}/project.tar.gz" >/dev/null || fail "Project archive validation failed"

log "Validating project exclusions"
PROJECT_CONTENTS="$(tar tzf "${BACKUP_DIR}/project.tar.gz")"

grep -Eq '(^|/)\.git(/|$)' <<< "${PROJECT_CONTENTS}" && fail "A .git directory was found in project.tar.gz"
grep -Eq '(^|/)\.pnpm-store(/|$)' <<< "${PROJECT_CONTENTS}" && fail "A .pnpm-store directory was found in project.tar.gz"
grep -Eq '(^|/)node_modules(/|$)' <<< "${PROJECT_CONTENTS}" && fail "A node_modules directory was found in project.tar.gz"
grep -Eq '(^|/)esphome/\.esphome(/|$)' <<< "${PROJECT_CONTENTS}" && fail "esphome/.esphome was found in project.tar.gz"
grep -Eq '(^|/)dev/bin(/|$)' <<< "${PROJECT_CONTENTS}" && fail "dev/bin was found in project.tar.gz"
grep -Eq '(^|/)\.backup(/|$)' <<< "${PROJECT_CONTENTS}" && fail "A .backup directory was found in project.tar.gz"
grep -Eq '(^|/)tmp(/|$)' <<< "${PROJECT_CONTENTS}" && fail "tmp was found in project.tar.gz"

if [[ -n "${DATA_ROOT_REL}" ]]; then
  DATA_ROOT_ARCHIVE_PATH="${PROJECT_NAME}/${DATA_ROOT_REL}"
  if grep -Fqx "${DATA_ROOT_ARCHIVE_PATH}" <<< "${PROJECT_CONTENTS}" ||
     grep -Fq "${DATA_ROOT_ARCHIVE_PATH}/" <<< "${PROJECT_CONTENTS}"; then
    fail "DATA_ROOT was found in project.tar.gz: ${DATA_ROOT_REL}"
  fi
fi

log "Project exclusions validated"

log "Creating manifest"
{
  echo "backup_version=${BACKUP_VERSION}"
  echo "timestamp=${TIMESTAMP}"
  echo "hostname=$(hostname)"
  echo "compose_project_name=${COMPOSE_PROJECT_NAME}"
  echo "project_dir=${PROJECT_DIR}"
  echo "project_name=${PROJECT_NAME}"
  echo "data_root=${DATA_ROOT_RAW}"
  echo "data_root_absolute=${DATA_ROOT_ABS}"
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

trap - EXIT

BACKUP_SIZE="$(du -sh "${BACKUP_DIR}" | awk '{print $1}')"
PROJECT_ARCHIVE_SIZE="$(du -h "${BACKUP_DIR}/project.tar.gz" | awk '{print $1}')"
DATABASE_ARCHIVE_SIZE="$(du -h "${BACKUP_DIR}/database.dump" | awk '{print $1}')"

log "Backup completed successfully"
log "Backup directory: ${BACKUP_DIR}"
log "Total backup size: ${BACKUP_SIZE}"
log "Project archive size: ${PROJECT_ARCHIVE_SIZE}"
log "Database dump size: ${DATABASE_ARCHIVE_SIZE}"
