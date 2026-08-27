-- Make gateway-qualified MQTT routing the productive SensorSphere path.

INSERT INTO metric_routing_status (singleton, mode, updated_at)
VALUES (TRUE, 'active', NOW())
ON CONFLICT (singleton) DO UPDATE
SET mode = 'active', updated_at = NOW();
