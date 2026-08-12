-- Introduce the normalized telemetry observation model.
-- Legacy measurements remain available during the migration period.

CREATE TABLE IF NOT EXISTS observations (
  time timestamptz NOT NULL,
  asset_metric_id uuid NOT NULL,
  value_double double precision,
  value_text text,
  value_boolean boolean,
  value_json jsonb,
  source text,
  source_ref text,
  quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fk_observations_asset_metric
    FOREIGN KEY (asset_metric_id)
    REFERENCES asset_metrics(id)
    ON DELETE CASCADE,

  CONSTRAINT chk_observations_single_value
    CHECK (
      num_nonnulls(
        value_double,
        value_text,
        value_boolean,
        value_json
      ) = 1
    )
);

SELECT create_hypertable(
  'observations',
  'time',
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_observations_metric_time
  ON observations(asset_metric_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_observations_source_ref_time
  ON observations(source_ref, time DESC)
  WHERE source_ref IS NOT NULL;
