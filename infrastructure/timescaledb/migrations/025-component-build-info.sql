CREATE TABLE IF NOT EXISTS component_build_info (
  component TEXT PRIMARY KEY,
  build_date TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE component_build_info IS
  'Build metadata reported by SensorSphere runtime components.';
