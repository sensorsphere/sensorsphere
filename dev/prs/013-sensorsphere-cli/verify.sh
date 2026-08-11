#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CLI="${ROOT_DIR}/dev/bin/sensorsphere"

cd "${ROOT_DIR}"

echo "Verifying PR-013 — SensorSphere CLI revision 2"

[[ -x "${CLI}" ]]

OWNER_UID="$(stat -c '%u' "${CLI}")"
OWNER_GID="$(stat -c '%g' "${CLI}")"

[[ "${OWNER_UID}" == "$(id -u)" ]] || {
  echo "ERROR: CLI binary UID is ${OWNER_UID}, expected $(id -u)." >&2
  exit 1
}

[[ "${OWNER_GID}" == "$(id -g)" ]] || {
  echo "ERROR: CLI binary GID is ${OWNER_GID}, expected $(id -g)." >&2
  exit 1
}

"${CLI}" version
"${CLI}" pr info 013 >/dev/null
"${CLI}" db status >/dev/null
"${CLI}" doctor

echo
echo "PR-013 revision 2 verification passed."
