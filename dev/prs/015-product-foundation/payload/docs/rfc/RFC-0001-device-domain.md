# RFC-0001 — Device Domain

## Status

Accepted for implementation

## Problem

The current SensorSphere model historically uses the word `sensor` for both a
physical device and the telemetry it produces.

That becomes ambiguous when one physical device exposes several measurements.

Examples:

- Xiaomi BLE thermometer:
  - temperature
  - humidity
  - battery
  - RSSI

- electrical meter:
  - voltage
  - current
  - power
  - energy
  - frequency

SensorSphere needs a protocol-independent model that represents the physical
thing separately from the values it produces.

## Proposed Domain Model

### Asset

An Asset represents a managed physical or logical equipment item.

Examples:

- Xiaomi BLE thermometer
- ESP32 gateway
- electrical meter
- industrial controller
- weather station

Core properties are expected to include:

- internal UUID
- external/protocol identifier
- display name
- description
- manufacturer
- model
- firmware version
- enabled state
- location
- gateway relationship
- tags
- metadata

### Metric

A Metric defines one observable quantity exposed by an Asset.

Examples:

- temperature
- humidity
- battery
- voltage
- current
- RSSI
- CO2

A Metric has semantic identity independent of any specific protocol topic.

Expected properties include:

- internal UUID
- asset UUID
- metric key
- display name
- unit
- value type
- enabled state

### Measurement

A Measurement is a timestamped value for one Metric.

Conceptually:

```text
Asset
  |
  +-- Metric: temperature
  |      |
  |      +-- Measurement @ 10:00 = 24.1 °C
  |      +-- Measurement @ 10:01 = 24.2 °C
  |
  +-- Metric: humidity
         |
         +-- Measurement @ 10:00 = 48 %
```

## Relationship Model

```text
Location
   |
   v
Asset
   |
   +---- Gateway relationship (optional)
   |
   v
Metric
   |
   v
Measurement
```

## Gateway

A Gateway is a specialized Asset role rather than an entirely unrelated domain
object.

This allows an ESP32 to act as a gateway while still having its own operational
metrics such as RSSI, uptime and temperature.

## Protocol Independence

The core domain must not depend on MQTT, BLE, Zigbee, LoRaWAN or Modbus IDs.

Protocol-specific identifiers belong in adapters or external identifier
metadata.

## Compatibility with Current Schema

The existing `sensors` and `measurements` structures remain valid during the
transition.

Migration to Asset/Metric semantics must be incremental.

No big-bang schema rewrite is permitted.

## API Direction

Future inventory APIs should evolve toward:

```text
/api/v1/assets
/api/v1/assets/:id
/api/v1/assets/:id/metrics
/api/v1/metrics/:id/measurements
```

Existing sensor endpoints must remain available during a documented transition
period.

## Open Questions for Implementation

PR-016 should resolve:

- exact Asset table structure
- whether `Metric` receives a dedicated table immediately
- compatibility mapping from existing `sensor_uid`
- strategy for legacy sensor APIs
- gateway role representation
