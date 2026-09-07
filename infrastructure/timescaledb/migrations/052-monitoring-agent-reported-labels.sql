-- ============================================================================
-- SensorSphere
-- Migration 052 - Monitoring agent reported labels
-- ============================================================================
-- Store labels reported by the standalone monitoring agent independently from
-- labels administered in SensorSphere.
-- ============================================================================

ALTER TABLE monitoring_agents
    ADD COLUMN IF NOT EXISTS agent_labels JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_monitoring_agents_agent_labels_gin
    ON monitoring_agents
    USING GIN (agent_labels);
