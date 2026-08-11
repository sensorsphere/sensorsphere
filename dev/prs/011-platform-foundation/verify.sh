#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"

cd "${ROOT_DIR}"

echo "Verifying PR-011 — Platform Foundation revision 2"

./dev/tools/pr info 011 >/dev/null

for f in \
  CHANGELOG.md \
  docs/roadmap.md \
  docs/architecture/vision.md \
  docs/architecture/dev-workflow.md \
  docs/architecture/api-guidelines.md
do
  [[ -s "${f}" ]] || {
    echo "ERROR: Missing ${f}" >&2
    exit 1
  }
done

docker compose config >/dev/null

curl --fail --silent "${BASE_URL}/api/health" >/dev/null
curl --fail --silent "${BASE_URL}/api/v1/sensors" >/dev/null
curl --fail --silent "${BASE_URL}/api/v1/measurements/latest" >/dev/null

echo "PR-011 revision 2 verification passed."
