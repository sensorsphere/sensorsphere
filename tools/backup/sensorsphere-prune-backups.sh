#!/usr/bin/env bash

set -Eeuo pipefail

PRUNE_VERSION="1"

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

read_env_value() {
  local variable="$1"

  if [[ ! -f "${ENV_FILE}" ]]; then
    return 0
  fi

  (
    set -a
    source "${ENV_FILE}"
    printf '%s' "${!variable-}"
  )
}

CALLER_BACKUP_ROOT="${BACKUP_ROOT-}"
CALLER_RETENTION_DAILY="${RETENTION_DAILY-}"
CALLER_RETENTION_WEEKLY="${RETENTION_WEEKLY-}"
CALLER_RETENTION_MONTHLY="${RETENTION_MONTHLY-}"

ENV_BACKUP_ROOT="$(read_env_value BACKUP_ROOT)"
ENV_RETENTION_DAILY="$(read_env_value RETENTION_DAILY)"
ENV_RETENTION_WEEKLY="$(read_env_value RETENTION_WEEKLY)"
ENV_RETENTION_MONTHLY="$(read_env_value RETENTION_MONTHLY)"

BACKUP_ROOT="${CALLER_BACKUP_ROOT:-${ENV_BACKUP_ROOT:-/var/backups/sensorsphere}}"
RETENTION_DAILY="${CALLER_RETENTION_DAILY:-${ENV_RETENTION_DAILY:-7}}"
RETENTION_WEEKLY="${CALLER_RETENTION_WEEKLY:-${ENV_RETENTION_WEEKLY:-4}}"
RETENTION_MONTHLY="${CALLER_RETENTION_MONTHLY:-${ENV_RETENTION_MONTHLY:-6}}"

APPLY=false

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

is_complete_backup() {
  local dir="$1"

  [[ -f "${dir}/SHA256SUMS" ]] &&
  [[ -s "${dir}/database.dump" ]] &&
  [[ -s "${dir}/project.tar.gz" ]] &&
  [[ -s "${dir}/manifest.txt" ]]
}

while (( $# > 0 )); do
  case "$1" in
    --dry-run)
      APPLY=false
      shift
      ;;
    --apply)
      APPLY=true
      shift
      ;;
    -h|--help)
      echo "Usage: sensorsphere-prune-backups [--dry-run|--apply]"
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

[[ -d "${BACKUP_ROOT}" ]] \
  || fail "Backup root not found: ${BACKUP_ROOT}"

log "SensorSphere backup retention"
log "Backup root: ${BACKUP_ROOT}"
log "Daily: ${RETENTION_DAILY}"
log "Weekly: ${RETENTION_WEEKLY}"
log "Monthly: ${RETENTION_MONTHLY}"
log "Mode: $([[ "${APPLY}" == "true" ]] && echo APPLY || echo DRY-RUN)"

mapfile -t ALL_DIRS < <(
  find "${BACKUP_ROOT}" \
    -mindepth 1 \
    -maxdepth 1 \
    -type d \
    -printf '%f\n' \
  | grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}$' \
  | sort -r
)

BACKUPS=()

for name in "${ALL_DIRS[@]}"; do
  dir="${BACKUP_ROOT}/${name}"

  if is_complete_backup "${dir}"; then
    BACKUPS+=("${name}")
  else
    log "Ignoring incomplete backup: ${name}"
  fi
done

(( ${#BACKUPS[@]} > 0 )) || {
  log "No complete backups found."
  exit 0
}

declare -A KEEP=()
declare -A KEEP_REASON=()
declare -A SEEN_DAY=()
declare -A SEEN_WEEK=()
declare -A SEEN_MONTH=()

daily_kept=0
weekly_kept=0
monthly_kept=0

for name in "${BACKUPS[@]}"; do
  date_part="${name%%_*}"

  day_key="${date_part}"
  week_key="$(date -d "${date_part}" '+%G-W%V')"
  month_key="$(date -d "${date_part}" '+%Y-%m')"

  if (( daily_kept < RETENTION_DAILY )) &&
     [[ -z "${SEEN_DAY[${day_key}]:-}" ]]; then
    SEEN_DAY["${day_key}"]=1
    KEEP["${name}"]=1
    KEEP_REASON["${name}"]="${KEEP_REASON[${name}]:-}daily,"
    daily_kept=$((daily_kept + 1))
  fi

  if (( weekly_kept < RETENTION_WEEKLY )) &&
     [[ -z "${SEEN_WEEK[${week_key}]:-}" ]]; then
    SEEN_WEEK["${week_key}"]=1
    KEEP["${name}"]=1
    KEEP_REASON["${name}"]="${KEEP_REASON[${name}]:-}weekly,"
    weekly_kept=$((weekly_kept + 1))
  fi

  if (( monthly_kept < RETENTION_MONTHLY )) &&
     [[ -z "${SEEN_MONTH[${month_key}]:-}" ]]; then
    SEEN_MONTH["${month_key}"]=1
    KEEP["${name}"]=1
    KEEP_REASON["${name}"]="${KEEP_REASON[${name}]:-}monthly,"
    monthly_kept=$((monthly_kept + 1))
  fi
done

NEWEST="${BACKUPS[0]}"
KEEP["${NEWEST}"]=1
KEEP_REASON["${NEWEST}"]="${KEEP_REASON[${NEWEST}]:-}newest,"

echo
printf '%-22s %-8s %s\n' "BACKUP" "ACTION" "REASON"

for name in "${BACKUPS[@]}"; do
  if [[ -n "${KEEP[${name}]:-}" ]]; then
    reason="${KEEP_REASON[${name}]%,}"
    printf '%-22s %-8s %s\n' "${name}" "KEEP" "${reason}"
  else
    printf '%-22s %-8s %s\n' "${name}" "DELETE" "expired"

    if [[ "${APPLY}" == "true" ]]; then
      rm -rf -- "${BACKUP_ROOT:?}/${name}"
    fi
  fi
done

if [[ "${APPLY}" == "false" ]]; then
  log "Dry-run only. Use --apply to delete expired backups."
else
  log "Retention completed successfully."
fi
