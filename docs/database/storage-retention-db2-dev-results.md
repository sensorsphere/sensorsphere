# Database Storage & Retention — DB-2 DEV Results

Date: 2026-10-04

Status: DEV validation in progress

This document records the measured DB-2 Storage Optimization results separately
from the functional definition in `docs/database/storage-retention.md`.

All destructive-looking benchmarks in this document were executed on temporary
schemas or temporary databases. No SensorSphere business table was altered by
the benchmark phase.

## 1. DEV baseline

PostgreSQL / TimescaleDB:

    TimescaleDB 2.21.3

Main hypertables before DB-2 compression:

| Hypertable | Data | Indexes | Total | Chunks | Compression |
|---|---:|---:|---:|---:|---|
| gateway_device_ble_observations | ~491 MB | ~646 MB | ~1137 MB | 5 | disabled |
| observations | ~508 MB | ~525 MB | ~1033 MB | 9 | disabled |
| measurements | ~89 MB | ~86 MB | ~174 MB | 9 | disabled |

The three hypertables therefore account for roughly 2.34 GB of allocated
database storage before compression.

The two 48-hour diagnostic event tables remain normal PostgreSQL tables:

| Table | Data | Indexes | Total | Retention mechanism |
|---|---:|---:|---:|---|
| gateway_traffic_events | ~269 MB | ~521 MB | ~790 MB | hourly DELETE |
| metric_routing_events | ~265 MB | ~207 MB | ~473 MB | hourly DELETE |

## 2. Compression benchmark

Representative closed 7-day chunks were copied to isolated temporary
hypertables with the same logical indexes as the source tables.

Compression layouts:

    observations
      segmentby = asset_metric_id
      orderby   = time DESC

    gateway_device_ble_observations
      segmentby = device_uid,gateway_id
      orderby   = time DESC

    measurements
      segmentby = sensor_uid
      orderby   = time DESC

Results:

| Family | Rows | Before | After | Reduction |
|---|---:|---:|---:|---:|
| observations | 753,221 | ~159 MB | ~3.8 MB | ~97.7% |
| gateway_device_ble_observations | 835,858 | 267,829,248 B | 8,347,648 B | ~96.9% |
| measurements | 152,618 | 27,369,472 B | 925,696 B | ~96.6% |

Measured compression duration on the representative copies:

    BLE          ~6.87 s
    measurements ~0.58 s

The observations benchmark was initially used to validate the size reduction;
its exact compression duration was not retained and is therefore deliberately
not reported.

## 3. Read/query regression benchmark

The same temporary copies were queried before and after compression.

### observations

Representative metric: 10,078 rows in the tested chunk.

    history query
      uncompressed  15.752 ms
      compressed     1.068 ms

    1-hour aggregate
      uncompressed  16.498 ms
      compressed     2.786 ms

### gateway_device_ble_observations

Representative aggregate across the complete ~836k-row chunk:

    uncompressed  401.001 ms
    compressed    170.144 ms

### measurements

Representative sensor history: 10,078 rows.

    uncompressed   8.997 ms
    compressed     1.512 ms

These measurements are local DEV benchmarks and may benefit from cache state.
They prove the absence of an obvious regression for the tested access patterns;
they are not a general performance guarantee.

## 4. Compression policy decision

Current hypertable chunk interval is approximately seven days.

DB-2 selected:

    compress_after = 7 days
    compression job schedule = 1 hour

Because Timescale compression applies to closed chunks, this yields an effective
recent writable/uncompressed window of approximately 7 to 14 days.

Migration 084 configures compression metadata and recurring policies but does
not synchronously compress historical chunks inside the schema migration.

## 5. Backup and restore compatibility

A dedicated temporary Timescale database was populated with the representative
753,221-row observations chunk.

Before compression:

    physical hypertable size  ~159 MB
    pg_dump -Fc               4,048,291 bytes
    dump duration             ~1.51 s

After compression:

    physical hypertable size  ~3.8 MB
    pg_dump -Fc               2,061,297 bytes
    dump duration             ~0.37 s

The compressed dump was restored into a second fresh temporary Timescale
database using:

    timescaledb_pre_restore()
    pg_restore --exit-on-error --no-owner --no-privileges
    timescaledb_post_restore()

Result:

    restore duration      ~0.27 s
    restored rows         753,221 / 753,221
    compression_enabled   true
    restored chunk        compressed

The dump size was reduced by approximately 49%.

This validates the Backup V2 pg_dump/pg_restore mechanism with compressed
chunks on a representative isolated database. It does not replace the later
full SensorSphere disaster-recovery restore acceptance test.

