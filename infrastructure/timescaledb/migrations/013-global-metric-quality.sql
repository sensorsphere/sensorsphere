-- Global metric quality policies with per-asset-metric overrides.
--
-- asset_metrics.quality_config becomes an optional per-sensor override:
--   NULL  -> inherit the global policy for metric_key
--   JSONB -> override the global policy for this specific asset metric

CREATE TABLE IF NOT EXISTS metric_quality_policies (
  metric_key text PRIMARY KEY,
  quality_config jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_metric_quality_policies_config
    CHECK (
      metric_quality_config_is_valid(
        quality_config
      )
    )
);

-- Create global policies for all metric keys already present.
INSERT INTO metric_quality_policies (
  metric_key,
  quality_config
)
SELECT DISTINCT
  am.metric_key,
  metric_quality_default(
    am.metric_key
  )
FROM asset_metrics am
ON CONFLICT (metric_key) DO NOTHING;

-- QUALITY-001 forced a default configuration onto each newly-created metric.
-- QUALITY-004 replaces this with inheritance from the global policy.
DROP TRIGGER IF EXISTS trg_asset_metrics_quality_default
  ON asset_metrics;

DROP FUNCTION IF EXISTS set_metric_quality_default();

-- A NULL quality_config now means "inherit global".
ALTER TABLE asset_metrics
  ALTER COLUMN quality_config DROP NOT NULL;

ALTER TABLE asset_metrics
  DROP CONSTRAINT IF EXISTS chk_asset_metrics_quality_config;

ALTER TABLE asset_metrics
  ADD CONSTRAINT chk_asset_metrics_quality_config
  CHECK (
    quality_config IS NULL
    OR metric_quality_config_is_valid(
      quality_config
    )
  );

-- Convert old QUALITY-001 defaults into inherited configuration.
-- Values that differ from the global default are preserved as sensor overrides.
UPDATE asset_metrics am
SET quality_config = NULL
FROM metric_quality_policies gp
WHERE gp.metric_key = am.metric_key
  AND am.quality_config = gp.quality_config;
