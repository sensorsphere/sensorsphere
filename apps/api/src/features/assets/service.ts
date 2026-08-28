import type {
  AssetDto,
  AssetMetricDto,
  CreateAssetInput,
  UpdateAssetInput
} from "./dto.js";
import type { AssetRepository } from "./repository.js";
import {
  mapAssetMetricToDto,
  mapAssetToDto
} from "./mapper.js";

import type {
  MetricQualityConfig
} from "../telemetry/quality.js";

export class AssetService {

  constructor(
    private readonly repository:
      AssetRepository
  ) {}

  async listAssets(): Promise<AssetDto[]> {
    const assets =
      await this.repository.findAll();

    const metrics =
      await this.repository.findMetrics(
        assets.map(asset => asset.id)
      );

    return assets.map(
      asset =>
        mapAssetToDto(
          asset,
          metrics.filter(
            metric =>
              metric.asset_id === asset.id
          )
        )
    );
  }

  async createAsset(
    input: CreateAssetInput
  ): Promise<{
    status: "created";
    asset: AssetDto;
  } | {
    status:
      | "external_id_conflict"
      | "invalid_asset_type"
      | "invalid_manufacturer"
      | "invalid_tags";
  }> {

    if (!(await this.repository.assetTypeExists(input.assetType))) {
      return { status: "invalid_asset_type" };
    }

    if (
      input.manufacturer &&
      !(await this.repository.manufacturerExists(input.manufacturer))
    ) {
      return { status: "invalid_manufacturer" };
    }

    if (
      input.tags &&
      !(await this.repository.tagsExist(input.tags))
    ) {
      return { status: "invalid_tags" };
    }

    const existing =
      await this.repository.findByExternalId(
        input.externalId
      );

    if (existing) {
      return {
        status: "external_id_conflict"
      };
    }

    const asset =
      await this.repository.create({
        external_id: input.externalId,
        description: input.description ?? null,
        manufacturer: input.manufacturer ?? null,
        model: input.model ?? null,
        firmware_version:
          input.firmwareVersion ?? null,
        asset_type: input.assetType,
        protocol: input.protocol ?? null,
        enabled: input.enabled ?? true
      });

    if (input.tags) {
      await this.repository.replaceTags(asset.id, input.tags);
    }

    const created =
      await this.repository.findById(asset.id);

    return {
      status: "created",
      asset:
        mapAssetToDto(
          created ?? asset,
          []
        )
    };
  }

  async updateAsset(
    id: string,
    input: UpdateAssetInput
  ): Promise<{
    status: "updated";
    asset: AssetDto;
  } | {
    status:
      | "asset_not_found"
      | "external_id_conflict"
      | "invalid_health_thresholds"
      | "invalid_asset_type"
      | "invalid_manufacturer"
      | "invalid_tags";
  }> {

    const current =
      await this.repository.findById(id);

    if (!current) {
      return {
        status: "asset_not_found"
      };
    }

    if (
      input.assetType &&
      !(await this.repository.assetTypeExists(input.assetType))
    ) {
      return { status: "invalid_asset_type" };
    }

    if (
      input.manufacturer &&
      !(await this.repository.manufacturerExists(input.manufacturer))
    ) {
      return { status: "invalid_manufacturer" };
    }

    if (
      input.tags &&
      !(await this.repository.tagsExist(input.tags))
    ) {
      return { status: "invalid_tags" };
    }

    const warningAfterSeconds =
      input.warningAfterSeconds
      ?? current.warning_after_seconds;

    const offlineAfterSeconds =
      input.offlineAfterSeconds
      ?? current.offline_after_seconds;

    if (
      warningAfterSeconds >=
      offlineAfterSeconds
    ) {
      return {
        status:
          "invalid_health_thresholds"
      };
    }

    if (
      input.externalId &&
      input.externalId !== current.external_id
    ) {
      const existing =
        await this.repository.findByExternalId(
          input.externalId
        );

      if (existing) {
        return {
          status: "external_id_conflict"
        };
      }
    }

    const updated =
      await this.repository.updateDetails(
        id,
        {
          external_id: input.externalId,
          description: input.description,
          manufacturer: input.manufacturer,
          model: input.model,
          firmware_version:
            input.firmwareVersion,
          asset_type: input.assetType,
          protocol: input.protocol,
          enabled: input.enabled
        }
      );

    if (!updated) {
      return {
        status: "asset_not_found"
      };
    }

    const thresholdsUpdated =
      await this.repository
        .updateHealthThresholds(
          id,
          warningAfterSeconds,
          offlineAfterSeconds
        );

    if (!thresholdsUpdated) {
      return {
        status: "asset_not_found"
      };
    }

    if (input.tags) {
      await this.repository.replaceTags(id, input.tags);
    }

    const refreshed =
      await this.repository.findById(
        id
      );

    if (!refreshed) {
      return {
        status: "asset_not_found"
      };
    }

    const metrics =
      await this.repository.findMetrics(
        [id]
      );

    return {
      status: "updated",
      asset:
        mapAssetToDto(
          refreshed,
          metrics
        )
    };
  }