## 6. Index audit

PostgreSQL index counters on DEV currently cover only the interval since the
last PostgreSQL start:

    2026-09-25 13:28:23 UTC

At DB-2 inspection time this was only about nine days. `stats_reset` was NULL.

DB-2 therefore defines:

    minimum index observation window: 30 days
    preferred observation window:     90 days

Zero scans before the minimum window is reached must never be interpreted as
proof that an index is unused.

Large observed event indexes included:

    gateway_traffic_events
      processing   ~116 MB
      gateway       ~98 MB
      sensor        ~91 MB
      type          ~81 MB
      primary key   ~74 MB
      occurred_at   ~60 MB

    metric_routing_events
      sensor        ~67 MB
      gateway       ~67 MB
      occurred_at   ~41 MB
      primary key   ~32 MB

Application query mapping found:

- event reads are time-bounded;
- message_type and processing use exact filters and match their B-tree indexes;
- gateway and sensor UI filters currently use ILIKE with surrounding wildcards,
  so their normal B-tree indexes do not directly accelerate those filters;
- cursor pagination orders by `occurred_at DESC, id DESC`.

No production index was removed or rebuilt during DB-2.

## 7. Event-table hypertable prototype

Both 48-hour event tables were successfully prototyped as Timescale hypertables.

Required key change:

    PRIMARY KEY (occurred_at, id)

This is required because a Timescale unique index must include the partitioning
column. It also matches the existing pagination ordering.

Prototype chunk interval:

    1 hour

This aligns with the existing hourly retention cadence and bounds retention
precision to less than approximately one hour.

### gateway_traffic_events

A temporary copy was shifted 24 hours backward to create a synthetic ~72-hour
window without waiting in real time.

Before chunk retention:

    rows       1,258,677
    chunks     49
    total      ~610 MB

Dropping chunks older than 48 hours:

    chunks dropped   24
    elapsed          ~177 ms

After:

    rows       644,374
    chunks     25
    total      ~312 MB
    dead tuples 0

### metric_routing_events

Temporary shifted copy:

    rows before  877,792
    chunks       49
    total        ~400 MB

Existing cursor-style query on the hypertable:

    ORDER BY occurred_at DESC, id DESC
    LIMIT 101

used Timescale ChunkAppend plus the composite primary key and completed in
approximately 1.04 ms in the representative test.

Dropping expired chunks:

    chunks dropped   24
    elapsed          ~154 ms
    rows after       450,850
    chunks after     25
    total after      ~206 MB

The production event tables are NOT converted by migration 084. Their real
conversion requires a dedicated migration/swap plan because the primary key
changes and ingestion must remain safe throughout the transition.

## 8. DELETE versus chunk drop

A normal PostgreSQL temporary copy of gateway_traffic_events was tested with
the same synthetic retention window.

Before:

    rows   1,259,803
    total  ~567 MB

Row DELETE:

    rows deleted   629,906
    elapsed        ~4.59 s

Immediately after DELETE:

    rows remaining 629,897
    total          ~567 MB
    dead tuples    ~629,906

After normal VACUUM:

    dead tuples    0
    total          ~568 MB

By contrast the Timescale chunk drop completed in ~177 ms and reduced physical
storage from ~610 MB to ~312 MB immediately.

This validates the architectural preference for chunk/partition retention over
continuous high-volume row DELETE.

## 9. Physical-space reclamation runbook

The following operations have different meanings and must not be presented as
equivalent:

### DELETE

- removes logical rows;
- creates dead tuples until vacuum processes them;
- frees pages for reuse inside PostgreSQL;
- normally does not reduce the relation file on the filesystem.

### VACUUM

- makes dead-row space reusable;
- updates visibility information;
- does not normally shrink relation files;
- is appropriate routine maintenance.

### Timescale drop_chunks / partition drop

- removes complete expired partitions/chunks;
- avoids row-by-row dead-tuple creation;
- releases the dropped partition files immediately;
- is the preferred mechanism for high-rate time-bounded event retention.

### VACUUM FULL

- rewrites the table;
- can return filesystem space;
- requires intrusive locking and temporary working space;
- must remain an explicit maintenance operation, never routine automatic
  retention.

### REINDEX

- rebuilds index structures;
- can reclaim index bloat;
- consumes temporary disk and I/O;
- must only be used after measured evidence and an explicit maintenance plan.

## 10. DB-2 rollout boundaries

Migration 084 is intended to activate only the validated compression policies:

    observations
    gateway_device_ble_observations
    measurements

