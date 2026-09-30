#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INSTALLER="$ROOT_DIR/distribution/install.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

TEST_INSTALLER_DIR="$TMP_DIR/current-install"
mkdir -p "$TEST_INSTALLER_DIR"
TEST_INSTALLER="$TEST_INSTALLER_DIR/install.sh"

sed '/^case "$COMMAND" in$/,$c\printf "%s\\n" "$INSTALL_DIR"' "$INSTALLER" > "$TEST_INSTALLER"
chmod +x "$TEST_INSTALLER"

assert_eq() {
  local expected="$1" actual="$2" label="$3"
  if [[ "$actual" != "$expected" ]]; then
    printf 'FAIL: %s\n  expected: %s\n  actual:   %s\n' "$label" "$expected" "$actual" >&2
    exit 1
  fi
  printf 'PASS: %s\n' "$label"
}

actual="$("$TEST_INSTALLER" update --stack 2099.01.01.1)"
assert_eq "$TEST_INSTALLER_DIR" "$actual" "update without --install-dir uses install.sh directory"

EXPLICIT_DIR="$TMP_DIR/explicit"
actual="$("$TEST_INSTALLER" update --stack 2099.01.01.1 --install-dir "$EXPLICIT_DIR")"
assert_eq "$EXPLICIT_DIR" "$actual" "explicit --install-dir remains authoritative"

actual="$(SENSORSPHERE_INSTALL_DIR="$TMP_DIR/env-dir" "$TEST_INSTALLER" update --stack 2099.01.01.1)"
assert_eq "$TEST_INSTALLER_DIR" "$actual" "update without --install-dir prefers install.sh directory over environment default"

actual="$(SENSORSPHERE_INSTALL_DIR="$TMP_DIR/env-dir" "$TEST_INSTALLER" install --stack 2099.01.01.1)"
assert_eq "$TMP_DIR/env-dir" "$actual" "install action keeps SENSORSPHERE_INSTALL_DIR behavior"

echo "All install-dir resolution tests passed."
