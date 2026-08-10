import type {
  MetricKey
} from "@sensorsphere/core";

export interface ParsedMeasurement {
  sensorUid: string;

  metric: MetricKey;

  value: number;

  source: string;

  sourceTopic: string;

  receivedAt: Date;
}