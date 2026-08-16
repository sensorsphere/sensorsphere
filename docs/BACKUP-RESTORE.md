# SensorSphere — Backup, Restore & Retention

This document describes the backup, verification, retention, scheduling, and restore tooling used by SensorSphere.

## Repository layout

The tooling is versioned with the application:

```text
tools/
└── backup/
    ├── sensorsphere-backup.sh
    ├── sensorsphere-restore.sh
    ├── sensorsphere-verify-backup.sh
    ├── sensorsphere-prune-backups.sh
    └── systemd/
        ├── sensorsphere-backup.service
        └── sensorsphere-backup.timer

docs/
└── BACKUP-RESTORE.md
```

The real scripts remain in the Git repository. Symbolic links under `/usr/local/sbin` make them available system-wide:

```bash
sudo ln -sfn \
  "$(pwd)/tools/backup/sensorsphere-backup.sh" \
  /usr/local/sbin/sensorsphere-backup

sudo ln -sfn \
  "$(pwd)/tools/backup/sensorsphere-restore.sh" \
  /usr/local/sbin/sensorsphere-restore

sudo ln -sfn \
  "$(pwd)/tools/backup/sensorsphere-verify-backup.sh" \
  /usr/local/sbin/sensorsphere-verify-backup

sudo ln -sfn \
  "$(pwd)/tools/backup/sensorsphere-prune-backups.sh" \
  /usr/local/sbin/sensorsphere-prune-backups
```

## Configuration

The scripts determine the SensorSphere repository root from their own physical location. They therefore do not depend on a hard-coded user home directory.

Configuration priority is:

1. environment variable explicitly supplied to the script;
2. value from the SensorSphere `.env`;
3. built-in default.

Database settings normally come from:

```text
POSTGRES_DB
POSTGRES_USER
POSTGRES_PASSWORD
```

The default TimescaleDB Docker Compose service is:

```text
timescaledb
```

The default backup root is:

```text
/var/backups/sensorsphere
```

Initial setup:

```bash
sudo mkdir -p /var/backups/sensorsphere
sudo chown ubuntu:ubuntu /var/backups/sensorsphere
sudo chmod 750 /var/backups/sensorsphere
```

## Backup contents

Each successful backup is stored in a timestamped directory:

```text
/var/backups/sensorsphere/YYYY-MM-DD_HHMMSS/
```

Example:

```text
2026-08-16_133206/
├── database.dump
├── database-globals.sql
├── app-data.tar.gz
├── mosquitto.tar.gz
├── project.tar.gz
├── manifest.txt
└── SHA256SUMS
```

### PostgreSQL / TimescaleDB

`database.dump` is a PostgreSQL custom-format logical dump created with `pg_dump -Fc`.

`database-globals.sql` contains PostgreSQL global objects produced by `pg_dumpall --globals-only`.

The live TimescaleDB data directory is not copied into the project archive.

Warnings from `pg_dump` about circular foreign-key constraints in TimescaleDB internal tables may appear. The backup script validates that the resulting dump catalogue is readable with `pg_restore -l`.

### Application persistent data

`app-data.tar.gz` contains:

```text
data/app/
```

This includes persistent API data such as:

```text
data/app/history-config.json
```

### Mosquitto

`mosquitto.tar.gz` contains Mosquitto configuration and persistent data.

The archive is created from inside the Mosquitto container instead of reading `infrastructure/mosquitto/data` directly from the host. This avoids UID/permission problems with files such as:

```text
mosquitto.db
```

### SensorSphere project

`project.tar.gz` contains the application source code, infrastructure configuration, `.env`, ESPHome source configuration, tools, documentation, and other files needed to rebuild SensorSphere.

The following generated, runtime, or externally versioned content is intentionally excluded:

```text
.git/
.pnpm-store/
node_modules/
esphome/.esphome/
dev/bin/
*/.backup/
tmp/

infrastructure/timescaledb/data/
infrastructure/mosquitto/data/
data/app/
```

Nested Git repositories are excluded as well.

The project archive is created from a temporary root container with the repository mounted read-only. This allows the backup to read files created by container UIDs without changing host permissions.

### Manifest and checksums

`manifest.txt` records information including:

```text
backup_version
timestamp
hostname
project_dir
db_service
db_name
db_user
postgres_version
timescaledb_version
git_commit
git_branch
git_status
docker_compose_images
```

`SHA256SUMS` is generated for all main backup files.

## Creating a backup

Run:

```bash
sensorsphere-backup
```

or:

```bash
./tools/backup/sensorsphere-backup.sh
```

A successful backup ends with a summary similar to:

```text
Backup completed successfully
Backup directory: /var/backups/sensorsphere/...
Total backup size: ...
Project archive size: ...
Database dump size: ...
```

## Verifying a backup

Verify the newest backup:

```bash
sensorsphere-verify-backup
```

Verify a specific backup:

```bash
sensorsphere-verify-backup \
  /var/backups/sensorsphere/2026-08-16_133206
```

The verifier checks:

- required backup files;
- SHA-256 checksums;
- gzip/tar archive integrity;
- PostgreSQL dump catalogue readability;
- Mosquitto backup content;
- essential SensorSphere project files;
- backup manifest;
- exclusion of generated/runtime directories from `project.tar.gz`.

