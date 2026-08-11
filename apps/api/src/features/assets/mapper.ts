import type { AssetDto } from "./dto.js";
import type {
  AssetMetricRecord,
  AssetRecord
} from "./repository.js";

export function mapAssetToDto(
  asset: AssetRecord,
  metrics: AssetMetricRecord[]
): AssetDto {

  return {
    id: asset.id,
    externalId: asset.external_id,
    name: asset.name,
    description: asset.description,
    manufacturer: asset.manufacturer,
    model: asset.model,
    firmwareVersion: asset.firmware_version,
    assetType: asset.asset_type,
    protocol: asset.protocol,
    enabled: asset.enabled,

    gateway:
      asset.gateway_id && asset.gateway_name
        ? {
            id: asset.gateway_id,
            name: asset.gateway_name
          }
        : null,

    room:
      asset.room_id && asset.room_name
        ? {
            id: asset.room_id,
            name: asset.room_name
          }
        : null,

    metrics:
      metrics.map(
        metric => ({
          id: metric.id,
          key: metric.metric_key,
          displayName: metric.display_name,
          unit: metric.unit,
          valueType: metric.value_type,
          enabled: metric.enabled
        })
      ),

    lastMeasurementAt:
      asset.last_measurement_at
        ? asset.last_measurement_at.toISOString()
        : null,

    createdAt:
      asset.created_at.toISOString(),

    updatedAt:
      asset.updated_at.toISOString()
  };
}
