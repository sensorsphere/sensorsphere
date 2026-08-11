#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

cd "${ROOT_DIR}"

echo "Verifying PR-015 — Product Foundation"

for file in \
  docs/project/constitution.md \
  docs/roadmap/master-plan-v1.0.md \
  docs/adr/ADR-0001-project-principles.md \
  docs/rfc/RFC-0001-device-domain.md \
  docs/development/contribution-conventions.md
do
  [[ -s "${file}" ]] || {
    echo "ERROR: Missing or empty ${file}" >&2
    exit 1
  }
done

grep -q "Asset" docs/rfc/RFC-0001-device-domain.md
grep -q "Metric" docs/rfc/RFC-0001-device-domain.md
grep -q "Measurement" docs/rfc/RFC-0001-device-domain.md

sensorsphere doctor >/dev/null

echo "PR-015 verification passed."
