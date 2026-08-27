import type {
  SensorRecord
} from "./repository.js";

import type {
  SensorDto
} from "./dto.js";

export function mapSensorToDto(
  sensor: SensorRecord
): SensorDto {

  return {
    id: sensor.id,
    uid: sensor.uid,

    name: sensor.name,
    description: sensor.description,

    manufacturer:
      sensor.manufacturer,

    model:
      sensor.model,

    firmwareVersion:
      sensor.firmware_version,

    enabled:
      sensor.enabled,

    blacklisted:
      sensor.blacklisted,

    macAddress:
      sensor.mac_address,

    room:
      sensor.room_id &&
      sensor.room_name
        ? {
            id: sensor.room_id,
            name: sensor.room_name
          }
        : null,

    gateway:
      sensor.gateway_id &&
      sensor.gateway_name &&
      sensor.gateway_mqtt_id &&
      sensor.gateway_type
        ? {
            id: sensor.gateway_id,
            gatewayId: sensor.gateway_mqtt_id,
            name: sensor.gateway_name,
            type: sensor.gateway_type
          }
        : null,

    backupGateway:
      sensor.backup_gateway_id &&
      sensor.backup_gateway_name &&
      sensor.backup_gateway_mqtt_id &&
      sensor.backup_gateway_type
        ? {
            id: sensor.backup_gateway_id,
            gatewayId: sensor.backup_gateway_mqtt_id,
            name: sensor.backup_gateway_name,
            type: sensor.backup_gateway_type
          }
        : null,

    lastMeasurementAt:
      sensor.last_measurement_at
        ? sensor.last_measurement_at.toISOString()
        : null,

    online:
      sensor.online,

    measurementsToday:
      sensor.measurements_today,

    createdAt:
      sensor.created_at.toISOString(),

    updatedAt:
      sensor.updated_at.toISOString()
  };
}
