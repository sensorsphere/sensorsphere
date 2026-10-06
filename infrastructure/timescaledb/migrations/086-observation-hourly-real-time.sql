-- DB-4: use the existing hourly continuous aggregate as a real-time tier.
--
-- With materialized_only=false, TimescaleDB transparently combines the
-- materialized hourly history with raw observations newer than the continuous
-- aggregate watermark. This preserves the current/partial hour while allowing
-- eligible aggregate queries to avoid scanning historical raw chunks.
--
-- No retention policy is changed by this migration.

ALTER MATERIALIZED VIEW observation_hourly
  SET (timescaledb.materialized_only = false);

DO $$
DECLARE
  is_materialized_only boolean;
BEGIN
  SELECT materialized_only
  INTO is_materialized_only
  FROM timescaledb_information.continuous_aggregates
  WHERE view_schema = 'public'
    AND view_name = 'observation_hourly';

  IF is_materialized_only IS DISTINCT FROM false THEN
    RAISE EXCEPTION
      'observation_hourly must be configured as a real-time continuous aggregate';
  END IF;
END
$$;
