## Tests Alerts

```sh
MQTT_HOST=100.64.0.9
MQTT_PORT=1883
TOPIC_BASE="sensors/ble_gateway/sensor"
DEVICE_ADDR="11_22_33"

```

```sh
HUMIDITY_VALUE="38"
TEMPERATURE_VALUE="28.2"
```

```sh
docker run -it --rm eclipse-mosquitto:latest sh -c "
mosquitto_pub -h ${MQTT_HOST} -p ${MQTT_PORT} -t '${TOPIC_BASE}/humidity_${DEVICE_ADDR}/state' -m '${HUMIDITY_VALUE}$'
mosquitto_pub -h ${MQTT_HOST} -p ${MQTT_PORT} -t '${TOPIC_BASE}/temperature_${DEVICE_ADDR}/state' -m '${TEMPERATURE_VALUE}'
"

```

```txt
mosquitto_pub -h ${MQTT_HOST} -p ${MQTT_PORT} -t '${TOPIC_BASE}/battery_level_${DEVICE_ADDR}/state' -m '94'
mosquitto_pub -h ${MQTT_HOST} -p ${MQTT_PORT} -t '${TOPIC_BASE}/battery_voltage_${DEVICE_ADDR}/state' -m '3.058'
mosquitto_pub -h ${MQTT_HOST} -p ${MQTT_PORT} -t '${TOPIC_BASE}/rssi_${DEVICE_ADDR}/state' -m '-81'

```