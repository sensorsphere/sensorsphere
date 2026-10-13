#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$SCRIPT_DIR"
ENV_FILE="$INSTALL_DIR/.env"
SYSTEMD_DIR="${SENSORSPHERE_SYSTEMD_DIR:-/etc/systemd/system}"
SYSTEMCTL="${SENSORSPHERE_SYSTEMCTL:-systemctl}"
NO_SYSTEMCTL="${SENSORSPHERE_SCHEDULE_NO_SYSTEMCTL:-0}"
DEFAULT_CALENDAR="*-*-* 02:00:00"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
SensorSphere Backup V2 scheduler

Usage:
  ./backup-schedule.sh install [--calendar <OnCalendar>] [--randomized-delay-sec <seconds>] [--no-enable]
  ./backup-schedule.sh enable
  ./backup-schedule.sh disable
  ./backup-schedule.sh status
  ./backup-schedule.sh run
  ./backup-schedule.sh uninstall
  ./backup-schedule.sh execute

Commands:
  install    Render/install the per-instance systemd service+timer and enable it by default.
  enable     Enable and start the existing timer.
  disable    Disable and stop the timer without deleting units or run history.
  status     Show unit identity, enabled/active state and next/last trigger.
  run        Start the one-shot backup service immediately through systemd.
  uninstall  Disable the timer and remove the generated unit files.
  execute    Internal one-shot sequence used by the systemd service:
             create -> prune --dry-run -> prune --apply.

Environment/test overrides:
  SENSORSPHERE_SYSTEMD_DIR
  SENSORSPHERE_SYSTEMCTL
  SENSORSPHERE_SCHEDULE_NO_SYSTEMCTL=1
USAGE
}

[[ -f "$ENV_FILE" ]] || die "SensorSphere .env not found in $INSTALL_DIR"
[[ -f "$INSTALL_DIR/docker-compose.yml" ]] || die "docker-compose.yml not found in $INSTALL_DIR"

