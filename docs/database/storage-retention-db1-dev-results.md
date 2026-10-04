# Database Storage & Retention — DB-1 DEV Results

Date: 2026-10-04
Environment: DEV
Host: na-01
Scope: DB-1 Reporting & Observability

## Result

DB-1 core implementation is deployed and validated on DEV.

Runtime versions:

    API         1.66.0
    Frontend    1.117.0
    Migrations  83

Migration 083 adds only bounded storage-observability metadata in:

    database_storage_snapshots

No DB-1 API endpoint changes SensorSphere business data, retention policies,
compression settings, indexes, hypertables, or chunks.

The background collector writes only its own bounded snapshot metadata.

## Current baseline

Report generated:

    2026-10-04T03:08:02.096Z

Database:

    database bytes             3,776,457,875
    allocated relation bytes   3,765,067,776
    table data bytes           1,689,812,992
    index bytes                2,071,429,120
    other / TOAST bytes            3,825,664
    relations                             74
    hypertables                            3
    Timescale chunks                      25

The index footprint is currently larger than the table-data footprint.

## Top storage consumers

| Relation | Category | Total bytes | Data bytes | Index bytes | Retention | Compression |
|---|---|---:|---:|---:|---|---|
| gateway_device_ble_observations | BLE discovery/coverage | 1,169,178,624 | 505,053,184 | 664,076,288 | 30 days | disabled |
| observations | Observations | 1,069,072,384 | 525,451,264 | 543,539,200 | 90 days | disabled |
| gateway_traffic_events | Gateway diagnostics | 827,727,872 | 281,378,816 | 546,234,368 | 48 hours | N/A |
| metric_routing_events | Routing diagnostics | 495,771,648 | 278,298,624 | 217,358,336 | 48 hours | N/A |
| measurements | Measurements | 180,461,568 | 91,783,168 | 88,596,480 | not detected | disabled |

## Timescale policies detected

    observation_hourly
        refresh: every 1 hour
        refresh window: 30 days
        retention: 1 year

    observations
        retention: 90 days

    gateway_device_ble_observations
        retention: 30 days

No Timescale compression policy is currently active.

## Snapshot collector

Defaults validated:

    interval:   6 hours
    retention:  90 days

First DEV snapshot:

    captured_at:       2026-10-04T03:01:54.257Z
    database size:     3601 MB
    relations:         74
    hypertables:       3
    chunks:            25

The collector checks whether a snapshot is due before running the expensive
storage inventory queries.

Snapshot pruning is covered by unit tests and deletes only
database_storage_snapshots rows older than the configured metadata-retention
window.

## Growth and projections

Growth outputs are intentionally null until enough real history exists.

Current state:

    24h growth:            collecting history
    7d growth:             collecting history
    30d growth:            collecting history
    average daily growth:  collecting history
    30d projection:        collecting history
    90d projection:        collecting history

Long-term projection is not produced from less than 12 hours of history.

## Storage budgets

Budget variables are implemented but intentionally not configured by default:

    SENSORSPHERE_DB_STORAGE_WARNING_BYTES
    SENSORSPHERE_DB_STORAGE_CRITICAL_BYTES

Current DEV status:

    UNCONFIGURED

Snapshot controls:

    SENSORSPHERE_DB_STORAGE_SNAPSHOT_INTERVAL_HOURS=6
    SENSORSPHERE_DB_STORAGE_SNAPSHOT_RETENTION_DAYS=90

## Recommendations generated on DEV

Current read-only recommendations include:

- review Timescale compression for gateway_device_ble_observations;
- review its index/data ratio;
- review Timescale compression for observations;
- review its index/data ratio;
- review the gateway_traffic_events index/data ratio;
- note the gateway_traffic_events dead-tuple/high-water-mark signal;
- review compression for measurements;
- review the currently undefined measurements retention policy.

Recommendations never execute the proposed action.

## Authorization

The report endpoint is Admin-only:

    GET /api/v1/admin/database/storage

Validated:

    Admin -> HTTP 200
    User  -> HTTP 403

Automated controller tests cover both cases.

## Performance / ingestion non-regression

Eight sequential full storage reports were requested on the multi-GB DEV
database.

Observed:

    average response time: 377 ms
    maximum response time: 548 ms

During the test:

    ingestion RestartCount before: 0
    ingestion RestartCount after:  0
    ingestion remained Up
    measurements continued receiving current timestamps
    observations continued receiving current timestamps

This is an initial DEV acceptance result, not a formal load-test ceiling.

## Automated tests

API:

    17 passed
    0 failed

Coverage added for:

- storage-family classification;
- unknown relation classification;
- 24h/7d/30d growth calculations;
- projection minimum-history guard;
- storage budget OK/WARNING/CRITICAL and invalid configuration;
- Admin authorization;
- read-only report behavior;
- bounded snapshot retention;
- snapshot due-check short circuit.

Frontend:

    7 passed
    0 failed

Production API/frontend builds pass in Docker.

## UI delivered

Admin page:

    Database Storage & Retention

Includes:

- READ ONLY badge;
- current database/data/index summary;
- relation/hypertable/chunk counts;
- 24h/7d/30d growth cards;
- 30d/90d projection cards;
- storage-budget status;
- recommendations;
- Top consumers tab;
- Growth chart;
- Timescale/chunks tab;
- Indexes tab;
- Retention tab;
- relation detail drill-down with matching chunks and indexes.

## Remaining DB-1 validation/deferred items

Not yet marked complete:

- DBST-018 — latest verified backup size/age as optional safety context.
  This remains intentionally decoupled until a clean read-only integration
  with Backup V2 state is designed; the API must not receive Docker socket
  access.
- DBST-042 — dedicated empty/small-database acceptance environment.

Neither item blocks use of the DEV reporting dashboard.

DB-1 continues to prohibit data purge, chunk drop, compression changes,
VACUUM FULL, index mutation, or retention-policy changes.
