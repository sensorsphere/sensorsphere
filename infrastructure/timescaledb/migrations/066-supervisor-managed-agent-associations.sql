-- ============================================================================
-- SensorSphere
-- Migration 066 - Explicit Supervisor / managed-agent associations
-- ============================================================================

CREATE TABLE IF NOT EXISTS supervisor_managed_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supervisor_agent_id UUID NOT NULL,
    agent_type TEXT NOT NULL,
    device_agent_id UUID NULL,
    monitoring_agent_id UUID NULL,
    instance TEXT NOT NULL DEFAULT 'main',
    install_dir TEXT NULL,
    compose_project TEXT NULL,
    compose_service TEXT NOT NULL,
    desired_version TEXT NULL,
    reported_version TEXT NULL,
    local_state TEXT NULL,
    reconciliation_status TEXT NOT NULL DEFAULT 'MISSING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_supervisor_managed_agent_supervisor
      FOREIGN KEY (supervisor_agent_id) REFERENCES supervisor_agents(id) ON DELETE CASCADE,
    CONSTRAINT fk_supervisor_managed_agent_device
      FOREIGN KEY (device_agent_id) REFERENCES device_agents(id) ON DELETE CASCADE,
    CONSTRAINT fk_supervisor_managed_agent_monitoring
      FOREIGN KEY (monitoring_agent_id) REFERENCES monitoring_agents(id) ON DELETE CASCADE,

    CONSTRAINT chk_supervisor_managed_agent_type
      CHECK (agent_type IN ('device-agent', 'monitor-agent')),
    CONSTRAINT chk_supervisor_managed_agent_instance
      CHECK (instance ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
    CONSTRAINT chk_supervisor_managed_agent_identity
      CHECK (
        (agent_type = 'device-agent' AND device_agent_id IS NOT NULL AND monitoring_agent_id IS NULL)
        OR
        (agent_type = 'monitor-agent' AND monitoring_agent_id IS NOT NULL AND device_agent_id IS NULL)
      ),
    CONSTRAINT chk_supervisor_managed_agent_reconciliation_status
      CHECK (reconciliation_status IN ('MANAGED', 'MISSING', 'DISCOVERED', 'ERROR')),
    CONSTRAINT uq_supervisor_managed_agent_slot
      UNIQUE (supervisor_agent_id, agent_type, instance)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_supervisor_managed_agent_device
  ON supervisor_managed_agents(device_agent_id)
  WHERE device_agent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_supervisor_managed_agent_monitoring
  ON supervisor_managed_agents(monitoring_agent_id)
  WHERE monitoring_agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_supervisor_managed_agent_supervisor
  ON supervisor_managed_agents(supervisor_agent_id, agent_type, instance);
