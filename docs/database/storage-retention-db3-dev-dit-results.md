# Database Storage & Retention — DB-3 DEV / DIT Results

Date: 2026-10-05

Status: ACCEPTED on DEV and DIT

This document records the DB-3 Retention Management implementation and
acceptance results separately from the functional roadmap in
`docs/database/storage-retention.md`.

TEST1 was not modified during DB-3 implementation or acceptance.

## 1. Scope delivered

DB-3 introduces explicit, Admin-only retention management for these data
families:

| Policy key | Relation | Mechanism | Baseline |
|---|---|---|---:|
| observations | public.observations | Timescale retention policy | 90 days |
| gateway_device_ble_observations | public.gateway_device_ble_observations | Timescale retention policy | 30 days |
| measurements | public.measurements | Timescale retention policy | Unlimited |
| observation_hourly | public.observation_hourly | Timescale retention policy | 365 days |
| gateway_traffic_events | public.gateway_traffic_events | ingestion hourly DELETE | 48 hours |
| metric_routing_events | public.metric_routing_events | ingestion hourly DELETE | 48 hours |

The configuration is persisted in `database_retention_settings`.
Every explicit apply attempt is recorded in
`database_retention_audit`.

The API never accepts an installation name, database DSN, filesystem path or
arbitrary relation name from the caller. Operations therefore apply only to
the database already configured for the running API instance.

## 2. Safety model

Retention changes are classified as:

- `LOW_RISK`: effective value is unchanged;
- `REVIEW_REQUIRED`: the retention window is extended or changed to
  Unlimited;
- `DESTRUCTIVE`: the retention window is shortened, including changing an
  Unlimited policy to a finite value.

Every changed policy requires an explicit preview and typed confirmation:

    APPLY RETENTION

A destructive change additionally requires a recent successful Backup V2
`create` run with phase `COMPLETE`. The default maximum age is 26 hours and
is configurable with:

    SENSORSPHERE_DB_RETENTION_BACKUP_MAX_AGE_HOURS

The API sees only the Backup V2 state directory mounted read-only. It does not
receive access to backup dump payloads.

The apply endpoint re-reads the effective policy and compares it with the
previewed value. A stale preview is rejected with HTTP 409.

## 3. Preview semantics

For Timescale hypertables, a destructive preview reports:

- exact row count in the newly eligible logical time range;
- number of newly eligible closed chunks;
- allocated bytes of those chunks;
- oldest/newest affected chunk range;
- whether physical space reclamation is expected through chunk removal.

For normal PostgreSQL diagnostic event tables, the preview reports:

- exact newly eligible row count;
- oldest/newest affected event timestamps;
- an allocated-byte estimate proportional to eligible rows;
- physical reclaim as `false`.

The diagnostic event tables use ordinary PostgreSQL `DELETE`. Deleting rows
makes pages reusable by PostgreSQL but normally does not shrink the relation
file on disk. A later `VACUUM FULL` or table rewrite would be required for
physical file shrink and is intentionally outside DB-3.

Timescale retention removes complete eligible chunks. Physical storage is
therefore expected to fall when a chunk is actually dropped.

## 4. Automated validation

Final containerized validation before release:

    API tests       26 / 26 passed
    Frontend tests   7 / 7 passed
    Ingestion tests  3 / 3 passed

The API suite includes:

- per-family validation bounds;
- Unlimited handling;
- risk classification;
- recent/stale Recovery Point handling;
- rejection of caller-supplied cross-instance fields;
- stale-preview rejection;
- transaction rollback when a Timescale apply fails;
- FAILED audit recording after an injected apply error.

The rollback regression test verifies that a failure after
`remove_retention_policy` causes transaction `ROLLBACK`, does not persist the
new desired setting, and records the failed attempt separately.

## 5. Module and database versions

DB-3 versions:

    API         1.69.0
    Frontend    1.120.0
    Ingestion   1.0.2
    Migrations  85
    Backup      0.1.0

Stack Release:

    2026.10.05.1

The API database compatibility range is:

    72..85

The four new application/migration images were verified in GHCR with both:

    linux/amd64
    linux/arm64

## 6. DEV migration and initial state

Migration:

    085-database-retention-management.sql

The migration creates:

    database_retention_settings
    database_retention_audit

It seeds the six current baseline retention settings but does not alter an
existing Timescale policy and does not delete data.

After migration, all six DEV managed policies reported `IN SYNC`.

The PostgreSQL representation of `INTERVAL '1 year'` evaluates to 31,557,600
seconds. DB-3 canonicalizes the existing `observation_hourly` one-year policy
to 365 days (31,536,000 seconds) for comparison so it does not create a false
six-hour drift.

## 7. DEV stale-backup gate validation

Before creating a new DB-3 Recovery Point, the latest DEV backup was:

    backupId  20261004T185124Z-42f037ba
    age       ~27.52 hours
    threshold 26 hours

A destructive preview of raw observations from 90 days to 30 days returned:

    risk                     DESTRUCTIVE
    eligible rows            1,836,551
    eligible chunks          4
    allocated bytes affected 9,011,200
    affected chunk range     2026-08-06 .. 2026-09-03
    canApply                 false

