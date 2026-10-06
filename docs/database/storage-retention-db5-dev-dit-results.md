# Database Storage & Retention — DB-5 DEV / DIT Results

Date: 2026-10-06

Status: DEV ACCEPTED — DIT validation pending

Scope: Diagnostic Event Tables / Timescale Retention.

TEST1 was not modified.

## 1. Goal

DB-5 replaces row-by-row application retention for:

- `gateway_traffic_events`;
- `metric_routing_events`;

with native TimescaleDB one-hour chunks and 48-hour retention policies.

The public table names, event IDs, sequence-based inserts, API filters and
`(occurred_at, id)` cursor semantics are preserved.

## 2. DEV baseline — DBST-400

Before conversion both event families were ordinary PostgreSQL heap tables.

### gateway_traffic_events

    rows                   1,289,887
    allocated total        832,102,400 bytes
    heap                   285,753,344 bytes
    indexes                546,234,368 bytes
    dead tuples            ~234,008
    oldest                 2026-10-04 11:54:26Z
    newest                 2026-10-06 12:37:15Z
    min id                 26,947,102
    max id                 28,236,988
    primary key            (id)

Indexes:

    occurred_at DESC
    gateway_id, occurred_at DESC
    sensor_uid, occurred_at DESC
    message_type, occurred_at DESC
    processing, occurred_at DESC

### metric_routing_events

    rows                   901,396
    allocated total        497,819,648 bytes
    heap                   280,346,624 bytes
    indexes                217,358,336 bytes
    dead tuples            ~37,336
    oldest                 2026-10-04 11:54:26Z
    newest                 2026-10-06 12:37:15Z
    min id                 19,075,845
    max id                 19,977,240
    primary key            (id)

Indexes:

    occurred_at DESC
    gateway_id, occurred_at DESC
    sensor_uid, occurred_at DESC

The API already paginated both families with:

    ORDER BY occurred_at DESC, id DESC

and cursor predicates:

    (occurred_at, id) < (:beforeOccurredAt, :beforeId)

The Timescale-compatible composite primary key therefore matches the existing
external pagination contract.

## 3. Conversion strategy — DBST-401

DB-5 uses an in-place conversion instead of a shadow-table rename.

Reason:

A blocked ingestion INSERT already bound to the existing relation must resume
against the converted table after the migration lock is released. A table
rename/swap can allow a transaction that resolved the old relation before the
swap to resume against the wrong physical table.

Migration 087 therefore:

1. starts an explicit transaction;
2. sets a 60-second lock timeout and 15-minute statement timeout;
3. takes ACCESS EXCLUSIVE locks on both event tables;
4. changes each primary key to `(occurred_at, id)`;
5. calls `create_hypertable(... migrate_data => TRUE)`;
6. uses one-hour chunks;
7. reads the current DB-3 retention setting;
8. creates a one-hour Timescale retention job;
9. commits all changes atomically.

The SensorSphere migration runner itself does not wrap SQL files in a
transaction, so migration 087 contains its own `BEGIN / COMMIT`.

## 4. Prototype and failure validation — DBST-401 / DBST-407

### Representative 100k-row prototype

An isolated gateway-traffic copy containing 100,000 rows was converted in
approximately 5.5 seconds.

Results:

    rows after conversion        100,000
    null ids                     0
    chunks                       5
    primary key                  (occurred_at, id)
    max id before insert         28,232,543
    next generated id            28,232,544

The ID sequence therefore continued correctly after conversion.

### Concurrent write test

An isolated 20,000-row table was converted while a second session attempted an
INSERT.

The migration deliberately held the ACCESS EXCLUSIVE lock for two seconds.

Result:

    concurrent INSERT wait       ~2 seconds
    inserted rows after release  1
    total rows                   20,001

The waiting write resumed successfully in the converted hypertable.

### Transaction rollback test

A second isolated 1,000-row table injected `SELECT 1/0` after
`create_hypertable` and before COMMIT.

Result:

    psql return code             3
    table remained hypertable    no
    primary key after rollback   (id)
    rows after rollback          1,000

This proves that the conversion, primary-key change and Timescale metadata roll
back together when migration 087 fails inside its transaction.

## 5. Automated application validation

Before modifying the real DEV tables:

    API tests        32 / 32 passed
    Ingestion tests   3 / 3 passed
    API build         OK
    Ingestion build   OK
    Migrations image  OK
    git diff --check  OK

New API regression coverage verifies that:

- both diagnostic families are owned by the Timescale retention mechanism;
- their baseline setting remains 48 hours;
- DB-3 apply creates diagnostic Timescale policies with a one-hour schedule;
- existing retention rollback/audit behavior still passes.

## 6. Pre-conversion Recovery Point

Before migration 087, a fresh DEV Backup V2 Recovery Point was created:

    backupId   20261006T123747Z-5837769a
    status     VERIFIED
    size       108,856,258 bytes
    duration   19,651 ms

Its manifest reports the pre-DB-5 release:

    Stack       2026.10.06.2
    API         1.70.0
    Frontend    1.120.0
    Ingestion   1.0.2
    Migrations  86

Verification:

    checksumStatus     OK
    dumpCatalogStatus  OK
    archiveStatus      OK

## 7. Real DEV migration — DBST-402 / DBST-403 / DBST-404

The ingestion service was stopped before applying migration 087 on DEV to
minimize contention during the large in-place data move.

Migration execution:

    migration          087-diagnostic-event-hypertables.sql
    SQL execution      ~73 seconds
    runner runtime     ~84.8 seconds
    result             COMMIT / schema level 87

Timescale hypertable IDs:

    gateway_traffic_events  29
    metric_routing_events   30

