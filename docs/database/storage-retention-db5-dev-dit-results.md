# Database Storage & Retention — DB-5 DEV / DIT / TEST1 Results

Date: 2026-10-07

Status: ACCEPTED — DEV + DIT + TEST1

TEST1 was not modified during the initial DEV/DIT implementation phase.

## 1. Scope

DB-5 converts the two high-volume 48-hour diagnostic event families from
ordinary PostgreSQL tables with hourly row DELETE into native TimescaleDB
hypertables:

- `gateway_traffic_events`
- `metric_routing_events`

The public table names, event IDs, API DTOs, filters and tuple cursors are
preserved.

Release versions:

    Stack       2026.10.06.3
    API         1.71.0
    Frontend    1.120.0
    Ingestion   1.0.3
    Migrations  87
    nginx       1.0.0
    Backup      0.1.0

The three changed images are published for:

    linux/amd64
    linux/arm64

## 2. Pre-DB-5 problem

DB-2 measured the two ordinary PostgreSQL event tables at approximately:

    gateway_traffic_events  ~790 MB
    metric_routing_events   ~473 MB

Their retention mechanism was an hourly row DELETE.

The DB-2 isolated comparison showed that deleting roughly half of a
representative gateway event table took about 4.59 seconds and left the
relation file at roughly the same physical size until intrusive maintenance.
The DELETE also created roughly one dead tuple per deleted row.

The Timescale prototype instead removed 24 expired one-hour chunks in about:

    gateway traffic  ~177 ms
    metric routing   ~154 ms

and immediately released the corresponding chunk storage with zero dead
tuples.

## 3. Schema / query audit — DBST-400

Both event tables originally used:

    PRIMARY KEY (id)

Application pagination already used:

    ORDER BY occurred_at DESC, id DESC

with the cursor predicate:

    (occurred_at, id) < ($beforeOccurredAt, $beforeId)

Timescale unique constraints must include the partitioning column, therefore
DB-5 changes both primary keys to:

    PRIMARY KEY (occurred_at, id)

This exactly matches the existing cursor order.

Existing IDs use BIGSERIAL-backed sequences. The conversion preserves both
existing IDs and the original sequences.

## 4. Conversion strategy — DBST-401

Migration 087 is:

    087-diagnostic-event-hypertables.sql

The migration is explicitly self-transactional because the SensorSphere
migration runner executes SQL files with `psql -f` and does not wrap files in
a transaction.

For both tables it:

1. begins a transaction;
2. sets bounded lock / statement timeouts;
3. takes ACCESS EXCLUSIVE locks;
4. changes the primary key to `(occurred_at,id)`;
5. calls `create_hypertable(... migrate_data => TRUE)`;
6. creates the configured retention policy;
7. commits.

Conversion is in-place instead of using a final table rename. This is
important for ingestion safety: a writer waiting on the existing relation lock
resumes against the same table after commit rather than against a stale
pre-swap relation.

## 5. Isolated conversion prototype

A representative copy of `gateway_traffic_events` containing 100,000 rows was
converted in-place.

Result:

    migrated rows     100,000
    resulting chunks  5
    conversion time   ~5.5 s

Existing IDs were preserved and the sequence continued correctly:

    max before  28,232,543
    next insert 28,232,544

Cursor ordering remained:

    occurred_at DESC, id DESC

## 6. Production DEV conversion

Migration 087 executed on DEV at:

    2026-10-06 12:40:18 UTC

Migration execution time recorded by the migration runner:

    73,000 ms

After conversion:

    gateway_traffic_events  hypertable, one-hour chunks
    metric_routing_events   hypertable, one-hour chunks

Initial observed chunk count:

    50 chunks each

Sequences remained continuous. Example post-conversion values during
validation:

    gateway_traffic_events_id_seq  28,464,864
    metric_routing_events_id_seq   20,136,808

Rows and IDs continued increasing after conversion.

## 7. Native retention — DBST-405

Both event families now have Timescale policies:

    drop_after         48 hours
    schedule_interval  1 hour

DEV jobs:

    gateway traffic  job 1015
    metric routing   job 1011

Both report successful executions with no recorded failures.

The ingestion service no longer owns a row-delete retention loop. Ingestion
1.0.3 only writes events and logs:

    retentionOwner = timescaledb

There is therefore only one retention mechanism for these families.

## 8. DB-3 integration — DBST-406

DB-3 now reports both diagnostic families as:

    mechanism = timescale
    configured = 172800 seconds
    effective  = 172800 seconds
    IN SYNC

A destructive preview from 48 h to 47 h on gateway traffic identified:

    eligible rows        26,540
    eligible chunks      1
    allocated bytes      12,771,328
    physical reclaim     expected
    risk                 DESTRUCTIVE

The recent Backup V2 Recovery Point gate was correctly required and accepted.

