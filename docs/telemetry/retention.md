# Telemetry Retention

SensorSphere keeps normalized raw observations for 90 days.

Numeric observations are downsampled into hourly aggregates containing:

- minimum;
- maximum;
- average;
- sample count.

Hourly aggregates are retained for one year.

## Query tiering

The raw 90-day window remains the contract for exact observation history.
`/api/v1/observations/history` therefore continues to read raw observations
because it returns individual samples including source, source reference and
quality metadata.

`/api/v1/observations/aggregate` selects the storage tier by requested
resolution:

| Bucket | Source |
|---|---|
| 1 minute | raw observations |
| 5 minutes | raw observations |
| 15 minutes | raw observations |
| 1 hour | observation_hourly + raw boundary samples |
| 6 hours | observation_hourly + raw boundary samples |
| 1 day | observation_hourly + raw boundary samples |

For hourly-compatible buckets, complete hours come from
`observation_hourly`. Partial hours at the requested start/end boundaries are
computed from raw observations so non-aligned query windows preserve the
previous API semantics exactly.

The continuous aggregate refresh policy covers the most recent 30 days and
stops one hour before the current time. The view is configured as a Timescale
real-time continuous aggregate, so data newer than the materialization
watermark is transparently combined with the materialized history.

Latest-observation lookup and alert evaluation always continue to use raw
observations.

## Retention decision

DB-4 does not reduce the 90-day raw retention. The exact-history API currently
documents and exposes that raw window, while hourly aggregates cannot preserve
per-sample source/quality metadata. A lower raw-retention target would therefore
require an explicit API-contract change rather than an invisible storage
optimization.
