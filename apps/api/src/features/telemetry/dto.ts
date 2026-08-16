import type {
  MetricQuality
} from "./quality.js";

export interface MeasurementDto {
  sensorUid: string;
  time: string;

  temperature: number | null;
  humidity: number | null;
  battery: number | null;
  voltage: number | null;
  rssi: number | null;
}

export interface LatestObservationDto {
  assetId: string;
  assetExternalId: string;
  assetName: string | null;
  metricId: string;
  metricKey: string;
  displayName: string;
  unit: string | null;
  valueType: string;
  time: string;
  value:
    | number
    | string
    | boolean
    | Record<string, unknown>;
  source: string | null;
  sourceRef: string | null;
  quality: MetricQuality;
}

export interface ObservationHistoryDto {
  metricId: string;
  metricKey: string;
  displayName: string;
  unit: string | null;
  valueType: string;
  time: string;
  value:
    | number
    | string
    | boolean
    | Record<string, unknown>;
  source: string | null;
  sourceRef: string | null;
  quality: MetricQuality;
}

export interface ObservationAggregateDto {
  bucketStart: string;
  min: number | null;
  max: number | null;
  avg: number | null;
  count: number;
}