A real reversible apply sequence was validated:

    48 h -> 49 h  REVIEW_REQUIRED
    49 h -> 48 h  DESTRUCTIVE

Both applies returned HTTP 200 and ended IN SYNC.

Critically, the recreated policy retained:

    schedule_interval = 1 hour

rather than the daily cadence used by longer-retention families.

## 9. Failure / interrupted-write validation — DBST-407

### Transaction rollback

An isolated migration was forced to fail with division-by-zero after
`create_hypertable`.

Expected failure return code:

    3

After rollback:

    rows preserved             1,000
    hypertable metadata rows   0
    primary key                id
    sequence insert            succeeded with id 1001

DDL, data migration and PK change therefore roll back together.

### Concurrent writer

A second isolated test held ACCESS EXCLUSIVE for four seconds while another
session attempted an INSERT.

The insert:

    waited       3,266 ms
    returned id  10,001
    succeeded after commit

After cutover:

    table is hypertable  yes
    row count            10,001
    primary key          occurred_at,id

This validates the intended behavior for an ingestion write already waiting
when the conversion lock is taken.

## 10. API / pagination / ingestion validation — DBST-408

Real DEV API pagination was tested for both event streams with two consecutive
100-row pages.

Gateway traffic:

    first page         100
    second page        100
    overlap            0
    cursor violations  0
    warm API average   ~20.13 ms

Metric routing:

    first page         100
    second page        100
    overlap            0
    cursor violations  0
    warm API average   ~13.28 ms

Existing filters were also validated:

    gateway messageType
    metric routing decision

All returned rows matched the requested filter.

Direct PostgreSQL cursor-style plans use Timescale ChunkAppend plus the
per-chunk composite primary key.

Measured execution:

    gateway latest 101 rows  ~1.98 ms
    routing latest 101 rows  ~1.90 ms

The DB-2 prototype reference for the same cursor shape was approximately
1.04 ms. DB-5 therefore introduces no meaningful cursor-pagination
regression.

The 48-hour summary endpoints scan the complete logical retention window and
were measured around:

    gateway summary  ~1.94 s for ~1.27 M rows
    routing summary  ~2.01 s for ~0.89 M rows

These are aggregate scans, not pagination paths.

Ingestion continuity was observed over ten seconds:

    gateway rows / max ID increased by 87
    routing rows / max ID increased by 63

No ingestion error was observed.

## 11. Storage after conversion — DBST-409

Immediately after conversion, chunk storage was approximately:

    gateway_traffic_events  ~616 MB
    metric_routing_events   ~394 MB

A later measurement during active ingestion reported approximately:

    gateway_traffic_events  ~605 MB
    metric_routing_events   ~395 MB

The parent PostgreSQL relations themselves remain tiny because data lives in
Timescale chunks.

Summed dead tuples across the active chunks:

    gateway traffic  0
    metric routing   0

A real production DEV retention boundary was then observed at:

    now     2026-10-06 22:01:33 UTC
    cutoff  2026-10-04 22:01:33 UTC

Exactly one complete one-hour chunk was newly eligible in each hypertable:

    gateway traffic
      eligible chunk bytes  12,771,328
      job duration           ~58.996 ms

    metric routing
      eligible chunk bytes   8,290,304
      job duration            ~20.231 ms

Storage immediately before the jobs:

    gateway traffic  50 chunks  637,009,920 B  (~608 MB)
    metric routing   50 chunks  415,752,192 B  (~396 MB)

Storage immediately after:

    gateway traffic  49 chunks  624,238,592 B  (~595 MB)
    metric routing   49 chunks  407,461,888 B  (~389 MB)

The physical decrease matches the dropped chunk files and occurred immediately.
Summed dead tuples remained zero for both hypertables.

This is the intended DB-5 behavior: expiration is a partition/chunk removal,
not row-by-row DELETE plus later vacuum.

## 12. Backup V2 validation — DBST-410

A post-conversion DEV Recovery Point was created before official Stack
promotion:

    backupId   20261006T214755Z-31c8fa58
    status     VERIFIED
    size       111,154,006 bytes
    duration   19,878 ms

It reports live database migration level 87 and verification:

    checksumStatus     OK
    dumpCatalogStatus  OK
    archiveStatus      OK

After official Stack 2026.10.06.3 deployment, the final aligned DEV Recovery
Point is:

    backupId   20261006T215225Z-65f854b6
    status     VERIFIED

Its manifest reports:

    Stack       2026.10.06.3
    API         1.71.0
    Ingestion   1.0.3
    Migrations  87
    DB level    87

and checksum / dump catalog / archive verification are all OK.

## 13. DIT acceptance

DIT pre-update state:

    Stack       2026.10.06.2
    API         1.70.0
    Ingestion   1.0.2
    Migrations  86

