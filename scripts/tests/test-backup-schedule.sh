#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

SYSTEMD_DIR="$TMP/systemd"
BIN="$TMP/bin"
LOG="$TMP/systemctl.log"
DOCKER_LOG="$TMP/docker.log"
mkdir -p "$SYSTEMD_DIR" "$BIN"
: > "$LOG"
: > "$DOCKER_LOG"

cat > "$BIN/systemctl" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$FAKE_SYSTEMCTL_LOG"
case "$1" in
  is-enabled)
    echo enabled
    ;;
  is-active)
    echo active
    ;;
  show)
    case "$*" in
      *NextElapseUSecRealtime*) echo "Tue 2099-01-01 02:00:00 UTC" ;;
      *LastTriggerUSec*) echo "Mon 2098-12-31 02:00:00 UTC" ;;
      *) echo "" ;;
    esac
    ;;
esac
SH

cat > "$BIN/docker" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
echo "$*" >> "$FAKE_DOCKER_LOG"
if [[ "${FAIL_CREATE:-0}" == "1" && "$*" == *" backup create "* ]]; then
  exit 42
fi
exit 0
SH
chmod 0755 "$BIN/systemctl" "$BIN/docker"

make_instance() {
  local dir="$1" project="$2" name="$3"
  mkdir -p "$dir"
  cp "$ROOT/backup-schedule.sh" "$dir/backup-schedule.sh"
  chmod 0755 "$dir/backup-schedule.sh"
  : > "$dir/docker-compose.yml"
  cat > "$dir/.env" <<EOF
COMPOSE_PROJECT_NAME=$project
INSTANCE_NAME=$name
DATA_ROOT=./data
EOF
}

A="$TMP/Instance With Spaces"
B="$TMP/instance-b"
make_instance "$A" phase3-a "SensorSphere [P3-A]"
make_instance "$B" phase3-b "SensorSphere [P3-B]"

common_env=(
  "PATH=$BIN:$PATH"
  "FAKE_SYSTEMCTL_LOG=$LOG"
  "FAKE_DOCKER_LOG=$DOCKER_LOG"
  "SENSORSPHERE_SYSTEMD_DIR=$SYSTEMD_DIR"
  "SENSORSPHERE_SYSTEMCTL=$BIN/systemctl"
)

env "${common_env[@]}" "$A/backup-schedule.sh" install   --calendar "*-*-* 03:15:00"   --randomized-delay-sec 17 > "$TMP/install-a.txt"

env "${common_env[@]}" "$B/backup-schedule.sh" install   --calendar "*-*-* 04:20:00" > "$TMP/install-b.txt"

service_a="$(sed -n 's/^Service unit: //p' "$TMP/install-a.txt")"
timer_a="$(sed -n 's/^Timer unit:   //p' "$TMP/install-a.txt")"
service_b="$(sed -n 's/^Service unit: //p' "$TMP/install-b.txt")"
timer_b="$(sed -n 's/^Timer unit:   //p' "$TMP/install-b.txt")"

[[ -n "$service_a" && -n "$timer_a" && -n "$service_b" && -n "$timer_b" ]]
[[ "$service_a" != "$service_b" ]]
[[ "$timer_a" != "$timer_b" ]]
[[ -f "$SYSTEMD_DIR/$service_a" ]]
[[ -f "$SYSTEMD_DIR/$timer_a" ]]
[[ -f "$SYSTEMD_DIR/$service_b" ]]
[[ -f "$SYSTEMD_DIR/$timer_b" ]]

escaped_a="${A// /\\x20}"
working_pattern="WorkingDirectory=$escaped_a"
exec_pattern="ExecStart=\"$A/backup-schedule.sh\" execute"
grep -Fq "$working_pattern" "$SYSTEMD_DIR/$service_a"
grep -Fq "$exec_pattern" "$SYSTEMD_DIR/$service_a"
grep -Fq 'Persistent=true' "$SYSTEMD_DIR/$timer_a"
grep -Fq 'OnCalendar=*-*-* 03:15:00' "$SYSTEMD_DIR/$timer_a"
grep -Fq 'RandomizedDelaySec=17' "$SYSTEMD_DIR/$timer_a"
grep -Fq 'OnCalendar=*-*-* 04:20:00' "$SYSTEMD_DIR/$timer_b"

env "${common_env[@]}" "$A/backup-schedule.sh" status > "$TMP/status-a.txt"
grep -Fq 'Enabled state: enabled' "$TMP/status-a.txt"
grep -Fq 'Active state:  active' "$TMP/status-a.txt"
grep -Fq 'Next run:      Tue 2099-01-01 02:00:00 UTC' "$TMP/status-a.txt"

: > "$DOCKER_LOG"
set +e
(
  cd "$TMP"
  env "${common_env[@]}" "$A/backup-schedule.sh" execute > "$TMP/execute-wrong-workdir.txt" 2>&1
)
wrong_rc=$?
set -e
[[ "$wrong_rc" -eq 10 ]]
[[ ! -s "$DOCKER_LOG" ]]
jq -e '.status=="FAILED" and .phase=="CONFIGURATION" and .exitCode==10' "$A/data/backup-state/schedule-current.json" >/dev/null

: > "$DOCKER_LOG"
(
  cd "$A"
  env "${common_env[@]}" ./backup-schedule.sh execute > "$TMP/execute-success.txt"
)
[[ "$(wc -l < "$DOCKER_LOG")" -eq 3 ]]
sed -n '1p' "$DOCKER_LOG" | grep -Fq 'compose --profile backup run --rm --no-deps backup create --label scheduled-systemd'
sed -n '2p' "$DOCKER_LOG" | grep -Fq 'compose --profile backup run --rm --no-deps backup prune --dry-run'
sed -n '3p' "$DOCKER_LOG" | grep -Fq 'compose --profile backup run --rm --no-deps backup prune --apply'
jq -e '.status=="SUCCESS" and .phase=="COMPLETE" and .exitCode==0' "$A/data/backup-state/schedule-current.json" >/dev/null

: > "$DOCKER_LOG"
set +e
(
  cd "$A"
  env "${common_env[@]}" FAIL_CREATE=1 ./backup-schedule.sh execute > "$TMP/execute-failed.txt" 2>&1
)
rc=$?
set -e
[[ "$rc" -eq 42 ]]
[[ "$(wc -l < "$DOCKER_LOG")" -eq 1 ]]
jq -e '.status=="FAILED" and .phase=="BACKUP_CREATE" and .exitCode==42' "$A/data/backup-state/schedule-current.json" >/dev/null

env "${common_env[@]}" "$A/backup-schedule.sh" disable > "$TMP/disable.txt"
jq -e '.enabled==false' "$A/data/backup-state/schedule.json" >/dev/null
env "${common_env[@]}" "$A/backup-schedule.sh" enable > "$TMP/enable.txt"
jq -e '.enabled==true' "$A/data/backup-state/schedule.json" >/dev/null

env "${common_env[@]}" "$A/backup-schedule.sh" uninstall > "$TMP/uninstall.txt"
[[ ! -e "$SYSTEMD_DIR/$service_a" ]]
[[ ! -e "$SYSTEMD_DIR/$timer_a" ]]
[[ ! -e "$A/data/backup-state/schedule.json" ]]

echo "Backup scheduler host tests: PASS"
