#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$SCRIPT_DIR"
MODE=""
BACKUP_ID=""
PREFLIGHT_ONLY=0
UNATTENDED=0
CONFIRM_ARG=""

usage() {
  cat <<'EOF'
Usage:
  ./restore.sh --data <backup-id> [--preflight-only]
  ./restore.sh --data <backup-id> --unattended --confirm "<exact phrase>"
  ./restore.sh --full <backup-id> --preflight-only
Options:
  --install-dir <path>   Target SensorSphere installation (default: script dir)
  --preflight-only       Validate and print the restore plan; never mutate target
  --unattended           Non-interactive apply; requires --confirm
  --confirm <phrase>     Exact generated restore confirmation phrase
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --data|--full)
      [[ -z "$MODE" ]] || { echo "ERROR: choose exactly one of --data or --full" >&2; exit 2; }
      MODE="${1#--}"
      [[ $# -ge 2 ]] || { echo "ERROR: $1 requires <backup-id>" >&2; exit 2; }
      BACKUP_ID="$2"
      shift 2
      ;;
    --install-dir)
      [[ $# -ge 2 ]] || { echo "ERROR: --install-dir requires a path" >&2; exit 2; }
      INSTALL_DIR="$2"
      shift 2
      ;;
    --preflight-only) PREFLIGHT_ONLY=1; shift ;;
    --unattended) UNATTENDED=1; shift ;;
    --confirm)
      [[ $# -ge 2 ]] || { echo "ERROR: --confirm requires a phrase" >&2; exit 2; }
      CONFIRM_ARG="$2"
      shift 2
      ;;
    --help|-h) usage; exit 0 ;;
    *) echo "ERROR: unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ -n "$MODE" && -n "$BACKUP_ID" ]] || { usage >&2; exit 2; }
[[ "$BACKUP_ID" != "latest" ]] || { echo "ERROR: restore requires an explicit backup id; latest is not allowed" >&2; exit 2; }

INSTALL_DIR="$(cd "$INSTALL_DIR" && pwd)"
ENV_FILE="$INSTALL_DIR/.env"
COMPOSE_FILE="$INSTALL_DIR/docker-compose.yml"

[[ -f "$ENV_FILE" && -f "$COMPOSE_FILE" ]] || {
  echo "ERROR: SensorSphere installation not found: $INSTALL_DIR" >&2
  exit 10
}
command -v docker >/dev/null 2>&1 || { echo "ERROR: docker is required" >&2; exit 10; }
docker compose version >/dev/null 2>&1 || { echo "ERROR: docker compose is required" >&2; exit 10; }

get_env() {
  local key="$1"
  sed -n "s/^$key=//p" "$ENV_FILE" | tail -1
}

compose() {
  local -a clean_env=(env)
  local line key
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
    key="${line%%=*}"
    clean_env+=( -u "$key" )
  done < "$ENV_FILE"
  (cd "$INSTALL_DIR" && "${clean_env[@]}" docker compose --env-file .env -f docker-compose.yml "$@")
}

environment="$(get_env SENSORSPHERE_ENVIRONMENT)"
environment="${environment:-DEFAULT}"
environment="${environment^^}"
[[ "$environment" == "RECOVERY" ]] || {
  echo "ERROR: Restore V2 0.2.0 destructive validation is restricted to SENSORSPHERE_ENVIRONMENT=RECOVERY." >&2
  echo "Target environment is: $environment" >&2
  exit 10
}

echo "== SensorSphere Restore V2 =="
echo "Target install: $INSTALL_DIR"
echo "Mode:           $MODE"
echo "Source backup:  $BACKUP_ID"
echo

preflight_output="$(compose --profile restore run --rm restore restore "--$MODE" "$BACKUP_ID" --preflight)"
printf '%s
' "$preflight_output"
confirmation="$(printf '%s
' "$preflight_output" | sed -n 's/^Confirmation[. ]*//p' | tail -1)"
retry_safety_id="$(printf '%s
' "$preflight_output" | sed -n 's/^Retry safety backup[. ]*//p' | tail -1)"
[[ -n "$confirmation" ]] || { echo "ERROR: preflight did not return a confirmation phrase" >&2; exit 20; }

if [[ "$PREFLIGHT_ONLY" -eq 1 ]]; then
  echo
  echo "Preflight-only completed. No target mutation was performed."
  exit 0
fi

[[ "$MODE" == "data" ]] || {
  echo "ERROR: full restore execution is not implemented in Backup/Restore V2 0.2.x; use --preflight-only." >&2
  exit 2
}

if [[ "$UNATTENDED" -eq 1 ]]; then
  [[ -n "$CONFIRM_ARG" && "$CONFIRM_ARG" == "$confirmation" ]] || {
    echo "ERROR: unattended restore requires --confirm with the exact phrase:" >&2
    echo "$confirmation" >&2
    exit 40
  }
else
  echo
  echo "This operation will replace the RECOVERY target database and persistent app/Mosquitto data."
  echo "Type the exact confirmation phrase:"
  echo "  $confirmation"
  read -r entered
  [[ "$entered" == "$confirmation" ]] || { echo "Restore cancelled; no target mutation was performed."; exit 40; }
