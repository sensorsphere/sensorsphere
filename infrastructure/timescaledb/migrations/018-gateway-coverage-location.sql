-- ============================================================================
-- SensorSphere
-- Migration 018 - Gateway Coverage Location
-- ============================================================================
--
-- Adds an optional Location reference to BLE gateways used by Gateway Coverage.
--
-- ============================================================================

ALTER TABLE gateway_coverage_gateways
    ADD COLUMN IF NOT EXISTS location_id UUID NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_gateway_coverage_gateways_location'
          AND conrelid = 'gateway_coverage_gateways'::regclass
    ) THEN
        ALTER TABLE gateway_coverage_gateways
            ADD CONSTRAINT fk_gateway_coverage_gateways_location
            FOREIGN KEY (location_id)
            REFERENCES locations(id)
            ON DELETE SET NULL;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_gateway_coverage_gateways_location_id
    ON gateway_coverage_gateways(location_id);
