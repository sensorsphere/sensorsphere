import type {
  GatewayDto,
  GatewayTypeDto
} from "./dto.js";
import type {
  GatewayRecord,
  GatewayTypeRecord
} from "./repository.js";

export function mapGatewayTypeToDto(
  record: GatewayTypeRecord
): GatewayTypeDto {
  return {
    id: record.id,
    key: record.key,
    name: record.name,
    description: record.description
  };
}

export function mapGatewayToDto(
  record: GatewayRecord
): GatewayDto {
  return {
    id: record.id,
    gatewayId: record.gateway_id,
    name: record.name,
    nameManuallySet: record.name_manually_set,
    type: {
      id: record.gateway_type_id,
      key: record.gateway_type_key,
      name: record.gateway_type_name,
      description: record.gateway_type_description
    },
    version: record.version,
    ipAddress: record.ip_address,
    macAddress: record.mac_address,
    wifiSsid: record.wifi_ssid,
    boardId: record.board_id,
    buildDate: record.build_date,
    wifiRssi: record.wifi_rssi,
    wifiRssiSeenAt:
      record.wifi_rssi_seen_at?.toISOString() ?? null,
    enabled: record.enabled,
    lastSeenAt:
      record.last_seen_at?.toISOString() ?? null,
    sensorCount: record.sensor_count,
    assetCount: record.asset_count,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString()
  };
}
