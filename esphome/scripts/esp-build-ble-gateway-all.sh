#!/bin/bash
SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

INDEXES=(
  01
  02
  03
  04
  12
)

for INDEX in "${INDEXES[@]}"; do
  SCRIPT="${SCRIPT_DIR}/esp-build-ble-gateway-${INDEX}.sh"
  if [[ -f "${SCRIPT}" ]]; then
    echo "Executing ${SCRIPT}..."
    bash "${SCRIPT}"
  else
    echo "Script ${SCRIPT} not found."
  fi
done
