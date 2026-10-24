-- RE-07-B: isolated historical query snapshots. Never part of live observations.
CREATE TABLE IF NOT EXISTS netatmo_historical_series (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES netatmo_connections(id) ON DELETE CASCADE,
  room_digest TEXT NOT NULL CHECK (room_digest ~ '^[a-f0-9]{64}$'),
  fetched_at TIMESTAMPTZ NOT NULL,
  requested_begin TIMESTAMPTZ NOT NULL,
  requested_end TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL DEFAULT 'netatmo:getroommeasure:historical'
    CHECK (source = 'netatmo:getroommeasure:historical'),
  quality TEXT NOT NULL DEFAULT 'historical_unverified_timestamp'
    CHECK (quality = 'historical_unverified_timestamp'),
  acquisition_at TIMESTAMPTZ DEFAULT NULL CHECK (acquisition_at IS NULL),
  grid_step_seconds INTEGER CHECK (grid_step_seconds IS NULL OR grid_step_seconds > 0),
  points JSONB NOT NULL CHECK (jsonb_typeof(points)='array' AND jsonb_array_length(points)<=48),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT historical_series_window CHECK (requested_begin < requested_end)
);
CREATE INDEX IF NOT EXISTS idx_netatmo_historical_series_recent
  ON netatmo_historical_series (connection_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_netatmo_historical_series_retention
  ON netatmo_historical_series (created_at);
