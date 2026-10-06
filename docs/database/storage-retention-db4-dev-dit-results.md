# Database Storage & Retention — DB-4 DEV Results

Date: 2026-10-06

Status: DEV IMPLEMENTATION VALIDATED

Scope: Historical Aggregation & Tiered Retention.

TEST1 was not modified.

## 1. Consumer inventory — DBST-300

The normalized observation paths are:

| Consumer | Endpoint / query | Required semantics | Tier |
|---|---|---|---|
| Latest values | `GET /api/v1/observations/latest` | exact latest sample, source and quality | raw |
| Alert scheduler | direct latest-value lookup | exact latest numeric sample and age | raw |
| Exact history | `GET /api/v1/observations/history` | every sample, source/sourceRef/quality | raw |
| Fine aggregates | `GET /api/v1/observations/aggregate`, 1/5/15 min | fine buckets | raw |
| Hourly aggregates | same endpoint, 1 h | min/max/avg/count | hourly tier |
| Coarse aggregates | same endpoint, 6 h / 1 d | re-aggregated min/max/weighted avg/count | hourly tier |
| History UI | HistoryPanel | raw <=24 h; aggregate >24 h | API-selected |
| Asset detail graphs | AssetLatestCard | raw <=24 h; aggregate >24 h | API-selected |

Frontend range selection currently uses:

- raw history through 24 hours;
- 15-minute aggregates for 2, 3 and 7 days;
- 1-hour aggregates for 14 and 30 days.

The History JSON export functions export graph/tab/view configuration only. They do
not export observation samples. There is therefore no separate observation-data
export contract to migrate in DB-4.

Legacy `/measurements/*` paths are separate from normalized observations and are
not changed by DB-4.

## 2. Existing hourly tier

The existing Timescale continuous aggregate is:

    public.observation_hourly

It stores, per asset metric and hour:

    min_value
    max_value
    avg_value
    sample_count

DEV coverage before DB-4:

    raw oldest          2026-08-09 22:02 UTC
    raw newest          2026-10-06 04:19 UTC
    raw rows            5,019,063
    raw metrics         79

    hourly oldest       2026-08-09 22:00 UTC
    hourly newest       2026-10-06 02:00 UTC
    hourly rows         90,977
    hourly metrics      79

The materialized history therefore covers every metric and the full existing
raw historical range.

The continuous aggregate refresh policy remains:

    start_offset       30 days
    end_offset         1 hour
    schedule_interval  1 hour

## 3. Range / resolution routing — DBST-301 / DBST-302

DB-4 keeps the public REST contract unchanged and selects the backing storage
inside the repository.

Routing rules:

| Requested bucket | Backing data |
|---|---|
| 1 minute | observations |
| 5 minutes | observations |
| 15 minutes | observations |
| 1 hour | observation_hourly + raw boundary samples |
| 6 hours | observation_hourly + raw boundary samples |
| 1 day | observation_hourly + raw boundary samples |

For hourly-compatible requests, complete hours use the hourly tier. The
possibly partial first and last hour are computed from raw observations.

This boundary merge is important because callers are allowed to supply
non-hour-aligned `from` / `to` timestamps. Returning whole hourly buckets at
the two edges would subtly change the pre-DB-4 API semantics.

For 6-hour and 1-day buckets, hourly rows are re-aggregated as:

    min   = MIN(hourly.min)
    max   = MAX(hourly.max)
    count = SUM(hourly.count)
    avg   = SUM(hourly.avg * hourly.count) / SUM(hourly.count)

The average is therefore weighted by the original sample count and is
mathematically equivalent to aggregating the raw samples.

## 4. Real-time continuous aggregate — migration 086

Migration:

    086-observation-hourly-real-time.sql

sets:

    timescaledb.materialized_only = false

for `observation_hourly`.

The Timescale watermark observed during DEV validation was:

    2026-10-06 03:00 UTC

With real-time mode enabled transactionally, the view returned materialized
history before the watermark and raw-derived hourly data after the watermark.

A seven-hour comparison including the current partial hour produced exact
matches for every bucket.

No retention policy is changed by migration 086.

## 5. Fidelity validation — DBST-303

### Aligned hourly validation

For a representative high-volume metric over 14 days:

    buckets             334
    missing buckets     0
    max min delta       0
    max max delta       0
    max avg delta       0
    max count delta     0

### Re-aggregation validation

6-hour comparison:

    buckets             119
    missing             0
    min/max/avg/count   exact

1-day comparison:

    buckets             29
    missing             0
    min/max/avg/count   exact

### Real API validation with non-aligned boundaries

A 14-day request with deliberately non-hour-aligned start/end timestamps was
sent through the actual DB-4 API and independently recomputed from raw
observations.

Results:

| Bucket | API buckets | Raw buckets | Missing/mismatched | Max deltas |
|---|---:|---:|---:|---|
| 1 hour | 337 | 337 | 0 | all 0 |
| 6 hours | 57 | 57 | 0 | all 0 |
| 1 day | 15 | 15 | 0 | all 0 |

This validates exact contract fidelity for min/max/avg/count.

## 6. Performance validation

An initial implementation accidentally put temporal bounds behind a CTE. That
prevented Timescale/PostgreSQL from pushing time constraints efficiently into
the raw boundary query and made the hybrid query slower than raw.

