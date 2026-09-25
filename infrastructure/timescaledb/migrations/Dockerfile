ARG TIMESCALEDB_BASE_IMAGE=timescale/timescaledb:2.21.3-pg17
FROM ${TIMESCALEDB_BASE_IMAGE}

COPY infrastructure/timescaledb/migrations /migrations
COPY tools/database/sensorsphere-migrate.sh /usr/local/bin/sensorsphere-migrate

RUN chmod 0755 /usr/local/bin/sensorsphere-migrate

ENV MIGRATIONS_DIR=/migrations

ENTRYPOINT ["/bin/sh", "/usr/local/bin/sensorsphere-migrate"]
