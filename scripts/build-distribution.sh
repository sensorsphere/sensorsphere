#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

[[ $# -eq 1 ]] || {
  echo "Usage: scripts/build-distribution.sh <stack-release.yaml>" >&2
  exit 2
}

MANIFEST="$1"
scripts/validate-stack-release.sh --source "$MANIFEST"

STACK_VERSION="$(awk '$1 == "stackVersion:" { print $2; exit }' "$MANIFEST")"
[[ -n "$STACK_VERSION" ]] || { echo "ERROR: stackVersion is missing" >&2; exit 1; }

DIST_DIR="$ROOT_DIR/dist"
STAGE_DIR="$DIST_DIR/sensorsphere-$STACK_VERSION"
ARCHIVE="$DIST_DIR/sensorsphere-$STACK_VERSION.tar.gz"

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

cp -a distribution/. "$STAGE_DIR/"
cp "$MANIFEST" "$STAGE_DIR/stack-release.yaml"
cp "$MANIFEST" "$STAGE_DIR/$STACK_VERSION.yaml"

rm -f "$ARCHIVE" "$ARCHIVE.sha256"
tar -C "$DIST_DIR" -czf "$ARCHIVE" "sensorsphere-$STACK_VERSION"
sha256sum "$ARCHIVE" > "$ARCHIVE.sha256"

echo "Distribution: $ARCHIVE"
echo "Checksum:     $ARCHIVE.sha256"