A backup with verification errors must not be used as a validated recovery point.

## Retention policy

SensorSphere uses a simple Grandfather-Father-Son style retention policy.

Defaults:

```text
7 daily backups
4 weekly backups
6 monthly backups
```

The retained set is the union of:

- the newest complete backup for each of the most recent 7 calendar days represented in the backup set;
- the newest complete backup for each of the most recent 4 ISO weeks represented in the backup set;
- the newest complete backup for each of the most recent 6 calendar months represented in the backup set.

The newest complete backup is always kept.

The retention script only considers directories matching:

```text
YYYY-MM-DD_HHMMSS
```

and only treats a directory as complete when the expected backup markers are present. Incomplete backups are ignored and are not automatically deleted.

### Preview retention

The default mode is safe and does not delete anything:

```bash
sensorsphere-prune-backups
```

or explicitly:

```bash
sensorsphere-prune-backups --dry-run
```

The script prints each complete backup with either:

```text
KEEP
DELETE
```

and the reason for retention.

### Apply retention

After reviewing the dry run:

```bash
sensorsphere-prune-backups --apply
```

### Custom retention

The following values may be placed in `.env`:

```bash
RETENTION_DAILY=7
RETENTION_WEEKLY=4
RETENTION_MONTHLY=6
```

They can also be overridden for a single invocation:

```bash
RETENTION_DAILY=14 \
RETENTION_WEEKLY=8 \
RETENTION_MONTHLY=12 \
sensorsphere-prune-backups --dry-run
```

## Daily systemd scheduling

The backup is scheduled with:

```text
tools/backup/systemd/sensorsphere-backup.service
tools/backup/systemd/sensorsphere-backup.timer
```

The timer runs daily at:

```text
02:00
```

with:

```ini
Persistent=true
```

If the host is powered off at the scheduled time, systemd runs the missed timer after the host starts.

The service executes the workflow in this order:

```text
1. sensorsphere-backup
2. sensorsphere-verify-backup
3. sensorsphere-prune-backups --apply
```

Retention therefore runs only after the backup command and verification step have succeeded.

A `flock` lock prevents concurrent backup executions.

### Install systemd units

Create symbolic links:

```bash
sudo ln -sfn \
  /home/ubuntu/sensorsphere/tools/backup/systemd/sensorsphere-backup.service \
  /etc/systemd/system/sensorsphere-backup.service

sudo ln -sfn \
  /home/ubuntu/sensorsphere/tools/backup/systemd/sensorsphere-backup.timer \
  /etc/systemd/system/sensorsphere-backup.timer
```

Reload systemd:

```bash
sudo systemctl daemon-reload
```

Validate the units:

```bash
systemd-analyze verify \
  /etc/systemd/system/sensorsphere-backup.service \
  /etc/systemd/system/sensorsphere-backup.timer
```

Test the complete service manually:

```bash
sudo systemctl start sensorsphere-backup.service
```

Inspect the result:

```bash
systemctl status sensorsphere-backup.service
```

Logs:

```bash
journalctl \
  -u sensorsphere-backup.service \
  --since "10 minutes ago" \
  --no-pager
```

Enable the daily timer:

```bash
sudo systemctl enable --now sensorsphere-backup.timer
```

Check the next execution:

```bash
systemctl list-timers sensorsphere-backup.timer
```

## Restoring SensorSphere

Before restoring, verify the selected backup:

```bash
sensorsphere-verify-backup \
  /var/backups/sensorsphere/<backup>
```

Then run:

```bash
sensorsphere-restore \
  /var/backups/sensorsphere/<backup>
```

The restore operation is destructive and can replace the current SensorSphere data. Review the backup and restore target before confirming the restore.

The restore process handles the project files, application persistent data, Mosquitto persistent data, and the logical TimescaleDB restore.

## Useful commands

List backups:

```bash
ls -lht /var/backups/sensorsphere
```

Show backup sizes:

```bash
du -sh /var/backups/sensorsphere/*
```

Verify the latest backup:

```bash
sensorsphere-verify-backup
```

Preview retention:

```bash
sensorsphere-prune-backups
```

Apply retention:

```bash
sensorsphere-prune-backups --apply
```

Inspect the latest backup manifest:

```bash
LATEST_BACKUP="$(
  find /var/backups/sensorsphere \
    -mindepth 1 \
    -maxdepth 1 \
    -type d \
  | sort \
  | tail -1
)"

cat "${LATEST_BACKUP}/manifest.txt"
```

Check scheduled execution:

```bash
systemctl list-timers sensorsphere-backup.timer
```

Inspect recent automatic backup logs:

```bash
journalctl \
  -u sensorsphere-backup.service \
  -n 200 \
  --no-pager
```

## Off-host backups

Backups under `/var/backups/sensorsphere` protect against application/database failures and accidental changes, but they do not protect against loss of the VPS, VM, filesystem, or host.

At least one additional copy should be stored outside the SensorSphere host, for example on:

```text
NAS
another server
object/cloud storage
```

Off-host replication should be added independently of the local retention policy.
