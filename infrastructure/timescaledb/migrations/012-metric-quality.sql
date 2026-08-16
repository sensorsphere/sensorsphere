-- Add configurable quality policies to asset metrics.
-- Quality is evaluated by the API from the latest numeric observation value.

ALTER TABLE asset_metrics
  ADD COLUMN IF NOT EXISTS quality_config jsonb NOT NULL
  DEFAULT '{"mode":"NONE"}'::jsonb;

CREATE OR REPLACE FUNCTION metric_quality_default(
  metric_key text
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(metric_key)
    WHEN 'temperature' THEN
      '{"mode":"RANGE","criticalMin":10,"warningMin":18,"warningMax":26,"criticalMax":35}'::jsonb
    WHEN 'humidity' THEN
      '{"mode":"RANGE","criticalMin":20,"warningMin":30,"warningMax":70,"criticalMax":80}'::jsonb
    WHEN 'battery' THEN
      '{"mode":"HIGHER_IS_BETTER","warning":20,"good":50}'::jsonb
    WHEN 'battery_level' THEN
      '{"mode":"HIGHER_IS_BETTER","warning":20,"good":50}'::jsonb
    WHEN 'rssi' THEN
      '{"mode":"HIGHER_IS_BETTER","warning":-80,"good":-65}'::jsonb
    WHEN 'voltage' THEN
      '{"mode":"NONE"}'::jsonb
    WHEN 'battery_voltage' THEN
      '{"mode":"NONE"}'::jsonb
    ELSE
      '{"mode":"NONE"}'::jsonb
  END;
$$;

CREATE OR REPLACE FUNCTION metric_quality_config_is_valid(
  config jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    CASE config->>'mode'
    WHEN 'NONE' THEN TRUE

    WHEN 'HIGHER_IS_BETTER' THEN
      jsonb_typeof(config->'warning') = 'number'
      AND jsonb_typeof(config->'good') = 'number'
      AND (config->>'warning')::double precision
          < (config->>'good')::double precision

    WHEN 'LOWER_IS_BETTER' THEN
      jsonb_typeof(config->'good') = 'number'
      AND jsonb_typeof(config->'warning') = 'number'
      AND (config->>'good')::double precision
          < (config->>'warning')::double precision

    WHEN 'RANGE' THEN
      jsonb_typeof(config->'criticalMin') = 'number'
      AND jsonb_typeof(config->'warningMin') = 'number'
      AND jsonb_typeof(config->'warningMax') = 'number'
      AND jsonb_typeof(config->'criticalMax') = 'number'
      AND (config->>'criticalMin')::double precision
          < (config->>'warningMin')::double precision
      AND (config->>'warningMin')::double precision
          <= (config->>'warningMax')::double precision
      AND (config->>'warningMax')::double precision
          < (config->>'criticalMax')::double precision

      ELSE FALSE
    END,
    FALSE
  );
$$;

UPDATE asset_metrics
SET quality_config = metric_quality_default(metric_key)
WHERE quality_config = '{"mode":"NONE"}'::jsonb;

-- Future inserts that omit quality_config are initialized by the trigger below.
-- Dropping the column default lets an explicit {"mode":"NONE"} remain a real
-- user choice for known metric keys.
ALTER TABLE asset_metrics
  ALTER COLUMN quality_config DROP DEFAULT;

ALTER TABLE asset_metrics
  DROP CONSTRAINT IF EXISTS chk_asset_metrics_quality_config;

ALTER TABLE asset_metrics
  ADD CONSTRAINT chk_asset_metrics_quality_config
  CHECK (metric_quality_config_is_valid(quality_config));

CREATE OR REPLACE FUNCTION set_metric_quality_default()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.quality_config IS NULL THEN
    NEW.quality_config := metric_quality_default(NEW.metric_key);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_asset_metrics_quality_default
  ON asset_metrics;

CREATE TRIGGER trg_asset_metrics_quality_default
BEFORE INSERT ON asset_metrics
FOR EACH ROW
EXECUTE FUNCTION set_metric_quality_default();