After migration:

| Relation | Chunks | Chunk interval | PK |
|---|---:|---:|---|
| gateway_traffic_events | 49 | 1 hour | (occurred_at, id) |
| metric_routing_events | 49 | 1 hour | (occurred_at, id) |

Sequence values continued advancing after ingestion restarted, proving that
generated IDs remained continuous.

## 8. Native 48-hour retention — DBST-405

Initial Timescale jobs:

    gateway_traffic_events
      schedule_interval  1 hour
      drop_after         48 hours
      first run          Success
      duration           ~25.6 ms

    metric_routing_events
      schedule_interval  1 hour
      drop_after         48 hours
      first run          Success
      duration           ~20.6 ms

The first jobs immediately dropped chunks that were older than the 48-hour
boundary. Therefore the post-migration row totals are intentionally lower than
the baseline. This is retention expiry, not migration loss.

The oldest remaining rows moved from approximately 11:54 UTC to approximately
12:37 UTC two days earlier, matching the 48-hour boundary at validation time.

The ingestion service no longer contains:

    getRetentionHours()
    purgeGatewayTrafficEvents()
    purgeMetricRoutingEvents()

and no scheduled row-by-row DELETE loop remains.

Ingestion logs explicitly report TimescaleDB as the retention owner for both
families.

## 9. DB-3 integration — DBST-406

DB-3 now reads the effective event retention from
`timescaledb_information.jobs`, just like the other Timescale-managed
families.

Both diagnostic policies report:

    mechanism          timescale
    configuredSeconds  172800
    actualSeconds      172800
    inSync             true

A real DEV control-plane test changed gateway traffic retention:

    48 h -> 49 h
      risk              REVIEW_REQUIRED
      apply             HTTP 200

then returned it to:

    49 h -> 48 h
      risk              DESTRUCTIVE
      newly eligible    3,651 rows
      complete chunks   0 at preview instant
      backup gate       OK
      Recovery Point    20261006T123747Z-5837769a
      apply             HTTP 200

The final Timescale job after that test uses:

    drop_after         48 hours
    schedule_interval  1 hour

and DB-3 reports the policy IN SYNC.

The absence of a complete droppable chunk in the 48-to-49-hour preview is
expected: the exact row window can contain rows while no complete one-hour
chunk has yet crossed the drop boundary.

## 10. API contract validation — DBST-408

The real DB-5 API runtime was tested after conversion.

Gateway traffic page 1 / page 2:

    limit               25 / 25
    cursor               (occurredAt, id)
    duplicate IDs        0

Metric routing page 1 / page 2:

    limit               25 / 25
    cursor               (occurredAt, id)
    duplicate IDs        0

Both 24-hour summary endpoints returned HTTP 200.

The public API table names, response DTOs and cursor structure are unchanged.

## 11. Query performance — DBST-408

### Pagination

Before conversion, representative SQL execution:

    gateway traffic     ~0.315 ms
    metric routing      ~0.198 ms

After conversion:

    gateway traffic     ~0.906 ms
    metric routing      ~0.901 ms

The hypertable plans use ChunkAppend plus the composite primary key. Execution
remains sub-millisecond; planning work increases because multiple hourly chunks
are considered.

### 24-hour summaries

Before conversion:

    gateway traffic     ~739 ms
    metric routing      ~266 ms

Warm post-conversion observations:

    gateway traffic     ~608–703 ms
    metric routing      ~125–141 ms

A real API run measured approximately:

    gateway traffic     ~824 ms
    metric routing      ~160 ms

The gateway summary still performs a large COUNT DISTINCT workload and is not
made dramatically faster by chunking alone. DB-5 is primarily a retention and
physical-storage optimization, not a summary-aggregation feature.

## 12. Physical storage and bloat — DBST-409

Immediately after native retention removed the expired first chunks:

### gateway_traffic_events

    before total        832,102,400 bytes
    after total         ~627,638,272 bytes
    reduction           ~204.5 MB / ~24.6%
    dead tuples before  ~234,008
    dead tuples after   0

### metric_routing_events

    before total        497,819,648 bytes
    after total         ~410,411,008 bytes
    reduction           ~87.4 MB / ~17.6%
    dead tuples before  ~37,336
    dead tuples after   0

Combined:

    before              ~1,329.9 MB
    after               ~1,038.0 MB
    immediate reduction ~291.9 MB / ~22%

The important steady-state change is that future expiry drops complete chunks
rather than creating dead tuples in large heap tables.

## 13. Database Storage dashboard integration

The Storage report now returns exactly two diagnostic relations:

    gateway_traffic_events
      kind              hypertable
      chunks            49
      deadRows          0
      retention         48:00:00

    metric_routing_events
      kind              hypertable
      chunks            49
      deadRows          0
      retention         48:00:00

The two retention jobs are reported directly from TimescaleDB and no duplicate
regular-table entries remain.

## 14. DEV acceptance status

Validated on DEV:

- schema/index/query audit;
- transaction-safe in-place conversion design;
- sequence/ID continuity;
- concurrent-write blocking/resume;
- injected-failure rollback;
- both real event tables converted;
- one-hour chunks;
- 48-hour native retention;
- application DELETE retention removed;
- DB-3 preview/apply integration;
- cursor pagination;
- summary APIs;
- physical space reduction;
- dead tuples eliminated.

Pending before final DB-5 acceptance:

- publish immutable API 1.71.0 / Ingestion 1.0.3 / Migrations 87 images;
- publish the Stack Release;
- align DEV on that official Stack;
- create/verify a post-conversion Recovery Point whose manifest reports
  migration 87;
- validate the published Stack on DIT.

TEST1 remains unchanged.
