# Database Storage & Retention

Status: DB-1 implemented; DB-2, DB-3 and DB-4 accepted on DEV + DIT
Initial baseline: DEV, 2026-10-03
Scope: SensorSphere database storage observability, optimization and retention lifecycle

DB-1 DEV acceptance results:

    docs/database/storage-retention-db1-dev-results.md

## 1. Purpose

SensorSphere stores a growing amount of time-series, discovery, routing and
diagnostic data. Database growth must become an explicitly managed product
capability rather than an operational afterthought.

The objective is to provide:

- a clear report of what consumes database storage;
- historical storage growth and growth-rate visibility;
- explicit retention policies by data family;
- safe recommendations before any destructive action;
- predictable storage budgets and warning/critical thresholds;
- TimescaleDB-aware optimization;
- a path to retain useful historical information while reducing raw-data cost.

The first phase is read-only with respect to SensorSphere business data and
database lifecycle policy. DB-1 writes only its own bounded operational
storage snapshots; no automatic purge or destructive UI action is introduced.

---

# 2. Principles

## 2.1 Safety first

Storage reporting must never silently change data.

Any later retention or purge action must:

1. identify exactly what data becomes eligible;
2. show the time range and estimated rows/bytes;
3. distinguish logical deletion from filesystem space reclamation;
4. require explicit operator confirmation for destructive actions;
5. refuse unsafe cross-instance targets;
6. preserve application health and data integrity;
7. integrate with the Backup/Restore safety model when appropriate.

## 2.2 Preserve information value, not necessarily raw rows forever

Long-term history can use a different representation from recent raw data.

Example target model:

    recent raw data
          ↓
    hourly/daily aggregates
          ↓
    longer-term retained history

SensorSphere should not keep high-frequency raw rows indefinitely when a
lower-resolution representation preserves the required functional history.

## 2.3 TimescaleDB-native lifecycle where possible

For time-series data, prefer:

- hypertables;
- chunk-level retention;
- compression;
- continuous aggregates;

over repeated large row-by-row DELETE operations.

## 2.4 Report before optimize

Every optimization should be driven by measured storage, growth rate, query
usage and functional requirements.

---

# 3. DEV baseline — 2026-10-03

The DEV database was inspected read-only on na-01.

Database size:

    pg_database_size = 3,747,785,875 bytes
    pg_size_pretty    = 3574 MB

Approximately 99% of the database is explained by five storage families.

| Data family | Type | Approx. total size | Current lifecycle |
|---|---|---:|---|
| gateway_device_ble_observations | Timescale hypertable | 1101 MB | 30-day retention |
| observations | Timescale hypertable | 1010 MB | 90-day retention |
| gateway_traffic_events | PostgreSQL table | 787 MB | application purge after 48h |
| metric_routing_events | PostgreSQL table | 473 MB | application purge after 48h |
| measurements | Timescale hypertable | 171 MB | no retention policy detected |

Additional long-term aggregate:

    observation_hourly
        continuous aggregate
        retention: 1 year
        refresh window: 30 days
        refresh interval: 1 hour

## 3.1 Timescale storage detail

Current hypertables:

| Hypertable | Table data | Indexes | Total | Chunks | Compression |
|---|---:|---:|---:|---:|---|
| gateway_device_ble_observations | ~499 MB | ~655 MB | ~1101 MB | 5 | disabled |
| observations | ~521 MB | ~539 MB | ~1010 MB | 9 | disabled |
| measurements | ~91 MB | ~88 MB | ~171 MB | 9 | disabled |

No current SensorSphere hypertable has Timescale compression enabled.

Chunk intervals are currently approximately one week.

## 3.2 Event tables

gateway_traffic_events:

    ~1.25 million live rows
    ~233k dead tuples at inspection time
    ~787 MB total
    ~266 MB table data
    ~521 MB indexes
    retention target: 48 hours
    purge execution: hourly

metric_routing_events:

    ~873k live rows
    ~37k dead tuples at inspection time
    ~473 MB total
    ~265 MB table data
    ~207 MB indexes
    retention target: 48 hours
    purge execution: hourly

The observed data window for both tables was approximately 48 hours.

