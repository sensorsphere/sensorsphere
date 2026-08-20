#!/bin/bash

set -e

if [ $# -ne 2 ]; then
    echo "Usage: $0 <ESP_IP> <firmware.ota.bin>"
    echo
    echo "Example:"
    echo "  $0 192.168.1.50 firmware.ota.bin"
    exit 1
fi

ESP_IP="$1"
FIRMWARE="$2"

if [ ! -f "$FIRMWARE" ]; then
    echo "ERROR: Firmware not found: $FIRMWARE"
    exit 1
fi

echo "======================================"
echo " ESPHome OTA Update"
echo "======================================"
echo "Device   : $ESP_IP"
echo "Firmware : $FIRMWARE"
echo "Size     : $(du -h "$FIRMWARE" | cut -f1)"
echo

echo "Checking device..."

if ! ping -c 1 -W 2 "$ESP_IP" >/dev/null 2>&1; then
    echo "ERROR: Device $ESP_IP is unreachable"
    exit 1
fi

echo "Device reachable."
echo
echo "Uploading firmware..."

curl \
    --user "${USER}:${PASSWORD}" \
    --fail \
    --show-error \
    --progress-bar \
    -X POST \
    -F "file=@${FIRMWARE}" \
    "http://${ESP_IP}/update"

echo
echo "OTA upload completed."
echo "Waiting for ESP32 reboot..."

sleep 5

for i in $(seq 1 30); do
    if ping -c 1 -W 1 "$ESP_IP" >/dev/null 2>&1; then
        echo
        echo "SUCCESS: ESP32 is back online."
        exit 0
    fi

    printf "."
    sleep 1
done

echo
echo "WARNING: ESP32 did not respond after 30 seconds."
exit 2