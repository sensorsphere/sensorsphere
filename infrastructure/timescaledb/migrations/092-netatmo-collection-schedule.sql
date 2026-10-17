-- Independent durable Netatmo collection schedule. Zero disables collection.
ALTER TABLE netatmo_connections
  ADD COLUMN IF NOT EXISTS collect_interval_seconds INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS collect_last_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS collect_last_success_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS collect_next_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes'),
  ADD COLUMN IF NOT EXISTS collect_last_error TEXT,
  ADD COLUMN IF NOT EXISTS collect_last_observations INTEGER,
  ADD CONSTRAINT netatmo_collection_interval_range CHECK (collect_interval_seconds = 0 OR collect_interval_seconds BETWEEN 60 AND 86400);
