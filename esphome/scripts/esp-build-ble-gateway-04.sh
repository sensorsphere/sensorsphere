#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ESP_IP=10.0.10.124
GATEWAY_INDEX=04

export LOGGER_LEVEL=DEBUG

${SCRIPT_DIR}/esp-build-ble-gateway-gen.sh ${ESP_IP} ${GATEWAY_INDEX}
