import type { GatewayDto } from "./dto.js";
import type { GatewayRecord } from "./repository.js";

export function mapGatewayToDto(
  record: GatewayRecord
): GatewayDto {
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    version: record.version,
    ipAddress: record.ip_address,
    enabled: record.enabled,
    lastSeenAt:
      record.last_seen_at?.toISOString() ?? null,
    sensorCount: record.sensor_count,
    assetCount: record.asset_count,
    createdAt: record.created_at.toISOString(),
    updatedAt: record.updated_at.toISOString()
  };
}
