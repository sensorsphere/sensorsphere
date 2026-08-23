## build

```bash
# Build Frontend and Restart w/ new build
docker compose build frontend && docker compose up -d frontend


# Build API
docker compose build api
# Restart w/ new build
docker compose up -d api

# Build Service
docker compose build ingestion-service

```

## Port forwarding

```bash
# Create local port forwarding
printf "\033]81;L=:8080::8080#Proxy on 8080 for IOT-Platform Dashboard\007"

```

## Deploy Dev Env

```sh
# cp .env.example .env
docker compose build --no-cache --pull
docker compose up -d
docker compose logs --no-color \
  | grep -Ei \
  'error|fatal|panic|exception|failed' \
  || true

# Re exec migrations
docker compose run --rm migrations

# Check
docker compose exec -T timescaledb \
  psql \
    -U iot_app \
    -d iot \
    -c "
      SELECT version, filename
      FROM public.schema_migrations
      ORDER BY version;
    "

docker compose exec -T timescaledb \
  psql \
    -U iot_app \
    -d iot \
    -c "
      SELECT 'assets' AS table_name, count(*) FROM assets
      UNION ALL
      SELECT 'sensors', count(*) FROM sensors
      UNION ALL
      SELECT 'observations', count(*) FROM observations
      UNION ALL
      SELECT 'alert_rules', count(*) FROM alert_rules;
    "

```

## Diags / Logs

```sh
docker compose logs --since 2m --no-color   | grep -Ei   'error|fatal|panic|exception|failed'   || true
```

# Patch commands

Apply a patch from Windows Machine

```powershell
scp ubuntu@100.64.0.8  "cd /home/ubuntu/sensorsphere; tar czf /tmp/PR-047-sources.tar.gz apps/frontend/src/GatewayCoveragePanel.tsx apps/frontend/src/MetricRoutingPanel.tsx"

```

Request a baseline/source code

```powershell
ssh ubuntu@100.64.0.8 "cd /home/ubuntu/sensorsphere; tar czf /tmp/PR-XXX-sources.tar.gz <fichiers...>"

scp ubuntu@100.64.0.8:/tmp/PR-XXX-sources.tar.gz C:\Users\fabri\Downloads

```

# MQTT Topics

```txt
sensors/ble_gateway/{gateway_id}/sensor/{metric}_{sensor_uid}/state

```