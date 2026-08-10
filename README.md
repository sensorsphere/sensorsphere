# IoT Platform

Plateforme IoT conteneurisée pour :

ESP32/BLE -> Mosquitto local -> Bridge MQTT/Tailscale -> Mosquitto VPS
-> mqtt-ingestor -> TimescaleDB -> API -> Frontend.

## Prérequis sur le VPS

Uniquement :

- Docker
- Docker Compose plugin
- Git (optionnel)

Node.js et pnpm ne sont pas nécessaires sur le VPS.

## Premier démarrage

```bash
cp .env.example .env
nano .env
docker compose config
docker compose build
docker compose up -d
docker compose ps
```

## Logs

```bash
docker compose logs -f mosquitto
docker compose logs -f mqtt-ingestor
docker compose logs -f api
```

## Check health

```bash
# check if received MQTT messages are properly parsed and inserted in DB
docker compose logs -f mqtt-ingestor

# Check if API server is available
curl http://127.0.0.1:8080/api/health

curl http://127.0.0.1:8080/api/sensors



```

## Arrêt

```bash
docker compose down
```

Les données TimescaleDB et Mosquitto sont conservées dans `infrastructure/*/data`.
