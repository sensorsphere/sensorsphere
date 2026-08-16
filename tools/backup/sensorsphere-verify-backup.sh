#!/usr/bin/env bash
set -Eeuo pipefail
VERIFY_VERSION="7"

SOURCE="${BASH_SOURCE[0]}"
while [[ -L "${SOURCE}" ]]; do
  SCRIPT_DIR="$(cd -P "$(dirname "${SOURCE}")" >/dev/null 2>&1 && pwd)"
  SOURCE="$(readlink "${SOURCE}")"
  [[ "${SOURCE}" = /* ]] || SOURCE="${SCRIPT_DIR}/${SOURCE}"
done
SCRIPT_DIR="$(cd -P "$(dirname "${SOURCE}")" >/dev/null 2>&1 && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$(cd "${SCRIPT_DIR}/../.." >/dev/null 2>&1 && pwd)}"
ENV_FILE="${PROJECT_DIR}/.env"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
ok() { printf '  [OK] %s\n' "$*"; }
warn() { printf '  [WARN] %s\n' "$*"; }
fail() { printf '  [FAIL] %s\n' "$*"; ERRORS=$((ERRORS + 1)); }

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

manifest_value() {
  local key="$1"
  sed -n "s/^${key}=//p" "${BACKUP_DIR}/manifest.txt" | head -1
}

CALLER_BACKUP_ROOT="${BACKUP_ROOT-}"
CALLER_DB_SERVICE="${DB_SERVICE-}"
CALLER_COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME-}"

ENV_BACKUP_ROOT="$(read_env_value BACKUP_ROOT)"
ENV_DB_SERVICE="$(read_env_value DB_SERVICE)"
ENV_COMPOSE_PROJECT_NAME="$(read_env_value COMPOSE_PROJECT_NAME)"

COMPOSE_PROJECT_NAME="${CALLER_COMPOSE_PROJECT_NAME:-${ENV_COMPOSE_PROJECT_NAME:-sensorsphere}}"
BACKUP_ROOT="${CALLER_BACKUP_ROOT:-${ENV_BACKUP_ROOT:-/var/backups/${COMPOSE_PROJECT_NAME}}}"
DB_SERVICE="${CALLER_DB_SERVICE:-${ENV_DB_SERVICE:-timescaledb}}"
export COMPOSE_PROJECT_NAME
ERRORS=0

[[ $# -le 1 ]] || { echo "Usage: $0 [backup-directory]" >&2; exit 2; }

if [[ $# -eq 1 ]]; then
  BACKUP_DIR="$1"
else
  BACKUP_DIR="$(
    find "${BACKUP_ROOT}" \
      -mindepth 1 -maxdepth 1 -type d -printf '%p\n' 2>/dev/null \
    | sort | tail -1
  )"
fi

[[ -n "${BACKUP_DIR:-}" ]] || { echo "No backup found in ${BACKUP_ROOT}" >&2; exit 1; }
BACKUP_DIR="$(readlink -m "${BACKUP_DIR}")"
[[ -d "${BACKUP_DIR}" ]] || { echo "Backup directory does not exist: ${BACKUP_DIR}" >&2; exit 1; }

log "SensorSphere backup verification"
log "Verifier version: ${VERIFY_VERSION}"
log "Compose project: ${COMPOSE_PROJECT_NAME}"
log "Backup: ${BACKUP_DIR}"

echo
echo "Required files"

REQUIRED_FILES=(
  database.dump
  database-globals.sql
  app-data.tar.gz
  mosquitto.tar.gz
  project.tar.gz
  manifest.txt
  SHA256SUMS
)

for filename in "${REQUIRED_FILES[@]}"; do
  [[ -s "${BACKUP_DIR}/${filename}" ]] && ok "${filename}" || fail "${filename} missing or empty"
done

echo
echo "Checksums"
if [[ -f "${BACKUP_DIR}/SHA256SUMS" ]]; then
  if (cd "${BACKUP_DIR}" && sha256sum -c SHA256SUMS); then
    ok "All SHA256 checksums are valid"
  else
    fail "SHA256 verification failed"
  fi
else
  fail "SHA256SUMS not found"
fi

echo
echo "Archive integrity"
for archive in project.tar.gz app-data.tar.gz mosquitto.tar.gz; do
  tar tzf "${BACKUP_DIR}/${archive}" >/dev/null 2>&1 \
    && ok "${archive} is readable" \
    || fail "${archive} is corrupted"
done

echo
echo "Manifest"

BACKUP_FORMAT_VERSION="$(manifest_value backup_version)"
BACKUP_PROJECT_NAME="$(manifest_value project_name)"
BACKUP_COMPOSE_PROJECT_NAME="$(manifest_value compose_project_name)"
BACKUP_DATA_ROOT="$(manifest_value data_root)"
BACKUP_POSTGRES_VERSION="$(manifest_value postgres_version)"
BACKUP_TIMESCALEDB_VERSION="$(manifest_value timescaledb_version)"

[[ -n "${BACKUP_FORMAT_VERSION}" ]] && ok "Backup format version: ${BACKUP_FORMAT_VERSION}" || fail "backup_version missing from manifest"

if [[ -n "${BACKUP_PROJECT_NAME}" ]]; then
  ok "Project name: ${BACKUP_PROJECT_NAME}"
else
  BACKUP_PROJECT_NAME="$(basename "${PROJECT_DIR}")"
  warn "project_name missing from manifest; assuming ${BACKUP_PROJECT_NAME}"
fi

[[ -n "${BACKUP_COMPOSE_PROJECT_NAME}" ]] && ok "Source Compose project: ${BACKUP_COMPOSE_PROJECT_NAME}" || warn "compose_project_name missing from manifest"
[[ -n "${BACKUP_DATA_ROOT}" ]] && ok "Source DATA_ROOT: ${BACKUP_DATA_ROOT}" || warn "data_root missing from manifest (pre-v7 backup)"
[[ -n "${BACKUP_POSTGRES_VERSION}" ]] && ok "PostgreSQL version: ${BACKUP_POSTGRES_VERSION}" || warn "PostgreSQL version missing from manifest"
[[ -n "${BACKUP_TIMESCALEDB_VERSION}" ]] && ok "TimescaleDB version: ${BACKUP_TIMESCALEDB_VERSION}" || warn "TimescaleDB version missing from manifest"

echo
echo "Project archive exclusions"

PROJECT_CONTENTS="$(tar tzf "${BACKUP_DIR}/project.tar.gz")"

check_exclusion() {
  local description="$1"
  local pattern="$2"
  grep -Eq "${pattern}" <<< "${PROJECT_CONTENTS}" \
    && fail "${description} found in project.tar.gz" \
    || ok "${description} excluded"
}

check_exclusion ".git directories" '(^|/)\.git(/|$)'
check_exclusion ".pnpm-store directories" '(^|/)\.pnpm-store(/|$)'
check_exclusion "node_modules directories" '(^|/)node_modules(/|$)'
check_exclusion "esphome/.esphome" '(^|/)esphome/\.esphome(/|$)'
check_exclusion "dev/bin" '(^|/)dev/bin(/|$)'
check_exclusion ".backup directories" '(^|/)\.backup(/|$)'
check_exclusion "tmp directory" '(^|/)tmp(/|$)'

if [[ "${BACKUP_FORMAT_VERSION:-0}" =~ ^[0-9]+$ ]] &&
   (( BACKUP_FORMAT_VERSION >= 7 )) &&
   [[ -n "${BACKUP_DATA_ROOT}" ]] &&
   [[ "${BACKUP_DATA_ROOT}" != /* ]]; then

  NORMALIZED_REL="${BACKUP_DATA_ROOT#./}"
  DATA_ARCHIVE_PATH="${BACKUP_PROJECT_NAME}/${NORMALIZED_REL}"

  if grep -Fqx "${DATA_ARCHIVE_PATH}" <<< "${PROJECT_CONTENTS}" ||
     grep -Fq "${DATA_ARCHIVE_PATH}/" <<< "${PROJECT_CONTENTS}"; then
    fail "DATA_ROOT content found in project.tar.gz (${NORMALIZED_REL})"
  else
    ok "DATA_ROOT excluded from project.tar.gz (${NORMALIZED_REL})"
  fi
fi

echo
echo "Project archive essential content"

check_required_path() {
  local description="$1"
  local path="$2"
  grep -Fq "${path}" <<< "${PROJECT_CONTENTS}" \
    && ok "${description}" \
    || fail "${description} not found in project.tar.gz"
}

check_required_path "docker-compose.yml present" "${BACKUP_PROJECT_NAME}/docker-compose.yml"
check_required_path "apps directory present" "${BACKUP_PROJECT_NAME}/apps/"
check_required_path "infrastructure directory present" "${BACKUP_PROJECT_NAME}/infrastructure/"
check_required_path "tools directory present" "${BACKUP_PROJECT_NAME}/tools/"

echo
echo "Application persistent data"

APP_CONTENTS="$(tar tzf "${BACKUP_DIR}/app-data.tar.gz")"

if [[ "${BACKUP_FORMAT_VERSION:-0}" =~ ^[0-9]+$ ]] &&
   (( BACKUP_FORMAT_VERSION >= 7 )); then
  if grep -Eq '^app(/|$)' <<< "${APP_CONTENTS}"; then
    ok "app/ persistent data tree present"
  elif [[ -z "${APP_CONTENTS}" ]]; then
    warn "Application data archive is empty"
  else
    fail "Unexpected v7 app-data.tar.gz layout"
  fi
else
  warn "Pre-v7 application archive layout"
fi

echo
echo "Mosquitto backup"

MOSQUITTO_CONTENTS="$(tar tzf "${BACKUP_DIR}/mosquitto.tar.gz")"

grep -Eq '^data(/|$)' <<< "${MOSQUITTO_CONTENTS}" \
  && ok "Mosquitto data directory present" \
  || fail "Mosquitto data directory missing"

if [[ "${BACKUP_FORMAT_VERSION:-0}" =~ ^[0-9]+$ ]] &&
   (( BACKUP_FORMAT_VERSION >= 7 )); then
  grep -Eq '^log(/|$)' <<< "${MOSQUITTO_CONTENTS}" \
    && ok "Mosquitto log directory present" \
    || warn "Mosquitto log directory missing"
fi

grep -Eq '^data/mosquitto\.db$' <<< "${MOSQUITTO_CONTENTS}" \
  && ok "mosquitto.db present" \
  || warn "mosquitto.db not present"

echo
echo "PostgreSQL / TimescaleDB dump"

if [[ -s "${BACKUP_DIR}/database.dump" ]]; then
  if command -v docker >/dev/null 2>&1 && [[ -f "${PROJECT_DIR}/docker-compose.yml" ]]; then
    cd "${PROJECT_DIR}"

    if docker compose ps --status running "${DB_SERVICE}" --quiet | grep -q .; then
      docker compose exec -T "${DB_SERVICE}" pg_restore -l \
        < "${BACKUP_DIR}/database.dump" >/dev/null 2>&1 \
        && ok "PostgreSQL dump catalog is readable" \
        || fail "PostgreSQL dump catalog cannot be read"
    else
      warn "Database container is not running; pg_restore validation skipped"
    fi
  else
    warn "Docker/project unavailable; pg_restore validation skipped"
  fi
fi

echo
echo "Backup sizes"

for filename in database.dump database-globals.sql app-data.tar.gz mosquitto.tar.gz project.tar.gz; do
  if [[ -f "${BACKUP_DIR}/${filename}" ]]; then
    SIZE="$(du -h "${BACKUP_DIR}/${filename}" | awk '{print $1}')"
    printf '  %-28s %s\n' "${filename}" "${SIZE}"
  fi
done

TOTAL_SIZE="$(du -sh "${BACKUP_DIR}" | awk '{print $1}')"
printf '  %-28s %s\n' "TOTAL" "${TOTAL_SIZE}"

echo
if (( ERRORS == 0 )); then
  log "Backup verification PASSED"
  exit 0
else
  log "Backup verification FAILED: ${ERRORS} error(s)"
  exit 1
fi