get_env() {
  local key="$1" raw
  raw="$(sed -n "s/^${key}=//p" "$ENV_FILE" | tail -1)"
  if [[ "$raw" == \"*\" && "$raw" == *\" ]]; then
    raw="${raw:1:${#raw}-2}"
  elif [[ "$raw" == \'*\' && "$raw" == *\' ]]; then
    raw="${raw:1:${#raw}-2}"
  fi
  printf '%s' "$raw"
}

compose_project="$(get_env SENSORSPHERE_COMPOSE_PROJECT)"
compose_project="${compose_project:-$(get_env COMPOSE_PROJECT_NAME)}"
compose_project="${compose_project:-$(basename "$INSTALL_DIR")}"
instance_name="$(get_env INSTANCE_NAME)"
instance_name="${instance_name:-SensorSphere}"

slug="$(printf '%s' "$compose_project" | tr -c 'A-Za-z0-9_.-' '-' | sed 's/^-*//; s/-*$//')"
slug="${slug:-instance}"
path_hash="$(printf '%s' "$INSTALL_DIR" | sha256sum | awk '{print substr($1,1,8)}')"
unit_base="sensorsphere-backup-${slug}-${path_hash}"
SERVICE_UNIT="${unit_base}.service"
TIMER_UNIT="${unit_base}.timer"

data_root="$(get_env DATA_ROOT)"
data_root="${data_root:-./data}"
state_root="$(get_env SENSORSPHERE_BACKUP_STATE_ROOT)"
state_root="${state_root:-${data_root%/}/backup-state}"
if [[ "$state_root" != /* ]]; then
  state_root="$INSTALL_DIR/${state_root#./}"
fi
schedule_run_root="$state_root/schedule-runs"
schedule_current="$state_root/schedule-current.json"
schedule_config="$state_root/schedule.json"

calendar_from_env="$(get_env SENSORSPHERE_BACKUP_ON_CALENDAR)"
calendar_from_env="${calendar_from_env:-$DEFAULT_CALENDAR}"
random_from_env="$(get_env SENSORSPHERE_BACKUP_RANDOMIZED_DELAY_SEC)"
random_from_env="${random_from_env:-0}"

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  printf '%s' "$value"
}

utc_now() {
  date -u '+%Y-%m-%dT%H:%M:%SZ'
}

ensure_state_dirs() {
  mkdir -p "$state_root" "$schedule_run_root"
  chmod 0700 "$state_root" "$schedule_run_root" 2>/dev/null || true
}

write_schedule_config() {
  local enabled="$1" calendar="$2" random="$3"
  ensure_state_dirs
  local tmp
  tmp="$(mktemp "$state_root/.schedule.XXXXXX")"
  cat > "$tmp" <<EOF
{
  "schemaVersion": 1,
  "instanceName": "$(json_escape "$instance_name")",
  "composeProject": "$(json_escape "$compose_project")",
  "installDir": "$(json_escape "$INSTALL_DIR")",
  "serviceUnit": "$SERVICE_UNIT",
  "timerUnit": "$TIMER_UNIT",
  "calendar": "$(json_escape "$calendar")",
  "randomizedDelaySec": $random,
  "enabled": $enabled,
  "updatedAt": "$(utc_now)"
}
EOF
  chmod 0600 "$tmp"
  mv "$tmp" "$schedule_config"
}

schedule_run_id=""
schedule_started_at=""

write_run_state() {
  local status="$1" phase="$2" exit_code="$3" message="$4" completed="$5"
  ensure_state_dirs
  local updated completed_json tmp
  updated="$(utc_now)"
  if [[ "$completed" == "true" ]]; then
    completed_json="\"$updated\""
  else
    completed_json="null"
  fi
  tmp="$(mktemp "$state_root/.schedule-run.XXXXXX")"
  cat > "$tmp" <<EOF
{
  "schemaVersion": 1,
  "runId": "$schedule_run_id",
  "startedAt": "$schedule_started_at",
  "updatedAt": "$updated",
  "completedAt": $completed_json,
  "status": "$status",
  "phase": "$phase",
  "exitCode": $exit_code,
  "message": "$(json_escape "$message")",
  "instanceName": "$(json_escape "$instance_name")",
  "composeProject": "$(json_escape "$compose_project")",
  "installDir": "$(json_escape "$INSTALL_DIR")",
  "serviceUnit": "$SERVICE_UNIT",
  "timerUnit": "$TIMER_UNIT"
}
EOF
  chmod 0600 "$tmp"
  mv "$tmp" "$schedule_current"
  cp "$schedule_current" "$schedule_run_root/$schedule_run_id.json"
  chmod 0600 "$schedule_run_root/$schedule_run_id.json"
}

run_docker_step() {
  local phase="$1"
  shift
  write_run_state "RUNNING" "$phase" 0 "" false
  set +e
  docker "$@"
  local rc=$?
  set -e
  if [[ "$rc" -ne 0 ]]; then
    write_run_state "FAILED" "$phase" "$rc" "command failed" true
    return "$rc"
  fi
}

execute_schedule() {
  command -v docker >/dev/null 2>&1 || die "docker is required"
  schedule_run_id="schedule-$(date -u '+%Y%m%dT%H%M%SZ')-$$"
  schedule_started_at="$(utc_now)"
  write_run_state "RUNNING" "STARTING" 0 "" false

  local expected_workdir actual_workdir
  expected_workdir="$(cd "$INSTALL_DIR" && pwd -P)"
  actual_workdir="$(pwd -P)"
  if [[ "$actual_workdir" != "$expected_workdir" ]]; then
    write_run_state "FAILED" "CONFIGURATION" 10 "WorkingDirectory mismatch: expected $expected_workdir, got $actual_workdir" true
    echo "ERROR: scheduler WorkingDirectory mismatch: expected $expected_workdir, got $actual_workdir" >&2
    return 10
  fi

  run_docker_step "BACKUP_CREATE" compose --profile backup run --rm --no-deps backup create --label "scheduled-systemd" || return $?
  run_docker_step "PRUNE_DRY_RUN" compose --profile backup run --rm --no-deps backup prune --dry-run || return $?
  run_docker_step "PRUNE_APPLY" compose --profile backup run --rm --no-deps backup prune --apply || return $?

  write_run_state "SUCCESS" "COMPLETE" 0 "" true
  echo "Scheduled backup sequence SUCCESS"
}

unit_quote() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '"%s"' "$value"
}

unit_path_escape() {
  local value="$1"
  value="${value//\\/\\x5c}"
  value="${value// /\\x20}"
  value="${value//$'\t'/\\x09}"
  printf '%s' "$value"
}

render_units() {
  local calendar="$1" random="$2"
  mkdir -p "$SYSTEMD_DIR" 2>/dev/null || true

  local owner group service_tmp timer_tmp
  owner="$(stat -c '%U' "$INSTALL_DIR")"
  group="$(stat -c '%G' "$INSTALL_DIR")"
  service_tmp="$(mktemp)"
  timer_tmp="$(mktemp)"
  trap 'rm -f "$service_tmp" "$timer_tmp"' RETURN

  cat > "$service_tmp" <<EOF
[Unit]
Description=SensorSphere scheduled backup ($unit_base)
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target
ConditionPathExists=$(unit_path_escape "$INSTALL_DIR/docker-compose.yml")

[Service]
Type=oneshot
User=$owner
Group=$group
WorkingDirectory=$(unit_path_escape "$INSTALL_DIR")
ExecStart=$(unit_quote "$INSTALL_DIR/backup-schedule.sh") execute
TimeoutStartSec=2h
Nice=10
UMask=0077

[Install]
WantedBy=multi-user.target
EOF

  cat > "$timer_tmp" <<EOF
[Unit]
Description=SensorSphere daily backup timer ($unit_base)

[Timer]
OnCalendar=$calendar
Persistent=true
AccuracySec=1min
Unit=$SERVICE_UNIT
EOF
  if [[ "$random" -gt 0 ]]; then
    printf 'RandomizedDelaySec=%s\n' "$random" >> "$timer_tmp"
  fi
  cat >> "$timer_tmp" <<EOF

[Install]
WantedBy=timers.target
EOF

  install_unit_file "$service_tmp" "$SYSTEMD_DIR/$SERVICE_UNIT"
  install_unit_file "$timer_tmp" "$SYSTEMD_DIR/$TIMER_UNIT"
}

install_unit_file() {
  local source="$1" destination="$2"
  if [[ -w "$SYSTEMD_DIR" || "$EUID" -eq 0 ]]; then
    install -m 0644 "$source" "$destination"
  else
    command -v sudo >/dev/null 2>&1 || die "sudo is required to write $SYSTEMD_DIR"
    sudo install -m 0644 "$source" "$destination"
  fi
}

remove_unit_file() {
  local path="$1"
  if [[ ! -e "$path" ]]; then
    return 0
  fi
  if [[ -w "$SYSTEMD_DIR" || "$EUID" -eq 0 ]]; then
    rm -f "$path"
  else
    command -v sudo >/dev/null 2>&1 || die "sudo is required to remove $path"
    sudo rm -f "$path"
  fi
}

systemctl_mutate() {
  [[ "$NO_SYSTEMCTL" != "1" ]] || return 0
  if [[ "$EUID" -eq 0 || "$SYSTEMD_DIR" != "/etc/systemd/system" ]]; then
    "$SYSTEMCTL" "$@"
  else
    command -v sudo >/dev/null 2>&1 || die "sudo is required for systemd changes"
    sudo "$SYSTEMCTL" "$@"
  fi
}

systemctl_read() {
  [[ "$NO_SYSTEMCTL" != "1" ]] || return 1
  "$SYSTEMCTL" "$@"
}

command_name="${1:-}"
shift || true

case "$command_name" in
  install)
    calendar="$calendar_from_env"
    random="$random_from_env"
    enable_now=1
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --calendar)
          [[ $# -ge 2 ]] || die "--calendar requires a value"
          calendar="$2"
          shift 2
          ;;
        --randomized-delay-sec)
          [[ $# -ge 2 ]] || die "--randomized-delay-sec requires a value"
          random="$2"
          shift 2
          ;;
        --no-enable)
          enable_now=0
          shift
          ;;
        *)
          die "unknown install option: $1"
          ;;
      esac
    done
    [[ "$random" =~ ^[0-9]+$ ]] || die "randomized delay must be a non-negative integer"
    render_units "$calendar" "$random"
    systemctl_mutate daemon-reload
    if [[ "$enable_now" -eq 1 ]]; then
      systemctl_mutate enable --now "$TIMER_UNIT"
      write_schedule_config true "$calendar" "$random"
    else
      write_schedule_config false "$calendar" "$random"
    fi
    echo "Service unit: $SERVICE_UNIT"
    echo "Timer unit:   $TIMER_UNIT"
    echo "Calendar:     $calendar"
    echo "Enabled:      $([[ "$enable_now" -eq 1 ]] && echo yes || echo no)"
    ;;
  enable)
    [[ -f "$SYSTEMD_DIR/$TIMER_UNIT" ]] || die "timer is not installed: $TIMER_UNIT"
    systemctl_mutate enable --now "$TIMER_UNIT"
    calendar="$calendar_from_env"
    random="$random_from_env"
    if [[ -f "$schedule_config" ]]; then
      calendar="$(sed -n 's/^[[:space:]]*"calendar":[[:space:]]*"\(.*\)",$/\1/p' "$schedule_config" | head -1)"
      random="$(sed -n 's/^[[:space:]]*"randomizedDelaySec":[[:space:]]*\([0-9][0-9]*\),$/\1/p' "$schedule_config" | head -1)"
      calendar="${calendar:-$calendar_from_env}"
      random="${random:-$random_from_env}"
    fi
    write_schedule_config true "$calendar" "$random"
    echo "Enabled $TIMER_UNIT"
    ;;
  disable)
    systemctl_mutate disable --now "$TIMER_UNIT"
    calendar="$calendar_from_env"
    random="$random_from_env"
    if [[ -f "$schedule_config" ]]; then
      calendar="$(sed -n 's/^[[:space:]]*"calendar":[[:space:]]*"\(.*\)",$/\1/p' "$schedule_config" | head -1)"
      random="$(sed -n 's/^[[:space:]]*"randomizedDelaySec":[[:space:]]*\([0-9][0-9]*\),$/\1/p' "$schedule_config" | head -1)"
      calendar="${calendar:-$calendar_from_env}"
      random="${random:-$random_from_env}"
    fi
    write_schedule_config false "$calendar" "$random"
    echo "Disabled $TIMER_UNIT"
    ;;
  status)
    echo "Instance:     $instance_name"
    echo "Install dir:  $INSTALL_DIR"
    echo "Service unit: $SERVICE_UNIT"
    echo "Timer unit:   $TIMER_UNIT"
    if [[ -f "$schedule_config" ]]; then
      echo "Schedule:"
      sed 's/^/  /' "$schedule_config"
    else
      echo "Schedule:     not installed"
    fi
    if [[ "$NO_SYSTEMCTL" != "1" ]]; then
      enabled="$(systemctl_read is-enabled "$TIMER_UNIT" 2>/dev/null || true)"
      active="$(systemctl_read is-active "$TIMER_UNIT" 2>/dev/null || true)"
      next="$(systemctl_read show "$TIMER_UNIT" --property=NextElapseUSecRealtime --value 2>/dev/null || true)"
      last="$(systemctl_read show "$TIMER_UNIT" --property=LastTriggerUSec --value 2>/dev/null || true)"
      echo "Enabled state: ${enabled:-unknown}"
      echo "Active state:  ${active:-unknown}"
      echo "Next run:      ${next:-unknown}"
      echo "Last trigger:  ${last:-never}"
    fi
    if [[ -f "$schedule_current" ]]; then
      echo "Last scheduled run:"
      sed 's/^/  /' "$schedule_current"
    fi
    ;;
  run)
    systemctl_mutate start "$SERVICE_UNIT"
    ;;
  uninstall)
    systemctl_mutate disable --now "$TIMER_UNIT" || true
    remove_unit_file "$SYSTEMD_DIR/$TIMER_UNIT"
    remove_unit_file "$SYSTEMD_DIR/$SERVICE_UNIT"
    systemctl_mutate daemon-reload
    rm -f "$schedule_config"
    echo "Removed $SERVICE_UNIT and $TIMER_UNIT"
    ;;
  execute)
    execute_schedule
    ;;
  -h|--help|help|"")
    usage
    ;;
  *)
    die "unknown command: $command_name"
    ;;
esac
