## Prerequisites

- Docker
- Docker Compose plugin
- Git (optionnel)

Node.js et pnpm are not needed on the dev machine

## Getting started

```bash
## Getting started for Production

```sh

# Create your own env
cp .env.example .env

# edit the necssary env. vars. according to your context

docker compose config \
    && docker compose build \
    && docker compose up -d \
    && docker compose ps

# all containers should be "Up"
docker compose logs

./infos.sh

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

## Stop all

```bash
docker compose down

```

TimescaleDB and Mosquitto data are persited in `data/*`.
