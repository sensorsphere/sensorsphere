-- Assets no longer own a display name. Sensor-backed assets always use the
-- canonical sensor name, with external_id as the fallback for non-sensor assets.

CREATE OR REPLACE VIEW active_alerts AS
SELECT
  e.id,
  e.rule_id,
  e.asset_id,
  e.asset_metric_id,
  e.status,
  e.severity,
  e.opened_at,
  e.acknowledged_at,
  e.current_value,
  e.trigger_value,
  e.message,
  e.metadata,
  r.name AS rule_name,
  r.condition_type,
  a.external_id AS asset_external_id,
  COALESCE(s.name, a.external_id) AS asset_display_name,
  am.metric_key,
  am.display_name AS metric_display_name,
  am.unit
FROM alert_events e
JOIN alert_rules r ON r.id = e.rule_id
JOIN assets a ON a.id = e.asset_id
LEFT JOIN sensors s ON s.sensor_uid = a.source_sensor_uid
LEFT JOIN asset_metrics am ON am.id = e.asset_metric_id
WHERE e.status IN ('ACTIVE', 'ACKNOWLEDGED');

ALTER TABLE assets
  DROP COLUMN IF EXISTS name;
