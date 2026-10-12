#!/usr/bin/env bash
set -euo pipefail

RELEASE_BASE_URL="${SENSORSPHERE_RELEASE_BASE_URL:-https://github.com/sensorsphere/sensorsphere/releases/download}"
MODE=""
BUNDLE_PATH=""
INSTALL_DIR=""
ENV_FILE=""
PREVIEW_ONLY=0
UNATTENDED=0
CONFIRMATION=""

die() { echo "ERROR: $*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
SensorSphere Full Recovery bootstrap

Usage:
  ./recover.sh --full <recovery-bundle-path> --install-dir <new-install-dir> --env-file <recovery.env> [options]

Options:
  --full <path>             Recovery Bundle directory to restore.
  --install-dir <path>      New SensorSphere installation directory.
  --env-file <path>         Operator-supplied recovery configuration/secrets.
  --release-base-url <url>  Stack Release base URL. Defaults to GitHub releases.
  --preflight-only          Validate bundle/release/config and print the plan only.
  --unattended              Do not prompt interactively.
  --confirm <phrase>        Required with --unattended for execution.
  -h, --help                Show this help.

The Recovery Bundle intentionally does not contain instance secrets. The
operator env file supplies secrets and deployment-specific settings. Values
already present in that file take precedence over non-secret identity defaults
captured in the backup.

Confirmation phrase:
  FULL RESTORE <backup-id> INTO <absolute-install-dir>
USAGE
}

download() {
  local url="$1" destination="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$destination"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$destination" "$url"
  else
    die "curl or wget is required"
  fi
}

env_value() {
  local file="$1" key="$2"
  sed -n "s/^${key}=//p" "$file" | tail -1
}

