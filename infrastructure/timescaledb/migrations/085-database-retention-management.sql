-- DB-3: persistent retention-management configuration and audit trail.
-- This migration DOES NOT alter an existing retention policy and DOES NOT
-- delete data. It only records the current intended defaults so DB-3 can
-- preview and safely apply future changes.

CREATE TABLE IF NOT EXISTS database_retention_settings (
    policy_key TEXT PRIMARY KEY,
    retention_seconds BIGINT NULL CHECK (
        retention_seconds IS NULL OR retention_seconds > 0
    ),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    updated_by_role TEXT NULL
);

INSERT INTO database_retention_settings (policy_key, retention_seconds)
VALUES
    ('observations', 7776000),
    ('gateway_device_ble_observations', 2592000),
    ('measurements', NULL),
    ('observation_hourly', 31536000),
    ('gateway_traffic_events', 172800),
    ('metric_routing_events', 172800)
ON CONFLICT (policy_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS database_retention_audit (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    actor_role TEXT NULL,
    policy_key TEXT NOT NULL,
    previous_retention_seconds BIGINT NULL,
    requested_retention_seconds BIGINT NULL,
    risk TEXT NOT NULL CHECK (
        risk IN ('LOW_RISK', 'REVIEW_REQUIRED', 'DESTRUCTIVE')
    ),
    status TEXT NOT NULL CHECK (
        status IN ('APPLIED', 'FAILED')
    ),
    preview JSONB NOT NULL DEFAULT '{}'::jsonb,
    error TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_database_retention_audit_created_at
    ON database_retention_audit(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_database_retention_audit_policy_key
    ON database_retention_audit(policy_key, created_at DESC);

COMMENT ON TABLE database_retention_settings IS
    'DB-3 desired retention settings by SensorSphere data family. NULL means unlimited/no retention policy.';

COMMENT ON TABLE database_retention_audit IS
    'DB-3 audit trail for explicitly applied retention changes.';