These are therefore high-rate diagnostic/operational datasets rather than
unbounded historical storage.

## 3.3 Important PostgreSQL high-water-mark behavior

The application currently purges the two event tables using DELETE.

Deleting rows:

- makes space reusable by PostgreSQL;
- does not normally shrink the relation files on disk;
- creates dead tuples until vacuum processing catches up;
- can leave a high-water mark that reflects peak recent activity.

A normal VACUUM does not return relation space to the filesystem.
VACUUM FULL can reclaim filesystem space but is intrusive and must not become
the normal retention mechanism.

The future report must distinguish:

    logical live data
    allocated relation size
    reclaimable/dead space estimate
    filesystem/database size

---

# 4. Initial findings

## 4.1 Index storage is a major cost

Indexes represent a very large fraction of the current database footprint.

Examples:

- gateway_device_ble_observations: indexes are larger than table data;
- observations: index footprint is approximately equal to table data;
- gateway_traffic_events: approximately 521 MB of indexes;
- metric_routing_events: approximately 207 MB of indexes.

Some large indexes had zero scans in the current PostgreSQL statistics window.
That is a review signal, not proof that an index is unnecessary.

Index removal must never be automated from usage counters alone.

## 4.2 BLE raw observations are a high-priority optimization candidate

gateway_device_ble_observations currently consumes about 1.1 GB with a
30-day retention target.

Questions to resolve:

- how many days of raw BLE observations are functionally useful?
- can raw retention become 7/14/30 days configurable?
- should older BLE data be aggregated rather than retained raw?
- what compression ratio can Timescale achieve?

## 4.3 Raw observations already have the beginning of a tiered model

Current policies:

    observations raw          90 days
    observation_hourly        1 year

This is promising, but application queries do not currently use
observation_hourly as the general long-range history source.

Raw retention must not be reduced until long-range queries can safely switch to
an aggregate representation.

## 4.4 Measurements remain functional data

measurements is actively used for:

- latest sensor values;
- sensor history;
- alert scheduling;
- asset/sensor last-seen behavior;
- current-day measurement counts.

It must not be treated as legacy data without a dedicated functional redesign.

---

# 5. Product concept — Database Storage & Retention

The feature should live in the administrative/system area.

Proposed page name:

    Database Storage & Retention

Alternative shorter navigation label:

    Database Storage

The page is an operational dashboard, not a generic PostgreSQL administration
console.

---

# 6. DB-1 — Reporting & Observability

## 6.1 Goal

Provide a complete read-only operator view of database storage and growth.

DB-1 may persist bounded storage-observability snapshots. No SensorSphere
business-data mutation, retention change, purge, compression or index mutation
is permitted in DB-1.

## 6.2 Summary cards

Display at minimum:

- current database size;
- table/data bytes;
- index bytes;
- estimated dead/reclaimable bytes where meaningful;
- growth over 24h;
- growth over 7d;
- growth over 30d;
- filesystem free space;
- latest verified backup size;
- storage warning budget;
- storage critical budget;
- estimated size in 30/90/180/365 days from observed trend.

Example:

    Database size        3.57 GB
    Data                 1.95 GB
    Indexes              1.62 GB
    Growth / day         +420 MB
    30-day projection    8.9 GB
    Budget               10 GB
    Status               WARNING

Values above are illustrative except for the measured database size.

## 6.3 Top storage consumers

Columns:

- schema;
- relation/data-family name;
- category;
- type: table / hypertable / continuous aggregate;
- total size;
- table/data size;
- index size;
- index/data ratio;
- approximate live rows;
- dead tuples;
- dead tuple percentage;
- oldest timestamp where applicable;
- newest timestamp;
- data window;
- configured retention;
- compression enabled;
- chunk count;
- estimated growth/day;
- projected 30-day size;
- status/recommendation.

Sorting by total size descending by default.

## 6.4 TimescaleDB section

Display:

- hypertables;
- chunk count;
- chunk interval;
- size per chunk;
- oldest/newest chunk;
- retention policy;
- compression state;
- continuous aggregates;
- refresh policy;
- aggregate retention policy.

A per-hypertable detail view should make old chunks and their size obvious.

