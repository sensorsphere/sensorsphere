#!/bin/bash
SCRIPT_NAME="$(basename "${BASH_SOURCE[0]}")"

ESP_IP=${1}
GATEWAY_INDEX=${2}

if [[ ! -n $ESP_IP ]] || [[ ! -n $GATEWAY_INDEX ]]; then
  echo "Usage: $SCRIPT_NAME <ESP_IP> <GATEWAY_INDEX>"
  exit 1
fi

KIND_NAME="ble-gateway-mqtt-${GATEWAY_INDEX}"
KIND_DESCRIPTION="BLE Gateway MQTT ${GATEWAY_INDEX}"

MQTT_BROKER=7.0.90.22
MQTT_PORT=1883
BOARD_ID=esp32-mhetesp32minikit

export ESP_EXTRA_VARS="$ESP_EXTRA_VARS -s GATEWAY_INDEX ${GATEWAY_INDEX} -s MQTT_BROKER ${MQTT_BROKER} -s MQTT_PORT ${MQTT_PORT}"

./esp-build.sh ble-gateway-esp32.yaml "${BOARD_ID}" "${ESP_IP}" "${KIND_NAME}" "${KIND_DESCRIPTION}"
