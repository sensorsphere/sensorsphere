#!/usr/bin/env bash
set -euo pipefail

REPOSITORY="${SENSORSPHERE_REPOSITORY:-sensorsphere/sensorsphere}"
ACTION="${ACTION:-install}"
VERSION="${VERSION:-}"
INSTALL_DIR="${INSTALL_DIR:-${SENSORSPHERE_INSTALL_DIR:-/opt/sensorsphere}}"
RELEASE_BASE_URL="${SENSORSPHERE_RELEASE_BASE_URL:-https://github.com/${REPOSITORY}/releases/download}"
PURGE_DATA="${PURGE_DATA:-false}"

die() { echo "ERROR: $*" >&2; exit 1; }
require() { command -v "$1" >/dev/null 2>&1 || die "$1 is required"; }

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

bool_true() { [[ "${1,,}" =~ ^(1|true|yes|on)$ ]]; }

usage() {
  cat <<'USAGE'
SensorSphere bootstrap installer

Environment variables:
  ACTION=install|update|rollback|remove|status   Default: install
  VERSION=<stack-release>                       Required for install/update
  INSTALL_DIR=/opt/sensorsphere                 Optional
  SENSORSPHERE_ENVIRONMENT=FIT                  Optional runtime setting
  INSTANCE_NAME='SensorSphere [FIT]'            Optional runtime setting
  WEB_PORT=8080                                 Optional runtime setting
  MQTT_PORT=1883                                Optional runtime setting
  SENSORSPHERE_PROJECT_TODOS_ENABLED=false      Optional runtime setting

Authentication settings are forwarded when supplied, including:
  SENSORSPHERE_AUTH_ENABLED
  SENSORSPHERE_AUTH_PROVIDERS
  SENSORSPHERE_AUTH_BOOTSTRAP_ADMIN_EMAIL
  SENSORSPHERE_PUBLIC_URL
  SENSORSPHERE_GOOGLE_CLIENT_ID
  SENSORSPHERE_GOOGLE_CLIENT_SECRET
  SENSORSPHERE_MICROSOFT_CLIENT_ID
  SENSORSPHERE_MICROSOFT_CLIENT_SECRET
  SENSORSPHERE_MICROSOFT_TENANT

Authentication defaults:
  DEV                         Authentication may be explicitly disabled
  non-DEV                     Authentication defaults to enabled and cannot be disabled

Removal:
  ACTION=remove                                 Remove containers/networks, preserve data/config
  ACTION=remove PURGE_DATA=true                 Also delete INSTALL_DIR after containers stop
USAGE
}

download_bundle() {
  [[ -n "$VERSION" ]] || die "VERSION is required for ACTION=$ACTION"
  require sha256sum
  require tar

  local tmp base archive checksum bundle
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  base="$RELEASE_BASE_URL/stack-$VERSION"
  archive="sensorsphere-$VERSION.tar.gz"
  checksum="$archive.sha256"

  echo "Downloading SensorSphere Stack Release $VERSION..."
  download "$base/$archive" "$tmp/$archive"
  download "$base/$checksum" "$tmp/$checksum"
  (cd "$tmp" && sha256sum -c "$checksum")
  tar -xzf "$tmp/$archive" -C "$tmp"
  bundle="$tmp/sensorsphere-$VERSION"
  [[ -x "$bundle/install.sh" ]] || die "downloaded bundle does not contain install.sh"

  run_distribution "$bundle"
  trap - RETURN
  rm -rf "$tmp"
}

run_distribution() {
  local bundle="$1"
  local command="$ACTION"
  if [[ "$ACTION" == "install" && -f "$INSTALL_DIR/.installed" ]]; then
    command="update"
    echo "Existing SensorSphere installation detected; switching install to update."
  fi

  "$bundle/install.sh" "$command" --install-dir "$INSTALL_DIR" --stack "$VERSION"
}

run_installed_action() {
  [[ -x "$INSTALL_DIR/install.sh" ]] || die "SensorSphere installation not found: $INSTALL_DIR"
  "$INSTALL_DIR/install.sh" "$ACTION" --install-dir "$INSTALL_DIR"
}

remove_installation() {
  [[ -x "$INSTALL_DIR/install.sh" ]] || die "SensorSphere installation not found: $INSTALL_DIR"
  "$INSTALL_DIR/install.sh" remove --install-dir "$INSTALL_DIR"
  if bool_true "$PURGE_DATA"; then
    case "$INSTALL_DIR" in
      ""|"/"|"/opt"|"/home"|"/usr"|"/var")
        die "refusing to purge unsafe INSTALL_DIR: $INSTALL_DIR"
        ;;
    esac
    [[ -f "$INSTALL_DIR/.env" ]] || die "refusing to purge directory without a SensorSphere .env: $INSTALL_DIR"
    echo "Purging $INSTALL_DIR"
    rm -rf "$INSTALL_DIR"
  else
    echo "Data and configuration preserved in $INSTALL_DIR"
  fi
}

case "$ACTION" in
  install|update) download_bundle ;;
  rollback|status) run_installed_action ;;
  remove) remove_installation ;;
  help|-h|--help) usage ;;
  *) usage >&2; die "unsupported ACTION: $ACTION" ;;
esac
