import type {
  AssetDto,
  AssetMetricDto
} from "./dto.js";
import type {
  AssetMetricRecord,
  AssetRecord
} from "./repository.js";

import {
  normalizeMetricQualityConfig
} from "../telemetry/quality.js";

export function mapAssetMetricToDto(
  metric: AssetMetricRecord
): AssetMetricDto {

  return {
    id: metric.id,
    key: metric.metric_key,
    displayName: metric.display_name,
    unit: metric.unit,
    valueType: metric.value_type,
    enabled: metric.enabled,
    qualityConfig:
      normalizeMetricQualityConfig(
        metric.quality_config
      ),
    globalQualityConfig:
      normalizeMetricQualityConfig(
        metric.global_quality_config
      ),
    qualityOverridden:
      metric.quality_overridden
  };
}

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

    health: {
      status:
        asset.health_status,

      lastSeenAt:
        asset.last_measurement_at
          ? asset.last_measurement_at.toISOString()
          : null,

      ageSeconds:
        asset.age_seconds,

      warningAfterSeconds:
        asset.warning_after_seconds,

      offlineAfterSeconds:
        asset.offline_after_seconds
    },

    gateway:
      asset.gateway_id && asset.gateway_name
        ? {
            id: asset.gateway_id,
            name: asset.gateway_name
          }
        : null,

    sensor:
      asset.source_sensor_uid
        ? {
            uid: asset.source_sensor_uid,
            name: asset.source_sensor_name
          }
        : null,

    location:
      asset.location_id &&
      asset.location_name &&
      asset.location_type
        ? {
            id: asset.location_id,
            name: asset.location_name,
            type: asset.location_type
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
        mapAssetMetricToDto
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
