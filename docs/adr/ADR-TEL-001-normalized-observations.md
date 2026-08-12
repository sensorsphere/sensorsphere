# ADR-TEL-001: Normalized Observation Model

## Status

Accepted

## Decision

SensorSphere stores normalized telemetry in `observations`.

Each observation belongs to one `asset_metric` and contains exactly one typed
value:

- `value_double`
- `value_text`
- `value_boolean`
- `value_json`

The acquisition protocol is metadata (`source`, `source_ref`) and does not
define the domain model.

The relationship is:

```text
Location
  -> Asset
    -> Asset Metric
      -> Observation
```

The existing `measurements` table remains available during migration so current
BLE/MQTT ingestion continues to operate unchanged.

## Consequences

- BLE, MQTT, Zigbee, Modbus and HTTP can target the same telemetry model.
- Metric identity is stable independently of acquisition protocol.
- Existing telemetry can be migrated incrementally.
