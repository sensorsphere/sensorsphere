#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CLI="${ROOT_DIR}/dev/bin/sensorsphere"
TMP_DIR="$(mktemp -d)"

trap 'rm -rf "${TMP_DIR}"' EXIT

cd "${ROOT_DIR}"

echo "Verifying PR-014 — Snapshot Engine"

"${CLI}" version >/dev/null

"${CLI}" snapshot create "${TMP_DIR}"

SNAPSHOT="$(
  find "${TMP_DIR}" \
    -maxdepth 1 \
    -type f \
    -name 'sensorsphere-snapshot-*.tar.gz' \
    | head -n1
)"

[[ -n "${SNAPSHOT}" ]] || {
  echo "ERROR: Snapshot was not created." >&2
  exit 1
}

"${CLI}" snapshot inspect "${SNAPSHOT}"

if tar -tzf "${SNAPSHOT}" | grep -Eq '(^|/)\.env($|\.)'; then
  echo "ERROR: Snapshot contains an .env file." >&2
  exit 1
fi

if tar -tzf "${SNAPSHOT}" | grep -Eq '/node_modules/|/timescaledb/data/|/mosquitto/data/|/dev/bin/'; then
  echo "ERROR: Snapshot contains excluded runtime/build data." >&2
  exit 1
fi

echo
echo "PR-014 verification passed."
