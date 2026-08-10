#!/usr/bin/env sh
set -eu

mkdir -p backups
STAMP=$(date +%Y%m%d-%H%M%S)

docker compose exec -T timescaledb \
  pg_dump -U "${POSTGRES_USER:-iot_app}" "${POSTGRES_DB:-iot}" \
  | gzip > "backups/iot-${STAMP}.sql.gz"

echo "Backup: backups/iot-${STAMP}.sql.gz"
