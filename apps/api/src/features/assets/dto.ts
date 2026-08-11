export interface AssetMetricDto {
  id: string;
  key: string;
  displayName: string;
  unit: string | null;
  valueType: string;
  enabled: boolean;
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
  gateway: { id: string; name: string } | null;
  room: { id: string; name: string } | null;
  metrics: AssetMetricDto[];
  lastMeasurementAt: string | null;
  createdAt: string;
  updatedAt: string;
}
