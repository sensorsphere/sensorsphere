#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
CONF="${SS_OD_CONFIG:-/home/ubuntu/.config/sensorsphere-onedrive/backup.conf}"
die() { echo "ERROR: $*" >&2; exit 1; }
log() { echo "[$(date -u +%FT%TZ)] $*"; }
[[ $# -ge 2 ]] || die "Usage: $0 {preflight|run|upload-existing|status|retention-plan} {DEV|DIT} [bundle-id]"
ACTION="$1"; ENV_NAME="$2"; shift 2
case "$ENV_NAME" in DEV|DIT) ;; *) die "Invalid environment" ;; esac
[[ -r "$CONF" ]] || die "Missing config $CONF"
[[ "$(stat -c %a "$CONF")" == 600 ]] || die "Config must have mode 600"
# Only source a trusted administrator-controlled config.
source "$CONF"
if [[ "$ENV_NAME" == DEV ]]; then
  INSTALL_DIR="${SS_OD_DEV_DIR:-/home/ubuntu/sensorsphere}"
else
  INSTALL_DIR="${SS_OD_DIT_DIR:-/home/ubuntu/work/sensorsphere-dit}"
fi
BUNDLES="$INSTALL_DIR/backups"
export RCLONE_CONFIG="${SS_OD_RCLONE_CONFIG:-/home/ubuntu/.config/rclone/rclone.conf}"
export RESTIC_PASSWORD_FILE="${SS_OD_PASSWORD_FILE:-/home/ubuntu/.config/sensorsphere-onedrive/restic-password}"
export RESTIC_REPOSITORY="${SS_OD_REPOSITORY:?missing repository}"
for c in restic rclone docker jq sha256sum flock df; do command -v "$c" >/dev/null || die "Missing $c"; done
[[ -r "$RCLONE_CONFIG" && -r "$RESTIC_PASSWORD_FILE" ]] || die "Credentials missing"
[[ -r "$INSTALL_DIR/.env" && -f "$INSTALL_DIR/docker-compose.yml" && -d "$BUNDLES" ]] || die "Instance missing"
mkdir -p "$(dirname "$CONF")"
exec 9>"$(dirname "$CONF")/backup-$ENV_NAME.lock"
flock -n 9 || die "Concurrent backup for $ENV_NAME"
free="$(df -Pm "$INSTALL_DIR" | awk 'NR==2 {print $4}')"
[[ "$free" =~ ^[0-9]+$ ]] || die "Cannot determine free disk"
(( free >= ${SS_OD_MIN_FREE_MB:-2048} )) || die "Insufficient free disk: $free MiB"
verify_bundle() {
  local b="$1"
  [[ -f "$b/COMPLETE" && -f "$b/checksums.sha256" && -f "$b/manifest.json" ]] || die "Incomplete bundle"
  jq -e --arg env "$ENV_NAME" '.source.environment == $env and .verification.status == "VERIFIED" and .instanceSecrets.included == false' "$b/manifest.json" >/dev/null || die "Manifest rejected"
  (cd "$b" && sha256sum -c checksums.sha256 >/dev/null) || die "Checksums failed"
}
upload_bundle() {
  local b="$1"
  verify_bundle "$b"
  log "Verified $ENV_NAME bundle $(basename "$b")"
  restic backup --host na-01 --tag sensorsphere --tag "env=$ENV_NAME" --tag "bundle=$(basename "$b")" "$b" "$INSTALL_DIR/.env"
  log "DONE: $ENV_NAME $(basename "$b") uploaded"
}
case "$ACTION" in
  preflight)
    docker compose -f "$INSTALL_DIR/docker-compose.yml" --env-file "$INSTALL_DIR/.env" config --quiet
    docker info --format "{{.ServerVersion}}" >/dev/null
    restic cat config >/dev/null
    log "PASS: preflight $ENV_NAME (free $free MiB)"
    ;;
  run)
    cd "$INSTALL_DIR"
    docker compose --profile backup run --rm --no-deps backup create --label onedrive-offsite
    b="$(find "$BUNDLES" -mindepth 1 -maxdepth 1 -type d -name '20*' | LC_ALL=C sort | tail -1)"
    [[ -n "$b" ]] || die "No bundle created"
    upload_bundle "$b"
    ;;
  upload-existing)
    id="${1:-}"
    [[ "$id" =~ ^[0-9]{8}T[0-9]{6}Z-[[:xdigit:]]{8}$ ]] || die "Invalid bundle ID"
    upload_bundle "$BUNDLES/$id"
    ;;
  status)
    restic snapshots --tag "env=$ENV_NAME"
    ;;
  retention-plan)
    restic forget --dry-run --group-by host --tag "env=$ENV_NAME" --keep-daily "${SS_OD_KEEP_DAILY:-7}" --keep-weekly "${SS_OD_KEEP_WEEKLY:-4}" --keep-monthly "${SS_OD_KEEP_MONTHLY:-6}"
    ;;
  *) die "Unknown action $ACTION" ;;
esac
