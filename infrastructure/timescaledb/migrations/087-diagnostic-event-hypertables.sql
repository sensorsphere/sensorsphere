-- DB-5: convert high-volume diagnostic event tables to TimescaleDB
-- hypertables with one-hour chunks and native retention.
--
-- The migration is explicitly transactional because the SensorSphere migration
-- runner executes SQL files with psql -f and does not add BEGIN/COMMIT.
--
-- Conversion is in-place. Existing table identities, IDs, sequences, API names
-- and indexes are preserved. An ACCESS EXCLUSIVE lock prevents writes while
-- the primary keys are changed and existing rows are migrated into chunks.

BEGIN;

SET LOCAL lock_timeout = '60s';
SET LOCAL statement_timeout = '15min';

LOCK TABLE
  public.gateway_traffic_events,
  public.metric_routing_events
IN ACCESS EXCLUSIVE MODE;

ALTER TABLE public.gateway_traffic_events
  DROP CONSTRAINT gateway_traffic_events_pkey;

ALTER TABLE public.gateway_traffic_events
  ADD CONSTRAINT gateway_traffic_events_pkey
  PRIMARY KEY (occurred_at, id);

ALTER TABLE public.metric_routing_events
  DROP CONSTRAINT metric_routing_events_pkey;

ALTER TABLE public.metric_routing_events
  ADD CONSTRAINT metric_routing_events_pkey
  PRIMARY KEY (occurred_at, id);

SELECT create_hypertable(
  'public.gateway_traffic_events',
  'occurred_at',
  chunk_time_interval => INTERVAL '1 hour',
  migrate_data => TRUE,
  create_default_indexes => FALSE,
  if_not_exists => TRUE
);

SELECT create_hypertable(
  'public.metric_routing_events',
  'occurred_at',
  chunk_time_interval => INTERVAL '1 hour',
  migrate_data => TRUE,
  create_default_indexes => FALSE,
  if_not_exists => TRUE
);

DO $$
DECLARE
  retention_seconds BIGINT;
BEGIN
  SELECT settings.retention_seconds
  INTO retention_seconds
  FROM public.database_retention_settings settings
  WHERE settings.policy_key = 'gateway_traffic_events';

  IF retention_seconds IS NOT NULL THEN
    PERFORM add_retention_policy(
      'public.gateway_traffic_events'::regclass,
      drop_after => make_interval(secs => retention_seconds::double precision),
      schedule_interval => INTERVAL '1 hour',
      if_not_exists => TRUE
    );
  END IF;
END
$$;

DO $$
DECLARE
  retention_seconds BIGINT;
BEGIN
  SELECT settings.retention_seconds
  INTO retention_seconds
  FROM public.database_retention_settings settings
  WHERE settings.policy_key = 'metric_routing_events';

  IF retention_seconds IS NOT NULL THEN
    PERFORM add_retention_policy(
      'public.metric_routing_events'::regclass,
      drop_after => make_interval(secs => retention_seconds::double precision),
      schedule_interval => INTERVAL '1 hour',
      if_not_exists => TRUE
    );
  END IF;
END
$$;

COMMIT;
