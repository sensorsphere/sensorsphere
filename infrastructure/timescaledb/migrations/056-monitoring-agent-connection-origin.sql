-- ============================================================================
-- SensorSphere
-- Migration 056 - Monitoring Agent connection origin metadata
-- ============================================================================

ALTER TABLE monitoring_agents
    ADD COLUMN IF NOT EXISTS local_ip TEXT NULL,
    ADD COLUMN IF NOT EXISTS source_ip TEXT NULL,
    ADD COLUMN IF NOT EXISTS x_forwarded_for TEXT NULL,
    ADD COLUMN IF NOT EXISTS x_real_ip TEXT NULL;

COMMENT ON COLUMN monitoring_agents.local_ip IS 'IP address reported by the monitoring agent from its local runtime environment.';
COMMENT ON COLUMN monitoring_agents.source_ip IS 'Raw TCP peer address observed by the SensorSphere API; unlike X-Forwarded-For it is not supplied by the HTTP client.';
COMMENT ON COLUMN monitoring_agents.x_forwarded_for IS 'Raw X-Forwarded-For header received from the latest monitoring-agent HTTP request. Treat as trusted only behind a trusted proxy.';
COMMENT ON COLUMN monitoring_agents.x_real_ip IS 'Raw X-Real-IP header received from the latest monitoring-agent HTTP request. Treat as trusted only behind a trusted proxy.';