## 6.5 Index section

Display:

- relation;
- index;
- size;
- percentage of relation total;
- index scans;
- rows read/fetched where available;
- uniqueness;
- index definition;
- observation-window caveat.

Classification examples:

    ACTIVE
    LARGE
    LOW OBSERVED USAGE
    REVIEW

Never label an index as automatically safe to delete.

## 6.6 Retention section

Initial known baseline:

| Data family | Raw retention | Aggregate retention | Mechanism |
|---|---:|---:|---|
| gateway traffic events | 48h | none | hourly application DELETE |
| metric routing events | 48h | none | hourly application DELETE |
| BLE observations | 30d | none | Timescale retention policy |
| observations | 90d | observation_hourly 1y | Timescale policies |
| measurements | unlimited/currently undefined | none | no policy |

## 6.7 Growth history

Instantaneous PostgreSQL statistics are not sufficient for trend reporting.

DB-1 should record periodic storage snapshots.

Suggested cadence:

    every 6 hours by default

Minimum snapshot data:

- timestamp;
- database bytes;
- filesystem/free bytes if available safely;
- relation total/data/index bytes;
- estimated live/dead rows;
- chunk counts;
- retention/compression state.

Suggested retention:

    detailed snapshots: 90 days
    optional daily aggregates: 1 year

## 6.8 Storage budgets

Introduce configuration for:

    SENSORSPHERE_DB_STORAGE_WARNING_BYTES
    SENSORSPHERE_DB_STORAGE_CRITICAL_BYTES

Status:

    OK
    WARNING
    CRITICAL

A storage budget is an alerting threshold, not an automatic deletion trigger.

## 6.9 Recommendations

DB-1 may generate read-only recommendations.

Examples:

    INFO
    No compression enabled on observations.

    REVIEW
    gateway_device_ble_observations uses 1.1 GB for a 30-day raw window.

    REVIEW
    Index size exceeds table data size.

    WARNING
    Current growth projects database above configured budget in 18 days.

Recommendations must explain why they are shown and must not perform changes.

---

# 7. DB-2 — Storage Optimization

## 7.1 Goal

Reduce physical storage cost without changing intended retention or functional
history.

## 7.2 Timescale compression

Evaluate compression independently for:

- observations;
- gateway_device_ble_observations;
- measurements.

Required before enabling:

- representative compression ratio measurement;
- write/read performance test;
- API history query regression test;
- backup size/duration comparison;
- restore compatibility validation;
- rollback/disable procedure.

Prefer compressing only chunks older than a recent writable window.

Candidate model to benchmark:

    keep recent 7 days uncompressed
    compress older chunks

The final interval must come from measured behavior.

## 7.3 Event tables

Evaluate converting:

- gateway_traffic_events;
- metric_routing_events;

to Timescale hypertables or equivalent time-partitioned structures.

Objective:

    drop expired chunks/partitions
        instead of
    deleting millions of rows continuously

Expected benefits:

- predictable retention cost;
- less dead-tuple churn;
- easier physical space management;
- simpler per-period storage reporting.

Migration must preserve API behavior and existing 48-hour semantics.

## 7.4 Index audit

For every large index:

1. record size;
2. observe usage over a meaningful period;
3. map it to known queries;
4. test query plans with/without candidate index safely;
5. estimate write amplification;
6. only then propose modification/removal.

No automatic index deletion.

## 7.5 Physical-space reclamation

Document and expose the difference between:

- reusable internal free space;
- actual filesystem space;
- chunk drop;
- VACUUM;
- VACUUM FULL;
- REINDEX.

Intrusive maintenance remains an explicit maintenance operation.

---

# 8. DB-3 — Retention Management

## 8.1 Goal

Make data lifecycle configurable and predictable while protecting users from
accidental data loss.

## 8.2 Configurable policies

Candidate logical settings:

    BLE raw retention
    observations raw retention
    observations aggregate retention
    measurements retention
    gateway traffic diagnostic retention
    metric routing diagnostic retention

Exact configuration names will be defined during implementation.

## 8.3 Preview before apply

Changing retention must first produce a dry-run preview.