A pre-update Recovery Point was created:

    backupId  20261006T215308Z-4bfbdda0
    status    VERIFIED

DIT was updated from the published Stack 2026.10.06.3 bundle.

Post-update:

    API         1.71.0
    Frontend    1.120.0
    Ingestion   1.0.3
    Migrations  87
    nginx       1.0.0
    Backup      0.1.0

All health checks passed.

DIT migration 087 completed successfully. Both event tables are hypertables.
The DIT instance currently contains no event chunks, which is expected for
this low-volume validation instance.

Both retention jobs exist with:

    drop_after         48 hours
    schedule_interval  1 hour

The DB-3 desired settings remain:

    gateway_traffic_events  172800 seconds
    metric_routing_events   172800 seconds

No retention apply was performed on DIT:

    database_retention_audit rows = 0

Ingestion logs confirm TimescaleDB ownership of both retention policies.

The Admin retention endpoint through nginx returned HTTP 401 without a DIT
session, which is the expected authentication behavior.

DIT post-update Recovery Point:

    backupId  20261006T215431Z-c9401d7b
    status    VERIFIED

TEST1 had not yet been modified at this stage.

## 14. Final acceptance

DB-5 is accepted on DEV, DIT and TEST1.

The final production DEV chunk-retention observation confirmed immediate
physical reclamation with zero dead tuples, completing DBST-409.

Final Stack Release:

    2026.10.06.4

Stack 2026.10.06.4 supersedes 2026.10.06.3 with an installer-only legacy
backup-state permission fix. Component images and database migration level are
unchanged from 2026.10.06.3.

Final DEV Recovery Point:

    20261006T215225Z-65f854b6
    VERIFIED

Final DIT Recovery Point:

    20261006T215431Z-c9401d7b
    VERIFIED

The final DEV/DIT Recovery Points were created immediately before the
installer-only 2026.10.06.4 superseding release, so their manifests report
Stack 2026.10.06.3. They contain the same application images and database level
as 2026.10.06.4: API 1.71.0, Ingestion 1.0.3 and migration level 87, with
successful checksum, dump-catalog and archive verification.

DBST-400 through DBST-413 are complete.

The first user-initiated TEST1 update attempt to Stack 2026.10.06.3 stopped
before manifest application or migration execution because the legacy TEST1
`data/` directory is root-owned and `data/backup-state` did not yet exist:

    mkdir: cannot create directory .../data/backup-state: Permission denied

TEST1 therefore remained on its previous Stack / database level.

This exposed an upgrade-path installer defect: the DB-3 backup-state bind mount
was pre-created with a normal host `mkdir`, which cannot create a child under
a legacy root-owned 0755 data directory.

Stack 2026.10.06.4 is an installer-only superseding release. Its installer
first attempts normal creation; if a legacy bind-mount parent is not writable,
it uses a root Docker helper limited to that parent to create only
`backup-state`, chown that new directory to the invoking installation user,
and set mode 0700. The parent ownership/mode and all existing database,
Mosquitto and application data remain unchanged.

The exact TEST1 permission shape was reproduced on a temporary path:

    parent before/after   root:root 0755
    backup-state result   ubuntu:ubuntu 0700

The fallback completed successfully. TEST1 was then re-run by the user with Stack 2026.10.06.4 and the update
completed successfully.

Post-update TEST1 status:

    Stack       2026.10.06.4
    API         1.71.0
    Frontend    1.120.0
    Ingestion   1.0.3
    Migrations  87
    nginx       1.0.0

Runtime health:

    api          healthy
    frontend     healthy
    nginx        healthy
    timescaledb  healthy
    migrations   exited 0
    ingestion    running

The legacy directory shape is now exactly as intended:

    data                root:root   0755
    data/backup-state   ubuntu:ubuntu 0700

Read-only database validation on TEST1 confirmed:

    migration 087 present
    gateway_traffic_events is a hypertable
    metric_routing_events is a hypertable
    both diagnostic retention jobs use drop_after = 48 hours
    both diagnostic retention jobs run every 1 hour
    both desired retention settings are 172800 seconds
    database_retention_audit rows = 0

TEST1 currently has no diagnostic event chunks, which is expected for this
instance, but both hypertables and their retention jobs are installed and
active.

Ingestion logs confirm:

    gateway traffic retention owner = timescaledb
    metric routing retention owner  = timescaledb

The Admin retention endpoint reports all six managed policies IN SYNC.

This TEST1 instance is currently configured with:

    SENSORSPHERE_ENVIRONMENT=TEST1
    SENSORSPHERE_AUTH_ENABLED=false
    SENSORSPHERE_AUTH_DEV_ROLE_SWITCH_ENABLED=true

so the Admin endpoint responds without a login on this instance. DB-5 did not
change those authentication settings.

DBST-413 is complete.
