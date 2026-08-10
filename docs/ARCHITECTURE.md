# Architecture

## Flux

ESP32 -> Mosquitto local -> bridge MQTT/Tailscale -> Mosquitto VPS
-> mqtt-ingestor -> TimescaleDB -> API -> Frontend.

## Réseaux

- MQTT VPS : 100.64.0.8:1883
- TimescaleDB : réseau Docker interne uniquement
- API : réseau Docker interne
- Web : exposé via Nginx
