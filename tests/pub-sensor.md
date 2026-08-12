## MQTT messages

### Xiaomi Temperature/Humidity Sensor

```txt
sensors/ble_gateway/sensor/humidity_11_22_33/state 38
sensors/ble_gateway/sensor/battery_level_11_22_33/state 94
sensors/ble_gateway/sensor/battery_voltage_11_22_33/state 3.058
sensors/ble_gateway/sensor/rssi_11_22_33/state -81
sensors/ble_gateway/sensor/temperature_11_22_33/state 28.2
```

```sh
docker exec mosquitto sh -c "
mosquitto_pub -h localhost -t 'sensors/ble_gateway/sensor/humidity_11_22_33/state' -m '38'
mosquitto_pub -h localhost -t 'sensors/ble_gateway/sensor/battery_level_11_22_33/state' -m '94'
mosquitto_pub -h localhost -t 'sensors/ble_gateway/sensor/battery_voltage_11_22_33/state' -m '3.058'
mosquitto_pub -h localhost -t 'sensors/ble_gateway/sensor/rssi_11_22_33/state' -m '-81'
mosquitto_pub -h localhost -t 'sensors/ble_gateway/sensor/temperature_11_22_33/state' -m '28.2'
"
```