fi

echo
if [[ -n "$retry_safety_id" ]]; then
  echo "Degraded retry detected. Reusing prior pre-restore safety backup..."
  safety_id="$retry_safety_id"
  compose --profile backup run --rm backup verify "$safety_id"
  echo "Prior safety backup re-verified: $safety_id"
else
  echo "Creating mandatory pre-restore safety backup..."
  safety_output="$(compose --profile backup run --rm backup create --label "pre-restore safety backup for $BACKUP_ID")"
  printf '%s
' "$safety_output"
  safety_id="$(printf '%s
' "$safety_output" | sed -n 's/^Backup ID[. ]*//p' | tail -1)"
  [[ -n "$safety_id" ]] || { echo "ERROR: safety backup did not return an ID" >&2; exit 30; }
  compose --profile backup run --rm backup verify "$safety_id"
  echo "Safety backup verified: $safety_id"
fi

echo
echo "Quiescing writers and external access..."
if ! compose stop nginx api ingestion-service mosquitto; then
  echo "ERROR: unable to quiesce SensorSphere writers; restore has not started." >&2
  compose up -d || true
  exit 40
fi

for service in nginx api ingestion-service mosquitto; do
  id="$(compose ps -aq "$service" | head -1)"
  if [[ -n "$id" ]] && [[ "$(docker inspect --format '{{.State.Running}}' "$id" 2>/dev/null || echo unknown)" != "false" ]]; then
    echo "ERROR: service $service is not proven stopped; restore has not started." >&2
    compose up -d || true
    exit 40
  fi
done

echo "Writers are stopped. Starting destructive RECOVERY restore engine..."
set +e
apply_output="$(compose --profile restore run --rm restore restore --data "$BACKUP_ID" --apply   --confirm "$confirmation"   --safety-backup-id "$safety_id"   --writers-quiesced   --json 2>&1)"
apply_rc=$?
set -e
printf '%s
' "$apply_output"

if [[ "$apply_rc" -ne 0 ]]; then
  echo "ERROR: restore engine failed (exit $apply_rc)." >&2
  echo "Writers remain stopped. Safety backup retained: $safety_id" >&2
  exit "$apply_rc"
fi

run_id="$(printf '%s
' "$apply_output" | sed -n 's/.*"runId":"\([^"]*\)".*/\1/p' | tail -1)"
[[ -n "$run_id" ]] || {
  echo "ERROR: restore engine completed without a run ID; writers remain stopped." >&2
  echo "Safety backup retained: $safety_id" >&2
  exit 80
}
echo "Restore engine completed: $run_id"

mark_failed() {
  local step="$1" code="$2" message="$3"
  compose --profile restore run --rm restore restore fail "$run_id"     --step "$step" --code "$code" --message "$message" >/dev/null 2>&1 || true
  echo "Restore run $run_id marked FAILED at $step." >&2
  echo "Writers remain stopped where target consistency is not proven." >&2
  echo "Safety backup retained: $safety_id" >&2
}

echo
echo "Running target Stack migrations..."
if ! compose run --rm migrations; then
  mark_failed "MIGRATIONS" 70 "target Stack migrations failed"
  exit 70
fi

echo "Starting restored runtime..."
if ! compose up -d; then
  mark_failed "STARTING_RUNTIME" 70 "docker compose up failed after restore"
  exit 70
fi
if ! compose up -d --no-deps --force-recreate nginx; then
  mark_failed "STARTING_RUNTIME" 70 "nginx recreate failed after restore"
  exit 70
fi

wait_for_health() {
  local deadline=$((SECONDS + 180))
  local service id status
  for service in timescaledb api frontend nginx; do
    while true; do
      id="$(compose ps -q "$service")"
      status=""
      if [[ -n "$id" ]]; then
        status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || true)"
      fi
      if [[ "$status" == "healthy" || "$status" == "running" ]]; then
        echo "Health OK: $service ($status)"
        break
      fi
      if (( SECONDS >= deadline )); then
        echo "ERROR: health timeout for $service (status=$status)" >&2
        return 1
      fi
      sleep 2
    done
  done

  for service in ingestion-service mosquitto; do
    id="$(compose ps -q "$service")"
    [[ -n "$id" ]] || { echo "ERROR: $service is not running" >&2; return 1; }
    [[ "$(docker inspect --format '{{.State.Running}}' "$id" 2>/dev/null || true)" == "true" ]] || {
      echo "ERROR: $service is not running" >&2
      return 1
    }
  done
}

if ! wait_for_health; then
  mark_failed "HEALTH_CHECK" 70 "post-restore runtime health validation failed"
  exit 70
fi

echo "Finalizing restore from live target database metadata..."
if ! compose --profile restore run --rm restore restore finalize "$run_id"; then
  mark_failed "SANITY_CHECK" 70 "restore finalization/live database compatibility check failed"
  exit 70
fi

echo
echo "Restore SUCCESS"
echo "Run ID:        $run_id"
echo "Source backup: $BACKUP_ID"
echo "Safety backup: $safety_id"
echo "Target:        $INSTALL_DIR"