Example:

    BLE raw retention
    Current: 30 days
    Proposed: 14 days

    Eligible historical range:
      2026-09-01 -> 2026-09-16

    Chunks eligible:
      3

    Estimated data affected:
      2.4 million rows
      612 MB allocated storage

    Action:
      REVIEW REQUIRED

No destructive action occurs from preview.

## 8.4 Safety levels

LOW RISK examples:

- enable reporting;
- change warning threshold;
- collect snapshots;
- compression after validated rollout.

REVIEW REQUIRED examples:

- shorten retention;
- remove/rebuild an index;
- convert table partitioning;
- reduce raw history after aggregate support exists.

DESTRUCTIVE examples:

- immediate manual purge;
- dropping old chunks outside configured policy;
- VACUUM FULL;
- deleting historical data with no aggregate replacement.

## 8.5 Backup gate

For destructive retention operations, evaluate requiring:

- a recent verified Recovery Point;
- backup age below a configurable safety threshold;
- explicit operator confirmation.

The backup system remains independent, but the retention UI may consume its
health/status as a safety signal.

## 8.6 Auditability

Record retention-policy changes:

- operator;
- timestamp;
- previous policy;
- new policy;
- preview result;
- execution result.

Do not log secrets.

---

# 9. DB-4 — Historical Aggregation & Tiered Retention

## 9.1 Goal

Allow long historical windows without retaining all high-frequency raw data.

## 9.2 Observation history routing

Adapt API history queries so that the data source depends on requested range and
resolution.

Example:

    recent/high-resolution range
        -> observations raw

    long-range/hourly resolution
        -> observation_hourly

Potential future daily aggregate:

    very long range
        -> observation_daily

## 9.3 Functional fidelity

Before reducing raw retention, validate:

- charts;
- min/max/avg semantics;
- gaps/nulls;
- mixed data types;
- quality metadata requirements;
- timezone behavior;
- export behavior;
- alert/history dependencies.

## 9.4 BLE aggregation

Decide whether long-term BLE history needs:

- raw observations;
- hourly seen-count;
- min/max/avg RSSI;
- first-seen/last-seen;
- gateway/device coverage summary.

Only after this decision should BLE raw retention be shortened.

---

# 10. Proposed API surface

DB-1 candidates:

    GET /api/admin/database/storage
    GET /api/admin/database/storage/relations
    GET /api/admin/database/storage/timescale
    GET /api/admin/database/storage/indexes
    GET /api/admin/database/storage/history
    GET /api/admin/database/storage/retention
    GET /api/admin/database/storage/recommendations

Potential later DB-3 endpoints:

    POST /api/admin/database/storage/retention/preview
    POST /api/admin/database/storage/retention/apply

Exact route structure remains an implementation decision.

All endpoints require Admin authorization when authentication is enabled.

---

# 11. Storage categories

The dashboard should classify known objects into product-oriented categories.

Suggested categories:

    Core configuration
    Measurements
    Observations
    BLE discovery/coverage
    Routing diagnostics
    Gateway diagnostics
    Aggregates
    Audit/operational state
    Database internal
    Unknown

Unknown large relations should be highlighted for review.

---

# 12. Alerting candidates

Future alert conditions:

- database exceeds warning budget;
- database exceeds critical budget;
- projected budget exhaustion within N days;
- relation grows significantly faster than baseline;
- retention policy job failing;
- compression policy failing;
- oldest data exceeds expected retention by a tolerance;
- storage snapshots no longer being collected;
- filesystem free space below safety threshold.

These alerts should eventually integrate with the normal SensorSphere alerting
model rather than inventing a parallel notification system.

---

# 13. Success criteria

An administrator must be able to answer, without direct SQL:

1. How large is my database?
2. What are the top storage consumers?
3. How much is data versus indexes?
4. Which datasets are growing fastest?
5. How long is each data family retained?
6. Which Timescale chunks consume the space?
7. Is compression active?
8. What will the database size likely be in 30/90 days, 6 months and 1 year?
9. What can be optimized without losing data?
10. What data would be lost before I approve a retention change?
11. Is a recent verified backup available before a destructive action?
12. Is database growth under the configured storage budget?

---

