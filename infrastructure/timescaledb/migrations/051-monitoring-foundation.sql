-- ============================================================================
-- SensorSphere
-- Migration 051 - Monitoring foundation
-- ============================================================================
-- Independent pull-based monitoring agents with token authentication, generic
-- device checks and multi-agent execution/failover assignments.
-- ============================================================================

CREATE TABLE IF NOT EXISTS monitoring_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    token_hash TEXT NOT NULL UNIQUE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    labels JSONB NOT NULL DEFAULT '{}'::jsonb,
    version TEXT NULL,
    hostname TEXT NULL,
    last_ip TEXT NULL,
    last_seen_at TIMESTAMPTZ NULL,
    heartbeat_timeout_seconds INTEGER NOT NULL DEFAULT 90,
    config_revision BIGINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_monitoring_agent_heartbeat_timeout
        CHECK (heartbeat_timeout_seconds BETWEEN 15 AND 3600)
);

CREATE INDEX IF NOT EXISTS idx_monitoring_agents_last_seen
    ON monitoring_agents(last_seen_at);

CREATE TABLE IF NOT EXISTS monitoring_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL,
    name TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    check_type TEXT NOT NULL DEFAULT 'PING',
    target_mode TEXT NOT NULL DEFAULT 'PRIMARY_IP',
    target_value TEXT NULL,
    port INTEGER NULL,
    path TEXT NULL,
    interval_seconds INTEGER NOT NULL DEFAULT 60,
    timeout_seconds INTEGER NOT NULL DEFAULT 3,
    failure_threshold INTEGER NOT NULL DEFAULT 3,
    recovery_threshold INTEGER NOT NULL DEFAULT 2,
    execution_mode TEXT NOT NULL DEFAULT 'FAILOVER',
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_monitoring_check_device
        FOREIGN KEY (device_id) REFERENCES device_registry_devices(id) ON DELETE CASCADE,
    CONSTRAINT chk_monitoring_check_type
        CHECK (check_type IN ('PING', 'TCP', 'HTTP', 'HTTPS')),
    CONSTRAINT chk_monitoring_target_mode
        CHECK (target_mode IN ('PRIMARY_IP', 'PRIMARY_FQDN', 'PRIMARY_ADDRESS', 'CUSTOM')),
    CONSTRAINT chk_monitoring_interval
        CHECK (interval_seconds BETWEEN 5 AND 86400),
    CONSTRAINT chk_monitoring_timeout
        CHECK (timeout_seconds BETWEEN 1 AND 300),
    CONSTRAINT chk_monitoring_failure_threshold
        CHECK (failure_threshold BETWEEN 1 AND 100),
    CONSTRAINT chk_monitoring_recovery_threshold
        CHECK (recovery_threshold BETWEEN 1 AND 100),
    CONSTRAINT chk_monitoring_execution_mode
        CHECK (execution_mode IN ('FAILOVER', 'ALL')),
    CONSTRAINT chk_monitoring_port
        CHECK (port IS NULL OR port BETWEEN 1 AND 65535)
);

CREATE INDEX IF NOT EXISTS idx_monitoring_checks_device
    ON monitoring_checks(device_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_checks_enabled
    ON monitoring_checks(enabled);

CREATE TABLE IF NOT EXISTS monitoring_check_agents (
    check_id UUID NOT NULL,
    agent_id UUID NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    priority INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (check_id, agent_id),
    CONSTRAINT fk_monitoring_check_agent_check
        FOREIGN KEY (check_id) REFERENCES monitoring_checks(id) ON DELETE CASCADE,
    CONSTRAINT fk_monitoring_check_agent_agent
        FOREIGN KEY (agent_id) REFERENCES monitoring_agents(id) ON DELETE CASCADE,
    CONSTRAINT chk_monitoring_check_agent_priority
        CHECK (priority BETWEEN 0 AND 100000)
);

CREATE INDEX IF NOT EXISTS idx_monitoring_check_agents_agent
    ON monitoring_check_agents(agent_id, enabled, priority);

CREATE TABLE IF NOT EXISTS monitoring_check_states (
    check_id UUID NOT NULL,
    agent_id UUID NOT NULL,
    status TEXT NOT NULL DEFAULT 'UNKNOWN',
    latency_ms DOUBLE PRECISION NULL,
    message TEXT NULL,
    last_check_at TIMESTAMPTZ NULL,
    last_success_at TIMESTAMPTZ NULL,
    last_failure_at TIMESTAMPTZ NULL,
    consecutive_successes INTEGER NOT NULL DEFAULT 0,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (check_id, agent_id),
    CONSTRAINT fk_monitoring_state_check
        FOREIGN KEY (check_id) REFERENCES monitoring_checks(id) ON DELETE CASCADE,
    CONSTRAINT fk_monitoring_state_agent
        FOREIGN KEY (agent_id) REFERENCES monitoring_agents(id) ON DELETE CASCADE,
    CONSTRAINT chk_monitoring_state_status
        CHECK (status IN ('UP', 'DOWN', 'UNKNOWN'))
);

CREATE TABLE IF NOT EXISTS monitoring_state_transitions (
    id BIGSERIAL PRIMARY KEY,
    check_id UUID NOT NULL,
    agent_id UUID NOT NULL,
    previous_status TEXT NOT NULL,
    status TEXT NOT NULL,
    message TEXT NULL,
    latency_ms DOUBLE PRECISION NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_monitoring_transition_check
        FOREIGN KEY (check_id) REFERENCES monitoring_checks(id) ON DELETE CASCADE,
    CONSTRAINT fk_monitoring_transition_agent
        FOREIGN KEY (agent_id) REFERENCES monitoring_agents(id) ON DELETE CASCADE,
    CONSTRAINT chk_monitoring_transition_previous_status
        CHECK (previous_status IN ('UP', 'DOWN', 'UNKNOWN')),
    CONSTRAINT chk_monitoring_transition_status
        CHECK (status IN ('UP', 'DOWN', 'UNKNOWN'))
);

CREATE INDEX IF NOT EXISTS idx_monitoring_transitions_check_time
    ON monitoring_state_transitions(check_id, occurred_at DESC);
