#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ESP_IP=10.0.10.132
GATEWAY_INDEX=12
SENSORS_FILE=lywsdcgq-sensors-all

export LOGGER_LEVEL=DEBUG

export ESP_EXTRA_VARS=""
export ESP_EXTRA_VARS="$ESP_EXTRA_VARS -s SENSORS_FILE ${SENSORS_FILE}"

${SCRIPT_DIR}/esp-build-ble-gateway-gen.sh ${ESP_IP} ${GATEWAY_INDEX}
