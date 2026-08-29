#!/bin/bash

source .env && \
docker compose ps nginx >/dev/null 2>&1 && \
HTTP_PORT=$(docker compose port nginx 80 | awk -F: '{print $NF}') && \
MQTT_PORT=$(docker compose port mosquitto 1883 | awk -F: '{print $NF}') && \
IPS=$(ip -4 -o addr show scope global | \
    awk '$2 !~ /^(docker[0-9]*|br-|veth)/ {split($4,a,"/"); print a[1]}') && \
echo && \
echo "╭──────────────────────────────────────────────╮" && \
echo "│          SensorSphere is running             │" && \
echo "╰──────────────────────────────────────────────╯" && \
echo && \
echo "  Web UI" && \
for IP in $IPS; do
    echo "    ➜ http://${IP}:${HTTP_PORT}"
done && \
echo && \
echo "  MQTT" && \
for IP in $IPS; do
    echo "    ➜ mqtt://${IP}:${MQTT_PORT} [IP:${IP} / PORT:${MQTT_PORT}]"
done && \
echo
