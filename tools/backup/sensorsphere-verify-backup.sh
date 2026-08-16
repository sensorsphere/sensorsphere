#!/usr/bin/env bash

set -Eeuo pipefail

VERIFY_VERSION="6"

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
# Helpers
# ===========================================================================

log() {
  printf '[%s] %s\n' \
    "$(date '+%Y-%m-%d %H:%M:%S')" \
    "$*"
}


ok() {
  printf '  [OK] %s\n' "$*"
}


warn() {
  printf '  [WARN] %s\n' "$*"
}


fail() {
  printf '  [FAIL] %s\n' "$*"
  ERRORS=$((ERRORS + 1))
}


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


# ===========================================================================
# Configuration
# ===========================================================================

CALLER_BACKUP_ROOT="${BACKUP_ROOT-}"
CALLER_DB_SERVICE="${DB_SERVICE-}"

ENV_BACKUP_ROOT="$(read_env_value BACKUP_ROOT)"
ENV_DB_SERVICE="$(read_env_value DB_SERVICE)"

BACKUP_ROOT="${CALLER_BACKUP_ROOT:-${ENV_BACKUP_ROOT:-/var/backups/sensorsphere}}"
DB_SERVICE="${CALLER_DB_SERVICE:-${ENV_DB_SERVICE:-timescaledb}}"


ERRORS=0


# ===========================================================================
# Determine backup directory
#
# Usage:
#
#   sensorsphere-verify-backup.sh
#
#       verifies latest backup
#
#   sensorsphere-verify-backup.sh /var/backups/sensorsphere/....
#
#       verifies specified backup
# ===========================================================================

