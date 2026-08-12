# Telemetry Retention

SensorSphere keeps normalized raw observations for 90 days.

Numeric observations are downsampled into hourly aggregates containing:

- minimum;
- maximum;
- average;
- sample count.

Hourly aggregates are retained for one year.

The continuous aggregate refresh window covers the most recent 30 days and
stops one hour before the current time. This keeps the refresh window inside
the raw-data retention period.
