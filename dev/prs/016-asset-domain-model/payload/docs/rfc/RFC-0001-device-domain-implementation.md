# RFC-0001 — Device Domain Implementation Notes

PR-016 implements the first production-compatible step of RFC-0001.

Implemented:

- Asset domain type
- Asset Metric domain type
- `assets` persistence
- `asset_metrics` persistence
- legacy Sensor to Asset backfill
- read-only Asset API

Deferred:

- Asset write API
- Asset-native ingestion
- generic metric-value storage
- Gateway role migration
- removal of legacy Sensor APIs

Existing sensor UUIDs are reused as Asset UUIDs for legacy sensors.