# 14. TODO / implementation roadmap

Task IDs are stable and should be referenced by future PRs.

## DB-1 — Reporting & Observability

Status: IMPLEMENTED ON DEV — acceptance tracking

### Backend / data collection

- [x] DBST-001 — Define storage report DTO/API contract.
- [x] DBST-002 — Implement total database/data/index size reporting.
- [x] DBST-003 — Implement top relation storage reporting.
- [x] DBST-004 — Report live/dead tuple estimates and vacuum metadata.
- [x] DBST-005 — Report Timescale hypertables/chunks and chunk sizes.
- [x] DBST-006 — Report Timescale retention policies.
- [x] DBST-007 — Report Timescale compression state.
- [x] DBST-008 — Report continuous aggregates and refresh/retention policies.
- [x] DBST-009 — Report index size and observed usage statistics.
- [x] DBST-010 — Classify known SensorSphere relations by data family.
- [x] DBST-011 — Detect/report unknown large relations.
- [x] DBST-012 — Add storage snapshot persistence.
- [x] DBST-013 — Add bounded retention for storage snapshots.
- [x] DBST-014 — Calculate 24h/7d/30d growth.
- [x] DBST-015 — Calculate simple 30/90-day plus 6-month/1-year projections.
- [x] DBST-016 — Add storage warning/critical budget configuration.
- [x] DBST-017 — Generate non-destructive recommendation objects.
- [ ] DBST-018 — Expose latest verified backup size/age as safety context.

### UI

- [x] DBST-020 — Add Admin Database Storage & Retention page.
- [x] DBST-021 — Add summary cards.
- [x] DBST-022 — Add Top storage consumers table.
- [x] DBST-023 — Add Timescale/chunks view.
- [x] DBST-024 — Add indexes view.
- [x] DBST-025 — Add retention-policy view.
- [x] DBST-026 — Add growth chart.
- [x] DBST-027 — Add storage budget status.
- [x] DBST-028 — Add recommendations panel.
- [x] DBST-029 — Add relation detail drill-down.
- [x] DBST-030 — Clearly label all DB-1 views as diagnostic/read-only.

### Tests / acceptance

- [x] DBST-040 — Unit tests for size/report transformations.
- [x] DBST-041 — API authorization tests.
- [ ] DBST-042 — Test on empty/small database.
- [x] DBST-043 — Test on DEV multi-GB database.
- [x] DBST-044 — Verify reporting queries do not materially impact ingestion.
- [x] DBST-045 — Verify snapshot retention is bounded.
- [x] DBST-046 — Verify no DB-1 endpoint can mutate database content.
- [x] DBST-047 — Establish DEV baseline screenshot/report for comparison.

## DB-2 — Storage Optimization

Status: ACCEPTED — DEV + DIT

Measured DEV results, event-table prototypes and the physical-space runbook are
recorded in `docs/database/storage-retention-db2-dev-results.md`.

- [x] DBST-100 — Benchmark Timescale compression on observations.
- [x] DBST-101 — Benchmark Timescale compression on BLE observations.
- [x] DBST-102 — Benchmark Timescale compression on measurements.
- [x] DBST-103 — Compare backup size/duration before/after compression.
- [x] DBST-104 — Validate restore compatibility with compressed chunks.
- [x] DBST-105 — Define recent uncompressed window per hypertable (7-day policy; effective ~7–14 days with current chunks).
- [x] DBST-106 — Audit large indexes and map each to application queries.
- [x] DBST-107 — Establish minimum observation period before calling an index low-use (30 days minimum; 90 days preferred).
- [x] DBST-108 — Prototype event tables as Timescale hypertables/partitions.
- [x] DBST-109 — Validate 48h event retention using chunk/partition drop.
- [x] DBST-110 — Compare DELETE vs chunk-drop vacuum/bloat behavior.
- [x] DBST-111 — Define safe physical-space reclamation runbook.
- [x] DBST-112 — Add and validate optimization recommendations in dashboard.

## DB-3 — Retention Management

Status: ACCEPTED — DEV + DIT (2026-10-05)

Validation details:
`docs/database/storage-retention-db3-dev-dit-results.md`.

