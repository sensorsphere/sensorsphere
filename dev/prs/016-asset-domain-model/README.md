# PR-016 — Asset Domain Model

Implements the first incremental production step of RFC-0001.

Adds:

- `assets`
- `asset_metrics`
- legacy Sensor -> Asset backfill
- core Asset types
- `GET /api/v1/assets`
- `GET /api/v1/assets/:id`

Existing Sensor and telemetry APIs remain unchanged.