The final implementation uses the request parameters directly in the raw time
predicates, restoring chunk exclusion.

Final 30-day / 1-hour benchmark on DEV, after warm-up:

    DB-4 tiered API average    24.04 ms
    raw reference average    106.61 ms
    speed-up                    4.4x

A direct plan comparison also showed a representative 30-day hourly query at
approximately 85 ms from raw versus approximately 5.4 ms for the materialized
hourly portion alone.

## 7. API / export contract validation — DBST-304

No endpoint path, query parameter or response DTO changes in DB-4.

The existing aggregate response remains:

    bucketStart
    min
    max
    avg
    count

Latest observations and exact history continue to read raw observations.

Exact history is intentionally not reconstructed from hourly aggregates because
its response includes per-sample:

    time
    value
    source
    sourceRef
    quality

Those fields do not exist in `observation_hourly`.

History exports in the frontend export graph/tab/view configuration, not
observation payloads, so they are unaffected.

## 8. Daily aggregate evaluation — DBST-305

Current UI history tops out at 30 days.

At DEV validation time:

    observation_hourly rows      ~90,977
    observation_hourly size      ~14.9 MB
    projected daily rows         ~3,954 over the current ~58-day span

A daily continuous aggregate would reduce row count further, but provides no
meaningful current functional benefit because:

- 30-day history is already small in the hourly tier;
- the hourly tier is required anyway for 1-hour and 6-hour resolution;
- one-year hourly steady-state storage is projected below 100 MB.

Decision:

    Do not add observation_daily in DB-4.

Re-evaluate if SensorSphere exposes multi-month/multi-year charts or if the
hourly tier becomes materially larger.

## 9. Raw retention target — DBST-306 / DBST-309

DB-4 deliberately keeps:

    observations raw retention = 90 days

A 45-day reduction was evaluated with the DB-3 dry-run only; it was not
applied.

The 45-day preview would currently make approximately:

    546,778 rows
    2 complete chunks
    ~2.7 MB allocated compressed storage

newly eligible.

The small physical saving illustrates the effect of DB-2 compression: old raw
chunks are already inexpensive.

More importantly, reducing raw retention would shorten the exact-sample
`/observations/history` availability window. Hourly data cannot preserve
per-sample source and quality fields, so a retention reduction would be an API
contract decision, not a transparent storage optimization.

Decision:

    Keep 90 days in DB-4.

A future lower target requires an explicit exact-history contract change or a
new archival representation that preserves the required metadata.

## 10. BLE long-term requirements — DBST-307 / DBST-308

`gateway_device_ble_observations` is used for gateway/device coverage and
ranking.

The public query accepts a maximum of:

    30 days

and calculates:

    sample count
    avg/min/max RSSI
    standard deviation
    first/last seen
    per-device gateway rank and lead

The same raw table also supports immediate destructive/reset operations by
gateway and by sensor.

DEV worst-case 30-day measurement:

    raw BLE rows                  3,431,505
    gateway/device pairs         43
    projected hourly rows        28,083
    30-day aggregate query       ~0.84 s

An hourly BLE aggregate would reduce scan volume substantially, but would need
reliable invalidation after every current reset/delete operation. Otherwise a
user could delete coverage samples while stale aggregate rows remained visible.

DB-2 compression already controls BLE physical storage and the functional
contract is bounded to 30 days.

Decision:

    Do not add a BLE aggregate in DB-4.

Revisit if 30-day coverage latency becomes operationally problematic or if BLE
history is extended beyond 30 days. Any future aggregate must be deletion-aware.

## 11. Steady-state observation storage budget — DBST-310

Current observation chunks:

    2 recent uncompressed chunks   ~289.3 MB
    7 historical compressed chunks  ~20.2 MB

Average mature full compressed chunk, excluding the initial partial chunk:

    ~3.30 MB / 7-day chunk

Using the current ingestion profile, 90-day retention, seven-day compression
threshold and current chunk cadence:

    estimated raw 90-day steady-state    ~325.6 MB

Current hourly materialization:

    ~14.9 MB over ~58 days

Linear one-year estimate at the same metric population/rate:

    estimated hourly 365-day tier        ~95.1 MB

Combined normalized observation tiers:

    estimated raw + hourly steady-state  ~420.7 MB

This budget is intentionally specific to normalized observation storage. The
overall database is currently dominated by other families, notably the two
48-hour diagnostic event tables. DB-3 controls their logical retention and
DB-2 addressed historical high-water-mark/index pressure.

## 12. Automated validation

Final API unit tests after DB-4 repository changes:

    30 / 30 passed

New DB-4 tests cover:

- 1/5/15-minute buckets route to raw;
- 1-hour/6-hour/1-day buckets route to the hourly tier;
- fine aggregate SQL has no dependency on `observation_hourly`;
- hourly-compatible SQL merges hourly full segments with raw edge segments;
- weighted re-aggregation is used for averages.

Migration 086 applied successfully on DEV and reports real-time mode enabled.

## 13. Version plan

DB-4 release versions:

    API         1.70.0
    Frontend    unchanged at 1.120.0
    Ingestion   unchanged at 1.0.2
    Migrations  86
    Backup      0.1.0

A Stack Release will be created after final container/build checks and then
validated on DIT.

TEST1 remains unchanged.
