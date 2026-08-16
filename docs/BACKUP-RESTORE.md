# SensorSphere — Backup and Restore

This document describes the SensorSphere backup, verification, retention and
disaster-recovery procedures.

The complete restore procedure has been validated by restoring a SensorSphere
backup onto a separate machine and a separate Docker Compose instance.

---

## 1. Components covered by the backup

A SensorSphere backup contains:

- PostgreSQL / TimescaleDB logical database dump
- PostgreSQL global objects
- SensorSphere persistent application data
- Mosquitto persistent data
- SensorSphere project files
- backup metadata and version information
- SHA256 checksums

A typical backup directory contains:

    database.dump
    database-globals.sql
    app-data.tar.gz
    mosquitto.tar.gz
    project.tar.gz
    manifest.txt
    SHA256SUMS

The current backup format is version 7.

---

## 2. Backup location

Default backup root:

    /var/backups/sensorsphere

Each backup is stored in a timestamped directory:

    /var/backups/sensorsphere/YYYY-MM-DD_HHMMSS

The backup root can be overridden with:

    BACKUP_ROOT

---

## 3. Configuration

The backup and restore tools resolve configuration in the following order:

1. Environment variable explicitly supplied by the caller
2. SensorSphere `.env`
3. Built-in default

Important variables include:

    COMPOSE_PROJECT_NAME
    DATA_ROOT
    POSTGRES_DB
    POSTGRES_USER
    DB_SERVICE
    DB_NAME
    DB_USER
    BACKUP_ROOT
    PROJECT_BACKUP_IMAGE

`POSTGRES_PASSWORD` must always be explicitly configured in `.env`.

The default persistent data root is:

    DATA_ROOT=./data

Using a different `DATA_ROOT` allows multiple SensorSphere installations to
coexist cleanly on the same machine.

Example:

    COMPOSE_PROJECT_NAME=sensorsphere-test
    DATA_ROOT=./data-test

---

## 4. Creating a backup

Run:

    ./tools/backup/sensorsphere-backup.sh

The script:

1. validates the Docker Compose configuration
2. checks PostgreSQL availability
3. creates the PostgreSQL / TimescaleDB dump
4. validates the dump catalog
5. saves PostgreSQL globals
6. archives application persistent data
7. archives Mosquitto persistent data
8. archives the SensorSphere project
9. validates project exclusions
10. creates the manifest
11. generates SHA256 checksums
12. verifies the checksums

A successful run ends with:

    Backup completed successfully

---

## 5. Project archive exclusions

Runtime, generated and rebuildable data are deliberately excluded from
`project.tar.gz`.

Excluded content includes:

    .git
    .pnpm-store
    node_modules
    esphome/.esphome
    dev/bin
    .backup
    tmp
    DATA_ROOT

The actual TimescaleDB, Mosquitto and application data are backed up separately.

This keeps `project.tar.gz` small and avoids storing content that can be rebuilt.

---

## 6. Verifying a backup

Verify the latest backup:

    ./tools/backup/sensorsphere-verify-backup.sh

Verify a specific backup:

    ./tools/backup/sensorsphere-verify-backup.sh \
      /var/backups/sensorsphere/YYYY-MM-DD_HHMMSS

The verifier checks:

- required files
- SHA256 checksums
- TAR archive integrity
- manifest
- project exclusions
- essential project content
- application persistent data
- Mosquitto data
- PostgreSQL dump catalog
- backup sizes

A valid backup ends with:

    Backup verification PASSED

---

## 7. Restoring SensorSphere

Restore with:

    ./tools/backup/sensorsphere-restore.sh \
      /var/backups/sensorsphere/YYYY-MM-DD_HHMMSS

The restore is destructive and requires explicit confirmation:

    Type RESTORE to continue:

Enter:

    RESTORE

---

## 8. Restore safety copy

Before modifying the current installation, the restore script renames it to:

    <project>.pre-restore-YYYYMMDD_HHMMSS

Do not remove this directory until the restored installation has been fully
validated.

---

## 9. Important PROJECT_DIR rule

Always run a restore against the intended canonical project directory.

Example:

    PROJECT_DIR=/home/falcon/tests/sensorsphere \
      ./tools/backup/sensorsphere-restore.sh \
      /path/to/backup

Do not use a `.pre-restore-*` directory as `PROJECT_DIR`.

Before confirming a restore, verify the displayed values:

    Target project
    Target Compose project
    Target DATA_ROOT

They must correspond to the intended target installation.

---

## 10. Target environment preservation

When restoring onto another SensorSphere instance, the target `.env` is
preserved.