The request was correctly blocked because the Recovery Point was older than
26 hours.

This also validates that the compressed Timescale chunk preview no longer
depends on `pg_stat_all_tables.n_live_tup`, which can report zero for
compressed chunks. DB-3 now performs an exact `COUNT(*)` over the newly
eligible logical time window.

On DEV that exact count took approximately 0.13 seconds for the tested
30-to-90-day observation window.

## 8. DEV non-destructive apply validation

Two reversible extensions were applied first:

    gateway_traffic_events  48 h -> 49 h
    observations            90 d -> 91 d

Both were classified `REVIEW_REQUIRED`, applied successfully, and were
recorded in the audit log.

Attempts to return them to 48 h / 90 d while the old Recovery Point was still
over the 26-hour threshold returned HTTP 409, proving that the backup gate is
re-evaluated at apply time rather than trusted from a previous preview.

## 9. DEV verified Recovery Point and destructive apply

After publishing Stack 2026.10.05.1, a fresh DEV Recovery Point was created:

    backupId   20261005T230008Z-2aca9eab
    status     VERIFIED
    size       107,467,136 bytes
    duration   31,635 ms

Its manifest reports:

    Stack       2026.10.05.1
    API         1.69.0
    Frontend    1.120.0
    Ingestion   1.0.2
    Migrations  85
    Backup      0.1.0
    DB level    85
    PostgreSQL  17.5
    TimescaleDB 2.21.3

Verification status:

    checksumStatus   OK
    dumpCatalogStatus OK
    archiveStatus    OK

With this Recovery Point less than one minute old, the two destructive returns
were accepted:

    observations            91 d -> 90 d
    gateway_traffic_events  49 h -> 48 h

The observations return had no complete newly eligible chunk and therefore
reported zero immediately droppable chunks/rows.

The gateway traffic return preview reported:

    eligible rows            17,797
    allocated bytes estimate ~11.5 MB
    affected range           2026-10-03 22:19:51Z
                             .. 2026-10-03 23:01:07Z
    physical reclaim         not immediate

Both applies returned HTTP 200 and all six managed policies returned
`IN SYNC` afterward.

The gateway rows become eligible for the ingestion service's next hourly
retention pass. DB-3 deliberately does not issue the row DELETE directly from
the HTTP request.

## 10. Ingestion integration

Ingestion 1.0.2 no longer hard-codes 48 hours for the two diagnostic event
tables.

Before each hourly purge it reads:

    database_retention_settings

for:

    gateway_traffic_events
    metric_routing_events

A `NULL` setting means Unlimited and causes a no-op purge.

This keeps the apply operation short and lets the normal ingestion retention
loop perform row deletion asynchronously.

## 11. Installer / backup-state integration

The API mounts only:

    SENSORSPHERE_BACKUP_STATE_ROOT -> /backup-state:ro

The installer pre-creates the backup-state source directory with mode 0700 so a
fresh installation cannot accidentally receive a root-owned directory created
by Docker before the Backup module runs.

During DEV Stack update validation, an existing installer edge case was also
found: `snapshot_bundle()` could return status 1 when an optional top-level
`init/` directory was absent. Because the installer uses `set -e`, update
then stopped silently after creating rollback metadata.

The distribution installer now explicitly returns 0 after optional snapshot
copies. The corrected installer completed the DEV and DIT updates normally.

Source checkouts used simultaneously as installation directories now ignore
installer rollback/runtime metadata such as `.env.previous`,
`.stack-release.yaml` and `.bundle.previous/`. This prevents previous
environment values from appearing as untracked Git files.

## 12. DIT acceptance

DIT pre-update state:

    Stack       2026.10.04.2
    API         1.68.0
    Frontend    1.119.0
    Ingestion   1.0.1
    Migrations  84

A fresh verified pre-update Recovery Point was created:

    backupId  20261005T230306Z-80566f2d
    status    VERIFIED
    size      293,712 bytes
    duration  704 ms

DIT was then updated with the validated Stack Release bundle:

    Stack       2026.10.05.1
    API         1.69.0
    Frontend    1.120.0
    Ingestion   1.0.2
    Migrations  85
    Backup      0.1.0

Post-update health:

    timescaledb  healthy
    api          healthy
    frontend     healthy
    nginx        healthy
    ingestion    running
    migrations   exited 0

Migration 85 is present in `schema_migrations`.

DIT settings after migration:

    observations                    90 days
    gateway_device_ble_observations 30 days
    measurements                    Unlimited
    observation_hourly              365 days
    gateway_traffic_events          48 hours
    metric_routing_events           48 hours

Existing Timescale runtime policies remain:

    observations                    90 days
    gateway_device_ble_observations 30 days
    observation_hourly              1 year

No retention change was applied on DIT:

    database_retention_audit rows = 0

The ingestion startup log reports:

    gateway traffic retentionHours = 48
    metric routing retentionHours  = 48

The Admin retention endpoint remains protected by DIT authentication and
returned HTTP 401 without a session.

A post-update Recovery Point was then created:

    backupId  20261005T230444Z-a50e7b04
    status    VERIFIED
    size      301,056 bytes
    duration  750 ms

DB-3 is therefore accepted on DEV and DIT.

TEST1 was not modified.