if [[ $# -gt 1 ]]; then
  echo "Usage: $0 [backup-directory]" >&2
  exit 2
fi


if [[ $# -eq 1 ]]; then

  BACKUP_DIR="$1"

else

  BACKUP_DIR="$(
    find "${BACKUP_ROOT}" \
      -mindepth 1 \
      -maxdepth 1 \
      -type d \
      -printf '%p\n' \
      2>/dev/null \
      | sort \
      | tail -1
  )"

fi


if [[ -z "${BACKUP_DIR:-}" ]]; then
  echo "No backup found in ${BACKUP_ROOT}" >&2
  exit 1
fi


if [[ ! -d "${BACKUP_DIR}" ]]; then
  echo "Backup directory does not exist: ${BACKUP_DIR}" >&2
  exit 1
fi


log "SensorSphere backup verification"
log "Verifier version: ${VERIFY_VERSION}"
log "Backup: ${BACKUP_DIR}"


# ===========================================================================
# Required files
# ===========================================================================

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

  if [[ -s "${BACKUP_DIR}/${filename}" ]]; then
    ok "${filename}"
  else
    fail "${filename} missing or empty"
  fi

done


# ===========================================================================
# SHA256
# ===========================================================================

echo
echo "Checksums"


if [[ -f "${BACKUP_DIR}/SHA256SUMS" ]]; then

  if (
    cd "${BACKUP_DIR}"
    sha256sum -c SHA256SUMS
  ); then
    ok "All SHA256 checksums are valid"
  else
    fail "SHA256 verification failed"
  fi

else
  fail "SHA256SUMS not found"
fi


# ===========================================================================
# Tar archives
# ===========================================================================

echo
echo "Archive integrity"


if tar tzf "${BACKUP_DIR}/project.tar.gz" >/dev/null 2>&1; then
  ok "project.tar.gz is readable"
else
  fail "project.tar.gz is corrupted"
fi


if tar tzf "${BACKUP_DIR}/app-data.tar.gz" >/dev/null 2>&1; then
  ok "app-data.tar.gz is readable"
else
  fail "app-data.tar.gz is corrupted"
fi


if tar tzf "${BACKUP_DIR}/mosquitto.tar.gz" >/dev/null 2>&1; then
  ok "mosquitto.tar.gz is readable"
else
  fail "mosquitto.tar.gz is corrupted"
fi


# ===========================================================================
# Project archive exclusions
# ===========================================================================

echo
echo "Project archive exclusions"


if tar tzf "${BACKUP_DIR}/project.tar.gz" >/dev/null 2>&1; then

  PROJECT_CONTENTS="$(
    tar tzf "${BACKUP_DIR}/project.tar.gz"
  )"

  check_exclusion() {
    local description="$1"
    local pattern="$2"

    if grep -Eq "${pattern}" <<< "${PROJECT_CONTENTS}"; then
      fail "${description} found in project.tar.gz"
    else
      ok "${description} excluded"
    fi
  }


  check_exclusion \
    ".git directories" \
    '(^|/)\.git(/|$)'


  check_exclusion \
    ".pnpm-store directories" \
    '(^|/)\.pnpm-store(/|$)'


  check_exclusion \
    "node_modules directories" \
    '(^|/)node_modules(/|$)'


  check_exclusion \
    "esphome/.esphome" \
    '(^|/)esphome/\.esphome(/|$)'


  check_exclusion \
    "dev/bin" \
    '(^|/)dev/bin(/|$)'


  check_exclusion \
    ".backup directories" \
    '(^|/)\.backup(/|$)'


  check_exclusion \
    "tmp directory" \
    '(^|/)tmp(/|$)'


  check_exclusion \
    "TimescaleDB runtime data" \
    '/infrastructure/timescaledb/data(/|$)'


  check_exclusion \
    "Mosquitto runtime data" \
    '/infrastructure/mosquitto/data(/|$)'


  check_exclusion \
    "application runtime data" \
    '/data/app(/|$)'

fi


# ===========================================================================
# Project archive essential content
# ===========================================================================

echo
echo "Project archive essential content"


if [[ -n "${PROJECT_CONTENTS:-}" ]]; then

  check_required_path() {
    local description="$1"
    local pattern="$2"

    if grep -Eq "${pattern}" <<< "${PROJECT_CONTENTS}"; then
      ok "${description}"
    else
      fail "${description} not found in project.tar.gz"
    fi
  }


  check_required_path \
    "docker-compose.yml present" \
    '^sensorsphere/docker-compose\.yml$'


  check_required_path \
    "apps directory present" \
    '^sensorsphere/apps/'


  check_required_path \
    "infrastructure directory present" \
    '^sensorsphere/infrastructure/'


  check_required_path \
    "tools directory present" \
    '^sensorsphere/tools/'


  check_required_path \
    "backup tools present" \
    '^sensorsphere/tools/backup/'


  check_required_path \
    "documentation present" \
    '^sensorsphere/docs/'

fi


# ===========================================================================
# Mosquitto content
# ===========================================================================

echo
echo "Mosquitto backup"


if tar tzf "${BACKUP_DIR}/mosquitto.tar.gz" >/dev/null 2>&1; then

  MOSQUITTO_CONTENTS="$(
    tar tzf "${BACKUP_DIR}/mosquitto.tar.gz"
  )"

  if grep -Eq '^config/' <<< "${MOSQUITTO_CONTENTS}"; then
    ok "Mosquitto configuration present"
  else
    fail "Mosquitto configuration missing"
  fi


  if grep -Eq '^data/' <<< "${MOSQUITTO_CONTENTS}"; then
    ok "Mosquitto data directory present"
  else
    fail "Mosquitto data directory missing"
  fi


  if grep -Eq '^data/mosquitto\.db$' <<< "${MOSQUITTO_CONTENTS}"; then
    ok "mosquitto.db present"
  else
    warn "mosquitto.db not present"
  fi

fi


# ===========================================================================
# PostgreSQL dump
# ===========================================================================

echo
echo "PostgreSQL / TimescaleDB dump"


if [[ -s "${BACKUP_DIR}/database.dump" ]]; then

  if command -v docker >/dev/null 2>&1 \
    && [[ -f "${PROJECT_DIR}/docker-compose.yml" ]]; then

    cd "${PROJECT_DIR}"

    if docker compose ps --status running "${DB_SERVICE}" \
      --quiet \
      | grep -q .; then

      if docker compose exec -T "${DB_SERVICE}" \
        pg_restore -l \
        < "${BACKUP_DIR}/database.dump" \
        >/dev/null 2>&1; then

        ok "PostgreSQL dump catalog is readable"

      else

        fail "PostgreSQL dump catalog cannot be read"

      fi

    else

      warn "Database container is not running; pg_restore validation skipped"

    fi

  else

    warn "Docker/project unavailable; pg_restore validation skipped"

  fi

fi


# ===========================================================================
# Manifest
# ===========================================================================

echo
echo "Manifest"


if [[ -s "${BACKUP_DIR}/manifest.txt" ]]; then

  BACKUP_FORMAT_VERSION="$(
    grep '^backup_version=' \
      "${BACKUP_DIR}/manifest.txt" \
      | head -1 \
      | cut -d= -f2-
  )"

  if [[ -n "${BACKUP_FORMAT_VERSION}" ]]; then
    ok "Backup format version: ${BACKUP_FORMAT_VERSION}"
  else
    fail "backup_version missing from manifest"
  fi


  POSTGRES_VERSION="$(
    grep '^postgres_version=' \
      "${BACKUP_DIR}/manifest.txt" \
      | head -1 \
      | cut -d= -f2-
  )"

  if [[ -n "${POSTGRES_VERSION}" ]]; then
    ok "PostgreSQL version: ${POSTGRES_VERSION}"
  else
    warn "PostgreSQL version missing from manifest"
  fi


  TIMESCALEDB_VERSION="$(
    grep '^timescaledb_version=' \
      "${BACKUP_DIR}/manifest.txt" \
      | head -1 \
      | cut -d= -f2-
  )"

  if [[ -n "${TIMESCALEDB_VERSION}" ]]; then
    ok "TimescaleDB version: ${TIMESCALEDB_VERSION}"
  else
    warn "TimescaleDB version missing from manifest"
  fi

fi


# ===========================================================================
# Sizes
# ===========================================================================

echo
echo "Backup sizes"


for filename in \
  database.dump \
  database-globals.sql \
  app-data.tar.gz \
  mosquitto.tar.gz \
  project.tar.gz
do

  if [[ -f "${BACKUP_DIR}/${filename}" ]]; then

    SIZE="$(
      du -h "${BACKUP_DIR}/${filename}" \
        | awk '{print $1}'
    )"

    printf '  %-28s %s\n' \
      "${filename}" \
      "${SIZE}"

  fi

done


TOTAL_SIZE="$(
  du -sh "${BACKUP_DIR}" \
    | awk '{print $1}'
)"

printf '  %-28s %s\n' \
  "TOTAL" \
  "${TOTAL_SIZE}"


# ===========================================================================
# Result
# ===========================================================================

echo


if (( ERRORS == 0 )); then

  log "Backup verification PASSED"
  exit 0

else

  log "Backup verification FAILED: ${ERRORS} error(s)"
  exit 1

fi