  async assignAssetLocation(
    id: string,
    locationId: string | null
  ): Promise<{
    status: "updated";
    asset: AssetDto;
  } | {
    status:
      | "asset_not_found"
      | "location_not_found";
  }> {

    const current =
      await this.repository.findById(id);

    if (!current) {
      return {
        status: "asset_not_found"
      };
    }

    if (locationId) {
      const exists =
        await this.repository.locationExists(
          locationId
        );

      if (!exists) {
        return {
          status: "location_not_found"
        };
      }
    }

    const updated =
      await this.repository.updateLocation(
        id,
        locationId
      );

    if (!updated) {
      return {
        status: "asset_not_found"
      };
    }

    return {
      status: "updated",
      asset:
        mapAssetToDto(
          updated,
          []
        )
    };
  }


  async updateMetricQuality(
    assetId: string,
    metricId: string,
    qualityConfig: MetricQualityConfig
  ): Promise<{
    status: "updated";
    metric: AssetMetricDto;
  } | {
    status:
      | "asset_not_found"
      | "metric_not_found";
  }> {

    const asset =
      await this.repository.findById(
        assetId
      );

    if (!asset) {
      return {
        status: "asset_not_found"
      };
    }

    const metric =
      await this.repository
        .updateMetricQuality(
          assetId,
          metricId,
          qualityConfig
        );

    if (!metric) {
      return {
        status: "metric_not_found"
      };
    }

    return {
      status: "updated",
      metric:
        mapAssetMetricToDto(
          metric
        )
    };
  }


  async resetMetricQuality(
    assetId: string,
    metricId: string
  ): Promise<{ status: "updated"; metric: AssetMetricDto } | { status: "asset_not_found" | "metric_not_found" }> {
    if (!await this.repository.findById(assetId)) return { status: "asset_not_found" };
    const metric = await this.repository.resetMetricQuality(assetId, metricId);
    if (!metric) return { status: "metric_not_found" };
    return { status: "updated", metric: mapAssetMetricToDto(metric) };
  }

  async updateGlobalMetricQuality(
    metricKey: string,
    qualityConfig: MetricQualityConfig
  ): Promise<{ metricKey: string; qualityConfig: MetricQualityConfig }> {
    const policy = await this.repository.updateGlobalMetricQuality(metricKey, qualityConfig);
    return { metricKey: policy.metric_key, qualityConfig: policy.quality_config as MetricQualityConfig };
  }


  async deleteAsset(
    id: string
  ): Promise<{
    status: "deleted";
  } | {
    status:
      | "asset_not_found"
      | "has_metrics";
  }> {

    const asset =
      await this.repository.findById(id);

    if (!asset) {
      return {
        status: "asset_not_found"
      };
    }

    if (
      await this.repository.hasMetrics(id)
    ) {
      return {
        status: "has_metrics"
      };
    }

    const deleted =
      await this.repository.delete(id);

    if (!deleted) {
      return {
        status: "asset_not_found"
      };
    }

    return {
      status: "deleted"
    };
  }

  async getAsset(
    id: string
  ): Promise<AssetDto | null> {

    const asset =
      await this.repository.findById(id);

    if (!asset) {
      return null;
    }

    const metrics =
      await this.repository.findMetrics(
        [asset.id]
      );

    return mapAssetToDto(
      asset,
      metrics
    );
  }
}

