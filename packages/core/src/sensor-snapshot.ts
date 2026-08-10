import type {
  MetricKey,
  Metrics
} from "./metric.js";

export interface SensorSnapshot {
  readonly sensorUid: string;

  /**
   * Timestamp used for the historical sample.
   */
  readonly timestamp: Date;

  /**
   * Timestamp of the most recent source message
   * included in this snapshot.
   */
  readonly lastUpdatedAt: Date;

  readonly metrics: Metrics;
}

export interface CreateSensorSnapshotInput {
  sensorUid: string;
  timestamp: Date;
  lastUpdatedAt: Date;
  metrics: Partial<Record<MetricKey, number>>;
}

export function createSensorSnapshot(
  input: CreateSensorSnapshotInput
): SensorSnapshot {

  if (!input.sensorUid.trim()) {
    throw new Error(
      "Sensor UID cannot be empty"
    );
  }

  if (
    Number.isNaN(
      input.timestamp.getTime()
    )
  ) {
    throw new Error(
      "Snapshot timestamp is invalid"
    );
  }

  if (
    Number.isNaN(
      input.lastUpdatedAt.getTime()
    )
  ) {
    throw new Error(
      "Snapshot lastUpdatedAt is invalid"
    );
  }

  for (
    const [metric, value]
    of Object.entries(input.metrics)
  ) {

    if (
      value !== undefined &&
      !Number.isFinite(value)
    ) {
      throw new Error(
        `Metric ${metric} must be finite`
      );
    }
  }

  return {
    sensorUid: input.sensorUid,
    timestamp:
      new Date(input.timestamp),

    lastUpdatedAt:
      new Date(input.lastUpdatedAt),

    metrics: Object.freeze({
      ...input.metrics
    })
  };
}

export function getMetric(
  snapshot: SensorSnapshot,
  metric: MetricKey
): number | undefined {

  return snapshot.metrics[metric];
}

export function hasMetric(
  snapshot: SensorSnapshot,
  metric: MetricKey
): boolean {

  return snapshot.metrics[metric]
    !== undefined;
}