- [x] DBST-200 — Define supported per-data-family retention settings.
- [x] DBST-201 — Add retention configuration validation.
- [x] DBST-202 — Implement retention dry-run/preview.
- [x] DBST-203 — Estimate affected time range/chunks/rows/bytes.
- [x] DBST-204 — Add LOW RISK / REVIEW REQUIRED / DESTRUCTIVE classification.
- [x] DBST-205 — Add retention-change confirmation UI.
- [x] DBST-206 — Evaluate recent-verified-backup safety gate.
- [x] DBST-207 — Implement explicit retention apply operation.
- [x] DBST-208 — Add audit log of retention changes.
- [x] DBST-209 — Test interruption/failure behavior.
- [x] DBST-210 — Validate no cross-instance retention operation is possible.
- [x] DBST-211 — Document physical versus logical space after retention.

DB-3 operational semantics:

- shortening a retention window is `DESTRUCTIVE` and requires a recent
  successful Backup V2 Recovery Point;
- extending a window or switching to Unlimited is `REVIEW_REQUIRED`;
- apply requires the exact confirmation text `APPLY RETENTION`;
- apply re-checks the current effective policy and rejects stale previews;
- Timescale retention reclaims physical storage when complete chunks are
  dropped;
- ordinary PostgreSQL DELETE retention makes pages reusable but normally does
  not shrink the table file immediately;
- diagnostic-table DELETE work remains asynchronous in the ingestion service,
  not inside the Admin HTTP request;
- the API cannot target another SensorSphere instance, arbitrary relation,
  database DSN or filesystem path.

## DB-4 — Historical Aggregation & Tiered Retention

Status: ACCEPTED — DEV + DIT (2026-10-06)

Validation details:
`docs/database/storage-retention-db4-dev-dit-results.md`.

- [x] DBST-300 — Inventory all API consumers of raw observations.
- [x] DBST-301 — Define range/resolution selection rules.
- [x] DBST-302 — Use observation_hourly for eligible history queries.
- [x] DBST-303 — Validate chart fidelity raw versus hourly.
- [x] DBST-304 — Validate exports and API contracts.
- [x] DBST-305 — Evaluate daily continuous aggregate; not required for the current <=30-day UI horizon.
- [x] DBST-306 — Define a safe raw-observation retention target; retain 90 days under the current exact-history contract.
- [x] DBST-307 — Define BLE long-term information requirements.
- [x] DBST-308 — Evaluate BLE hourly/daily aggregation; defer until delete/reset coherency or a longer history horizon justifies it.
- [x] DBST-309 — Evaluate raw-retention reduction after functional acceptance; no reduction applied because no contract-safe lower target was selected.
- [x] DBST-310 — Validate resulting steady-state storage budget.

DB-4 operational semantics:

- latest observations, alert evaluation and exact observation history remain on
  raw observations;
- 1/5/15-minute aggregate requests use raw observations;
- 1-hour, 6-hour and 1-day aggregate requests use
  `observation_hourly` plus exact raw boundary segments;
- the hourly continuous aggregate runs in Timescale real-time mode;
- public observation API response contracts are unchanged;
- raw observation retention remains 90 days and hourly retention remains one
  year;
- normalized raw + hourly observation storage is projected at approximately
  420.7 MB steady-state with the current DEV ingestion profile;
- no daily or BLE aggregate is introduced in DB-4.

---

# 15. Explicit non-goals for DB-1

DB-1 will not:

- delete rows;
- drop chunks;
- change retention policies;
- enable compression;
- execute VACUUM FULL;
- rebuild/drop indexes;
- change hypertable definitions;
- automatically enforce storage budgets.

It reports facts and recommendations only.

---

# 16. First implementation recommendation

Start with DB-1 as one focused feature/PR series.

The minimum useful first increment should provide:

1. current database size;
2. top relations with data/index split;
3. Timescale hypertable/chunk sizes;
4. retention/compression state;
5. known data-family classification;
6. a read-only Admin page.

Historical snapshots, projections and recommendations can then be layered on top
without introducing destructive behavior.

This gives SensorSphere immediate visibility into database growth while keeping
the first implementation operationally safe.