set_env_default() {
  local file="$1" key="$2" value="$3"
  if ! grep -q "^${key}=" "$file"; then
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

safe_absolute_dir() {
  local path="$1"
  [[ "$path" = /* ]] || return 1
  case "$path" in
    /|/bin|/boot|/dev|/etc|/home|/lib|/lib64|/opt|/proc|/root|/run|/sbin|/srv|/sys|/tmp|/usr|/var)
      return 1
      ;;
  esac
  return 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --full)
      [[ $# -ge 2 ]] || die "--full requires a Recovery Bundle path"
      [[ -z "$MODE" ]] || die "restore mode was already specified"
      MODE="full"
      BUNDLE_PATH="$2"
      shift 2
      ;;
    --install-dir)
      [[ $# -ge 2 ]] || die "--install-dir requires a path"
      INSTALL_DIR="$2"
      shift 2
      ;;
    --env-file)
      [[ $# -ge 2 ]] || die "--env-file requires a path"
      ENV_FILE="$2"
      shift 2
      ;;
    --release-base-url)
      [[ $# -ge 2 ]] || die "--release-base-url requires a URL"
      RELEASE_BASE_URL="$2"
      shift 2
      ;;
    --preflight-only)
      PREVIEW_ONLY=1
      shift
      ;;
    --unattended)
      UNATTENDED=1
      shift
      ;;
    --confirm)
      [[ $# -ge 2 ]] || die "--confirm requires a phrase"
      CONFIRMATION="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown option: $1"
      ;;
  esac
done

[[ "$MODE" == "full" ]] || { usage >&2; die "--full is required"; }
[[ -n "$BUNDLE_PATH" ]] || die "Recovery Bundle path is required"
[[ -n "$INSTALL_DIR" ]] || die "--install-dir is required"
[[ -n "$ENV_FILE" ]] || die "--env-file is required"
command -v jq >/dev/null 2>&1 || die "jq is required"
command -v sha256sum >/dev/null 2>&1 || die "sha256sum is required"
command -v tar >/dev/null 2>&1 || die "tar is required"
command -v docker >/dev/null 2>&1 || die "docker is required"

BUNDLE_PATH="$(readlink -f "$BUNDLE_PATH")"
ENV_FILE="$(readlink -f "$ENV_FILE")"
safe_absolute_dir "$INSTALL_DIR" || die "unsafe or non-absolute install directory: $INSTALL_DIR"
INSTALL_DIR="$(readlink -m "$INSTALL_DIR")"

[[ -d "$BUNDLE_PATH" ]] || die "Recovery Bundle directory not found: $BUNDLE_PATH"
[[ -f "$ENV_FILE" ]] || die "operator env file not found: $ENV_FILE"
[[ -r "$ENV_FILE" ]] || die "operator env file is not readable: $ENV_FILE"

for required in COMPLETE manifest.json checksums.sha256 instance/installation.json instance/stack-release.yaml; do
  [[ -f "$BUNDLE_PATH/$required" ]] || die "Recovery Bundle is missing $required"
done

(
  cd "$BUNDLE_PATH"
  sha256sum -c checksums.sha256 >/dev/null
) || die "Recovery Bundle checksum verification failed"

BACKUP_ID="$(jq -r '.backupId // empty' "$BUNDLE_PATH/manifest.json")"
VERIFY_STATUS="$(jq -r '.verification.status // empty' "$BUNDLE_PATH/manifest.json")"
STACK_VERSION="$(jq -r '.stack.stackVersion // empty' "$BUNDLE_PATH/manifest.json")"
SOURCE_ENVIRONMENT="$(jq -r '.environment // empty' "$BUNDLE_PATH/instance/installation.json")"
SOURCE_INSTANCE_NAME="$(jq -r '.instanceName // empty' "$BUNDLE_PATH/instance/installation.json")"
SOURCE_COMPOSE_PROJECT="$(jq -r '.composeProject // empty' "$BUNDLE_PATH/instance/installation.json")"
SOURCE_STACK_VERSION="$(jq -r '.stackVersion // empty' "$BUNDLE_PATH/instance/installation.json")"
SECRETS_INCLUDED="$(jq -r '.instanceSecrets.included // false' "$BUNDLE_PATH/manifest.json")"
MARKER_BACKUP_ID="$(sed -n 's/^backupId=//p' "$BUNDLE_PATH/COMPLETE" | tail -1)"
MANIFEST_STACK_VERSION="$(awk '$1 == "stackVersion:" {print $2; exit}' "$BUNDLE_PATH/instance/stack-release.yaml")"

[[ -n "$BACKUP_ID" && "$BACKUP_ID" != "null" ]] || die "Recovery Bundle backupId is missing"
[[ "$VERIFY_STATUS" == "VERIFIED" ]] || die "Recovery Bundle is not marked VERIFIED"
[[ "$MARKER_BACKUP_ID" == "$BACKUP_ID" ]] || die "COMPLETE marker backupId does not match manifest"
[[ -n "$STACK_VERSION" ]] || die "Recovery Bundle Stack version is missing"
[[ "$SOURCE_STACK_VERSION" == "$STACK_VERSION" ]] || die "installation.json Stack version does not match manifest"
[[ "$MANIFEST_STACK_VERSION" == "$STACK_VERSION" ]] || die "stack-release.yaml Stack version does not match manifest"
[[ -n "$SOURCE_ENVIRONMENT" && -n "$SOURCE_INSTANCE_NAME" && -n "$SOURCE_COMPOSE_PROJECT" ]] || die "Recovery Bundle source identity is incomplete"

if [[ -e "$INSTALL_DIR/.installed" ]]; then
  die "target already contains a SensorSphere installation: $INSTALL_DIR"
fi
if [[ -d "$INSTALL_DIR" ]] && find "$INSTALL_DIR" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
  die "target install directory is not empty: $INSTALL_DIR"
fi

TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

ARCHIVE="sensorsphere-$STACK_VERSION.tar.gz"
CHECKSUM="$ARCHIVE.sha256"
BASE="$RELEASE_BASE_URL/stack-$STACK_VERSION"

echo "Validating exact Stack Release $STACK_VERSION..."
download "$BASE/$ARCHIVE" "$TMP/$ARCHIVE"
download "$BASE/$CHECKSUM" "$TMP/$CHECKSUM"
(cd "$TMP" && sha256sum -c "$CHECKSUM" >/dev/null) || die "Stack Release archive checksum verification failed"
tar -xzf "$TMP/$ARCHIVE" -C "$TMP"
RELEASE_DIR="$TMP/sensorsphere-$STACK_VERSION"
[[ -x "$RELEASE_DIR/install.sh" ]] || die "Stack Release bundle does not contain install.sh"
[[ -x "$RELEASE_DIR/restore.sh" ]] || die "Stack Release bundle does not contain restore.sh"
[[ -f "$RELEASE_DIR/stack-release.yaml" ]] || die "Stack Release bundle does not contain stack-release.yaml"
cmp -s "$RELEASE_DIR/stack-release.yaml" "$BUNDLE_PATH/instance/stack-release.yaml" || die "downloaded Stack Release manifest does not exactly match the Recovery Bundle"

echo "Checking Stack Release image availability..."
mapfile -t release_images < <(
  {
    awk '$1 == "image:" {print $2}' "$RELEASE_DIR/stack-release.yaml"
    awk '$1 == "image:" && $2 !~ /\$\{/ {print $2}' "$RELEASE_DIR/docker-compose.yml"
  } | sort -u
)
for image in "${release_images[@]}"; do
  [[ -n "$image" ]] || continue
  if ! docker manifest inspect "$image" >/dev/null 2>&1; then
    die "required Stack Release image is unavailable from its registry: $image"
  fi
  echo "  AVAILABLE $image"
done

CONFIRM_EXPECTED="FULL RESTORE $BACKUP_ID INTO $INSTALL_DIR"

cat <<PLAN
SensorSphere Full Recovery Plan

Backup ID........... $BACKUP_ID
Source instance...... $SOURCE_INSTANCE_NAME
Source environment... $SOURCE_ENVIRONMENT
Source project....... $SOURCE_COMPOSE_PROJECT
Stack Release........ $STACK_VERSION
Target install....... $INSTALL_DIR
Secrets in backup.... $SECRETS_INCLUDED
Operator env file.... $ENV_FILE
Release source....... $BASE
Confirmation......... $CONFIRM_EXPECTED

Execution will:
  1. create a new installation from the exact Stack Release;
  2. seed source logical identity unless overridden in the operator env file;
  3. copy the verified Recovery Bundle into the new backup repository;
  4. run the accepted data-restore workflow, including a target safety backup;
  5. retain the reconstructed installation and restore run-state.
PLAN

if [[ "$PREVIEW_ONLY" -eq 1 ]]; then
  echo
  echo "Preflight READY. No target mutation was performed."
  exit 0
fi

if [[ "$UNATTENDED" -eq 1 ]]; then
  [[ "$CONFIRMATION" == "$CONFIRM_EXPECTED" ]] || die "unattended confirmation does not match expected phrase"
else
  echo
  echo "Type exactly:"
  echo "  $CONFIRM_EXPECTED"
  if ! read -r entered; then
    echo "Full recovery cancelled; no target installation was created."
    exit 40
  fi
  [[ "$entered" == "$CONFIRM_EXPECTED" ]] || {
    echo "Full recovery cancelled; no target installation was created."
    exit 40
  }
fi

mkdir -p "$INSTALL_DIR"
cp "$ENV_FILE" "$INSTALL_DIR/.env"
chmod 0600 "$INSTALL_DIR/.env"
if ! grep -q '^POSTGRES_PASSWORD=' "$INSTALL_DIR/.env"; then
  password="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
  printf 'POSTGRES_PASSWORD=%s\n' "$password" >> "$INSTALL_DIR/.env"
fi
set_env_default "$INSTALL_DIR/.env" SENSORSPHERE_ENVIRONMENT "$SOURCE_ENVIRONMENT"
set_env_default "$INSTALL_DIR/.env" INSTANCE_NAME "$SOURCE_INSTANCE_NAME"
set_env_default "$INSTALL_DIR/.env" COMPOSE_PROJECT_NAME "$SOURCE_COMPOSE_PROJECT"

echo
echo "Installing exact Stack Release $STACK_VERSION..."
"$RELEASE_DIR/install.sh" install   --install-dir "$INSTALL_DIR"   --stack "$STACK_VERSION"   --manifest "$BUNDLE_PATH/instance/stack-release.yaml"

TARGET_BACKUP_ROOT="$(env_value "$INSTALL_DIR/.env" SENSORSPHERE_BACKUP_ROOT)"
TARGET_BACKUP_ROOT="${TARGET_BACKUP_ROOT:-./backups}"
if [[ "$TARGET_BACKUP_ROOT" != /* ]]; then
  TARGET_BACKUP_ROOT="$INSTALL_DIR/${TARGET_BACKUP_ROOT#./}"
fi
mkdir -p "$TARGET_BACKUP_ROOT"
DEST_BUNDLE="$TARGET_BACKUP_ROOT/$BACKUP_ID"
[[ ! -e "$DEST_BUNDLE" ]] || die "target backup repository already contains $BACKUP_ID"
cp -a "$BUNDLE_PATH" "$DEST_BUNDLE"

TARGET_INSTANCE_NAME="$(env_value "$INSTALL_DIR/.env" INSTANCE_NAME)"
TARGET_INSTANCE_NAME="${TARGET_INSTANCE_NAME:-$SOURCE_INSTANCE_NAME}"
DATA_CONFIRMATION="RESTORE $BACKUP_ID INTO $TARGET_INSTANCE_NAME"

echo
echo "Restoring Recovery Bundle into the new installation..."
"$INSTALL_DIR/restore.sh" --data "$BACKUP_ID" --unattended --confirm "$DATA_CONFIRMATION"

echo
"$INSTALL_DIR/install.sh" status --install-dir "$INSTALL_DIR"

echo
echo "Full recovery SUCCESS"
echo "Backup ID:     $BACKUP_ID"
echo "Stack Release: $STACK_VERSION"
echo "Install dir:   $INSTALL_DIR"