This allows the restored instance to keep target-specific settings such as:

    COMPOSE_PROJECT_NAME
    DATA_ROOT
    WEB_PORT
    MQTT_PORT
    MQTT_BIND_ADDRESS

This is particularly important when restoring onto a test or disaster-recovery
machine.

---

## 11. TimescaleDB restore

The restore uses a logical PostgreSQL / TimescaleDB restore.

The procedure is:

    stop SensorSphere
            |
            v
    preserve target .env
            |
            v
    restore project
            |
            v
    restore application data
            |
            v
    restore Mosquitto data
            |
            v
    remove TimescaleDB persistent storage
            |
            v
    start clean TimescaleDB
            |
            v
    wait for PostgreSQL
            |
            v
    recreate empty application database
            |
            v
    enable TimescaleDB
            |
            v
    timescaledb_pre_restore()
            |
            v
    pg_restore
            |
            v
    timescaledb_post_restore()
            |
            v
    ANALYZE
            |
            v
    start complete SensorSphere stack

The database must be empty before `pg_restore`.

Otherwise errors such as:

    relation "measurements" already exists

can occur.

---

## 12. TimescaleDB messages during restore

Messages such as:

    terminating background worker ... due to administrator command
    database system is shutting down
    database "<database>" does not exist

may temporarily appear while the restore deliberately stops PostgreSQL or
recreates the application database.

They are not necessarily restore failures.

Always check for new errors after the restore has completed.

---

## 13. Post-restore validation

Check all containers:

    docker compose ps -a

The persistent services should be running and TimescaleDB should be healthy.

The migration container should terminate successfully.

---

## 14. Validate database migrations

Run:

    docker compose run --rm migrations

On an already restored and fully migrated database, all migrations should be
skipped and none should be applied.

Also inspect the migration metadata when necessary:

    docker compose exec -T timescaledb \
      psql \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        -c "
          SELECT version, filename
          FROM public.schema_migrations
          ORDER BY version;
        "

---

## 15. Validate restored data

Example database checks:

    docker compose exec -T timescaledb \
      psql \
        -U "${POSTGRES_USER}" \
        -d "${POSTGRES_DB}" \
        -c "
          SELECT 'assets' AS table_name, count(*) FROM assets
          UNION ALL
          SELECT 'sensors', count(*) FROM sensors
          UNION ALL
          SELECT 'observations', count(*) FROM observations
          UNION ALL
          SELECT 'alert_rules', count(*) FROM alert_rules;
        "

Persistent files can also be checked under:

    ${DATA_ROOT}/app
    ${DATA_ROOT}/mosquitto
    ${DATA_ROOT}/timescaledb

---

## 16. Check logs after restore

Check recent errors:

    docker compose logs --since 2m --no-color \
      | grep -Ei 'error|fatal|panic|exception|failed' \
      || true

Use a short time window after the restore so expected shutdown messages from
the restore itself are not confused with current failures.

---

## 17. End-to-end validation

A complete disaster-recovery test should verify:

    MQTT publication
          |
          v
    Mosquitto
          |
          v
    ingestion-service
          |
          v
    TimescaleDB
          |
          v
    API
          |
          v
    Frontend

Verify that:

- MQTT accepts publications
- ingestion-service receives measurements
- observations are stored
- API endpoints return restored data
- frontend displays the expected inventory and readings

---

## 18. Scheduled backups

SensorSphere backups can be executed automatically using the systemd backup
service and timer.

Check the timer:

    systemctl status sensorsphere-backup.timer

List scheduled executions:

    systemctl list-timers sensorsphere-backup.timer

Check backup service logs:

    journalctl -u sensorsphere-backup.service

Manually trigger the scheduled backup service:

    sudo systemctl start sensorsphere-backup.service

Then verify the latest backup:

    ./tools/backup/sensorsphere-verify-backup.sh

---

## 19. Backup retention

Old backups are automatically removed according to the configured retention
policy.

Always ensure that at least one recent backup has successfully passed:

    Backup verification PASSED

before relying on automatic retention.

---

## 20. Disaster-recovery validation status

The SensorSphere backup/restore procedure has been tested with:

- a real SensorSphere backup
- transfer to another machine
- a different project directory
- a different Docker Compose project name
- a different `DATA_ROOT`
- PostgreSQL / TimescaleDB restoration
- database migrations
- application persistent data
- Mosquitto persistent data
- complete Docker Compose startup
- frontend validation

The restored installation successfully started and the application frontend
was validated.

This procedure therefore provides the baseline SensorSphere disaster-recovery
workflow.
