#!/usr/bin/env bash
# SS-OD-04 freshness check + optional delivery of a failure alert.
set -Eeuo pipefail
umask 077
CONF="${SS_OD_CONFIG:-/home/ubuntu/.config/sensorsphere-onedrive/backup.conf}"
say() { printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$*"; }
fail() { say "ERROR: $*" >&2; exit 1; }
[[ $# -ge 1 ]] || fail "Usage: $0 check {DEV|DIT|all} [now-epoch] | notify {DEV|DIT|freshness}"
[[ -r "$CONF" && "$(stat -c %a "$CONF")" == 600 ]] || fail "missing secure configuration"
# Config is controlled by the instance administrator (mode 600).
source "$CONF"
export RCLONE_CONFIG="${SS_OD_RCLONE_CONFIG:-/home/ubuntu/.config/rclone/rclone.conf}"
export RESTIC_PASSWORD_FILE="${SS_OD_PASSWORD_FILE:-/home/ubuntu/.config/sensorsphere-onedrive/restic-password}"
export RESTIC_REPOSITORY="${SS_OD_REPOSITORY:?missing repository}"
case "$1" in
check)
  [[ $# -ge 2 ]] || fail "specify DEV, DIT or all"
  case "$2" in DEV|DIT) envs=("$2");; all) envs=(DEV DIT);; *) fail "invalid environment";; esac
  now="${3:-$(date -u +%s)}"
  [[ "$now" =~ ^[0-9]{10,}$ ]] || fail "invalid now epoch"
  hours="${SS_OD_MAX_AGE_HOURS:-26}"
  [[ "$hours" =~ ^[1-9][0-9]*$ ]] || fail "invalid age threshold"
  command -v restic >/dev/null || fail "missing restic"
  command -v jq >/dev/null || fail "missing jq"
  failed=0
  for environment in "${envs[@]}"; do
    if ! raw="$(restic snapshots --json --tag "env=$environment")"; then
      say "CRITICAL $environment: repository unreachable"; failed=1; continue
    fi
    latest="$(printf '%s' "$raw" | jq -r '[.[].time] | sort | last // empty')"
    if [[ -z "$latest" ]]; then
      say "CRITICAL $environment: no snapshot"; failed=1; continue
    fi
    if ! stamp="$(date -u -d "$latest" +%s)"; then
      say "CRITICAL $environment: unreadable timestamp"; failed=1; continue
    fi
    age=$((now-stamp))
    if (( age < -300 )); then
      say "CRITICAL $environment: snapshot dated in future"; failed=1
    elif (( age > hours*3600 )); then
      say "STALE $environment: age=${age}s exceeds ${hours}h"; failed=1
    else
      say "OK $environment: age=${age}s threshold=${hours}h"
    fi
  done
  ((failed==0)) || exit 1
  ;;
notify)
  [[ $# -eq 2 ]] || fail "specify environment for alert"
  case "$2" in DEV|DIT|freshness) ;; *) fail "invalid notification target" ;; esac
  msg="SensorSphere offsite backup alarm on na-01: $2. Check journalctl -u 'sensorsphere-onedrive*' and verify Restic repository."
  # This local journal event is always available, even without an endpoint.
  say "ALERT: $msg"
  if [[ -z "${SS_OD_ALERT_URL:-}" ]]; then
    say "ALERT_NOT_DELIVERED: SS_OD_ALERT_URL not configured" >&2
    exit 2
  fi
  case "$SS_OD_ALERT_URL" in https://*) ;; *) fail "Alert URL must use HTTPS";; esac
  args=(--fail --silent --show-error --max-time 15 --retry 2 -X POST -H 'Content-Type: text/plain; charset=utf-8' --data-binary "$msg")
  if [[ -n "${SS_OD_ALERT_CURL_CONFIG:-}" ]]; then
    [[ -r "$SS_OD_ALERT_CURL_CONFIG" ]] || fail "Missing curl authentication config"
    args+=(--config "$SS_OD_ALERT_CURL_CONFIG")
  fi
  curl "${args[@]}" "$SS_OD_ALERT_URL" >/dev/null || fail "Alert delivery failed"
  say "ALERT_DELIVERED: $2"
  ;;
*) fail "unknown operation";;
esac
