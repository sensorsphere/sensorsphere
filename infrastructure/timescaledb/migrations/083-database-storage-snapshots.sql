CREATE TABLE IF NOT EXISTS database_storage_snapshots (
    id BIGSERIAL PRIMARY KEY,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    database_bytes BIGINT NOT NULL CHECK (database_bytes >= 0),
    allocated_relation_bytes BIGINT NOT NULL CHECK (allocated_relation_bytes >= 0),
    data_bytes BIGINT NOT NULL CHECK (data_bytes >= 0),
    index_bytes BIGINT NOT NULL CHECK (index_bytes >= 0),
    toast_bytes BIGINT NOT NULL CHECK (toast_bytes >= 0),
    relation_count INTEGER NOT NULL CHECK (relation_count >= 0),
    hypertable_count INTEGER NOT NULL CHECK (hypertable_count >= 0),
    chunk_count INTEGER NOT NULL CHECK (chunk_count >= 0),
    relations JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_database_storage_snapshots_captured_at
    ON database_storage_snapshots(captured_at DESC);

COMMENT ON TABLE database_storage_snapshots IS
    'Bounded read-only storage-observability snapshots used by the Database Storage dashboard.';
