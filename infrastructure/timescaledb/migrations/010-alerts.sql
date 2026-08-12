-- SensorSphere Alert Engine schema.
-- Migration: 010-alerts.sql

CREATE TABLE IF NOT EXISTS alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  name text NOT NULL,
  description text NULL,
  enabled boolean NOT NULL DEFAULT TRUE,

  severity text NOT NULL
    CHECK (
      severity IN (
        'INFO',
        'WARNING',
        'CRITICAL'
      )
    ),

  condition_type text NOT NULL
    CHECK (
      condition_type IN (
        'ABOVE',
        'BELOW',
        'BETWEEN',
        'OUTSIDE',
        'OFFLINE',
        'NO_DATA'
      )
    ),

  asset_id uuid NULL
    REFERENCES assets(id)
    ON DELETE CASCADE,

  asset_metric_id uuid NULL
    REFERENCES asset_metrics(id)
    ON DELETE CASCADE,

  threshold_min double precision NULL,
  threshold_max double precision NULL,

  duration_seconds integer NOT NULL DEFAULT 0
    CHECK (
      duration_seconds >= 0
    ),

  cooldown_seconds integer NOT NULL DEFAULT 0
    CHECK (
      cooldown_seconds >= 0
    ),

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_alert_rules_target
    CHECK (
      asset_id IS NOT NULL
      OR asset_metric_id IS NOT NULL
    ),

  CONSTRAINT chk_alert_rules_thresholds
    CHECK (
      (
        condition_type IN (
          'ABOVE',
          'BELOW'
        )
        AND threshold_min IS NOT NULL
      )
      OR
      (
        condition_type IN (
          'BETWEEN',
          'OUTSIDE'
        )
        AND threshold_min IS NOT NULL
        AND threshold_max IS NOT NULL
        AND threshold_min < threshold_max
      )
      OR
      (
        condition_type IN (
          'OFFLINE',
          'NO_DATA'
        )
        AND threshold_min IS NULL
        AND threshold_max IS NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled
  ON alert_rules(enabled)
  WHERE enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_alert_rules_asset_id
  ON alert_rules(asset_id)
  WHERE asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_alert_rules_asset_metric_id
  ON alert_rules(asset_metric_id)
  WHERE asset_metric_id IS NOT NULL;


CREATE TABLE IF NOT EXISTS alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  rule_id uuid NOT NULL
    REFERENCES alert_rules(id)
    ON DELETE CASCADE,

  asset_id uuid NOT NULL
    REFERENCES assets(id)
    ON DELETE CASCADE,

  asset_metric_id uuid NULL
    REFERENCES asset_metrics(id)
    ON DELETE SET NULL,

  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (
      status IN (
        'ACTIVE',
        'ACKNOWLEDGED',
        'RESOLVED'
      )
    ),

  severity text NOT NULL
    CHECK (
      severity IN (
        'INFO',
        'WARNING',
        'CRITICAL'
      )
    ),

  opened_at timestamptz NOT NULL DEFAULT NOW(),
  acknowledged_at timestamptz NULL,
  resolved_at timestamptz NULL,

  current_value double precision NULL,
  trigger_value double precision NULL,

  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_alert_events_status_timestamps
    CHECK (
      (
        status = 'ACTIVE'
        AND acknowledged_at IS NULL
        AND resolved_at IS NULL
      )
      OR
      (
        status = 'ACKNOWLEDGED'
        AND acknowledged_at IS NOT NULL
        AND resolved_at IS NULL
      )
      OR
      (
        status = 'RESOLVED'
        AND resolved_at IS NOT NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_alert_events_rule_id
  ON alert_events(rule_id);

CREATE INDEX IF NOT EXISTS idx_alert_events_asset_id
  ON alert_events(asset_id);

CREATE INDEX IF NOT EXISTS idx_alert_events_asset_metric_id
  ON alert_events(asset_metric_id)
  WHERE asset_metric_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_alert_events_status
  ON alert_events(status);

CREATE INDEX IF NOT EXISTS idx_alert_events_opened_at
  ON alert_events(opened_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_alert_events_open_rule_asset
  ON alert_events(rule_id, asset_id)
  WHERE status IN (
    'ACTIVE',
    'ACKNOWLEDGED'
  );


CREATE TABLE IF NOT EXISTS alert_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  alert_event_id uuid NOT NULL
    REFERENCES alert_events(id)
    ON DELETE CASCADE,

  acknowledged_by text NULL,
  comment text NULL,

  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_acknowledgements_event_id
  ON alert_acknowledgements(alert_event_id);

CREATE INDEX IF NOT EXISTS idx_alert_acknowledgements_created_at
  ON alert_acknowledgements(created_at DESC);


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

  COALESCE(
    s.name,
    a.name,
    a.external_id
  ) AS asset_display_name,

  am.metric_key,
  am.display_name AS metric_display_name,
  am.unit

FROM alert_events e

JOIN alert_rules r
  ON r.id = e.rule_id

JOIN assets a
  ON a.id = e.asset_id

LEFT JOIN sensors s
  ON s.sensor_uid =
     a.source_sensor_uid

LEFT JOIN asset_metrics am
  ON am.id =
     e.asset_metric_id

WHERE e.status IN (
  'ACTIVE',
  'ACKNOWLEDGED'
);
