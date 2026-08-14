-- SensorSphere alert rule runtime state.
-- Migration: 011-alert-rule-state.sql
--
-- This state is persisted so duration and cooldown behavior survives
-- API restarts and scheduler cycles.

CREATE TABLE IF NOT EXISTS alert_rule_state (
  rule_id uuid PRIMARY KEY
    REFERENCES alert_rules(id)
    ON DELETE CASCADE,

  condition_started_at timestamptz NULL,

  last_triggered_at timestamptz NULL,

  last_resolved_at timestamptz NULL,

  created_at timestamptz NOT NULL
    DEFAULT NOW(),

  updated_at timestamptz NOT NULL
    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS
  idx_alert_rule_state_condition_started_at
  ON alert_rule_state(
    condition_started_at
  )
  WHERE condition_started_at
    IS NOT NULL;

CREATE INDEX IF NOT EXISTS
  idx_alert_rule_state_last_triggered_at
  ON alert_rule_state(
    last_triggered_at DESC
  )
  WHERE last_triggered_at
    IS NOT NULL;

CREATE INDEX IF NOT EXISTS
  idx_alert_rule_state_last_resolved_at
  ON alert_rule_state(
    last_resolved_at DESC
  )
  WHERE last_resolved_at
    IS NOT NULL;
