import type {
  MetricQualityConfig
} from "../telemetry/quality.js";

export interface AssetMetricDto {
  id: string;
  key: string;
  displayName: string;
  unit: string | null;
  valueType: string;
  enabled: boolean;
  qualityConfig: MetricQualityConfig;
  globalQualityConfig: MetricQualityConfig;
  qualityOverridden: boolean;
}

export interface AssetDto {
  id: string;
  externalId: string;
  name: string | null;
  description: string | null;
  manufacturer: string | null;
  model: string | null;
  firmwareVersion: string | null;
  assetType: string;
  protocol: string | null;
  enabled: boolean;
  tags: string[];
  health: {
    status:
      | "online"
      | "warning"
      | "offline";
    lastSeenAt: string | null;
    ageSeconds: number | null;
    warningAfterSeconds: number;
    offlineAfterSeconds: number;
  };
  gateway: { id: string; name: string } | null;
  sensor: {
    uid: string;
    name: string | null;
  } | null;
  location: {
    id: string;
    name: string;
    type: string;
    metadata: Record<string, unknown>;
  } | null;
  room: { id: string; name: string } | null;
  metrics: AssetMetricDto[];
  lastMeasurementAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssetInput {
  externalId: string;
  name?: string | null;
  description?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  firmwareVersion?: string | null;
  assetType: string;
  protocol?: string | null;
  enabled?: boolean;
  tags?: string[];
}

export interface UpdateAssetInput {
  externalId?: string;
  name?: string | null;
  description?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  firmwareVersion?: string | null;
  assetType?: string;
  protocol?: string | null;
  enabled?: boolean;
  warningAfterSeconds?: number;
  offlineAfterSeconds?: number;
  tags?: string[];
}