It deliberately does not:

- delete data;
- alter retention durations;
- remove indexes;
- convert the two event tables;
- run VACUUM FULL;
- run REINDEX.

The next DB-2 acceptance step is to apply migration 084 on DEV, let or trigger
each compression job once, then verify:

- compressed chunk counts;
- real database-size reduction;
- API/UI health;
- ingestion health;
- backup creation/verification;
- dashboard chunk-size accuracy.

DIT should only receive DB-2 after this DEV acceptance. TEST1 remains untouched
unless explicitly authorized.


## 11. Live DEV acceptance

Migration 084 was applied to the real DEV database only after creating and
verifying a fresh Backup V2 Recovery Point:

    pre-compression backup
      backupId        20261004T184544Z-111b4f4d
      status          VERIFIED
      size            135,487,953 bytes
      duration        35,886 ms

The three compression policies were created as jobs 1004, 1005 and 1006.
Their first automatic runs all completed successfully with zero failures:

    observations                    15.23 s
    gateway_device_ble_observations 11.71 s
    measurements                     3.38 s

Real DEV chunk state after the first policy runs:

    observations                    7 / 9 chunks compressed
    gateway_device_ble_observations 3 / 5 chunks compressed
    measurements                    7 / 9 chunks compressed

The most recent pre-DB-2 storage snapshot recorded approximately
3,811,798,163 database bytes. After compression the live report returned
approximately 2,113,342,611 bytes. Because normal ingestion continued between
the two measurements, this is treated as an approximate real-world reduction
of 44–45%, not a laboratory ratio.

Live hypertable totals changed approximately as follows:

| Hypertable | Before | After first policy run |
|---|---:|---:|
| gateway_device_ble_observations | ~1137 MB | ~410 MB |
| observations | ~1033 MB | ~263 MB |
| measurements | ~174 MB | ~45 MB |

A second real Backup V2 Recovery Point was then created:

    post-compression backup
      backupId        20261004T185124Z-42f037ba
      status          VERIFIED
      size            104,092,494 bytes
      duration        17,114 ms

Compared with the immediately preceding safety backup, this run was
approximately 23% smaller and approximately 52% faster.

The post-compression backup manifest correctly reports:

    Stack       2026.10.04.2
    API         1.68.0
    Frontend    1.119.0
    Migrations  84
    Backup      0.1.0
    PostgreSQL  17.5
    TimescaleDB 2.21.3

DEV runtime health remained green for API, frontend, nginx and TimescaleDB,
while ingestion continued running.

The Database Storage & Retention API correctly reports compressed physical
chunk sizes and emits DB-2 recommendations including:

- compression-policy-active;
- indexes-larger-than-data;
- event-row-delete-retention;
- dead-tuples;
- index-observation-window-short.

DBST-112 is therefore accepted on DEV.

The production gateway/routing event tables remain unchanged normal PostgreSQL
tables at this stage. Their conversion to Timescale hypertables requires a
dedicated migration/swap change because the primary key must become
(occurred_at, id) and ingestion continuity must be protected.


## 12. DIT acceptance

DIT was protected by a fresh verified Recovery Point before the DB-2 update:

    pre-update backup
      backupId        20261004T185451Z-49c9c8ef
      status          VERIFIED
      size            289,523 bytes
      duration        688 ms

DIT was then updated from the published immutable Stack Release bundle:

    Stack       2026.10.04.2
    API         1.68.0
    Frontend    1.119.0
    Migrations  84
    Backup      0.1.0

Migration level 84 is applied and all three Timescale compression policies are
present with a one-hour schedule and a seven-day compression threshold.

The DIT instance currently has zero chunks in observations, BLE observations and
measurements, so there was no historical data to compress. The migration/policy
integration is nevertheless present and the real compression behavior was
validated on DEV.

DIT health after the update:

    timescaledb  healthy
    api          healthy
    frontend     healthy
    nginx        healthy
    ingestion    running

The Database Storage Admin endpoint correctly remains protected when accessed
without an authenticated DIT Admin session and returned HTTP 401.

A post-update Recovery Point was then created and verified:

    post-update backup
      backupId        20261004T185732Z-8d7f1ae9
      status          VERIFIED
      size            292,957 bytes
      duration        753 ms

Its manifest reports Stack 2026.10.04.2, API 1.68.0, Frontend 1.119.0,
Migrations 84, Backup 0.1.0, PostgreSQL 17.5 and TimescaleDB 2.21.3.

DB-2 is therefore accepted on DEV and DIT.

TEST1 was not modified during DB-2 acceptance.
