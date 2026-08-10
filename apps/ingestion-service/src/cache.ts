import type {
  MetricKey,
  SensorSnapshot
} from "@sensorsphere/core";

import {
  createSensorSnapshot
} from "@sensorsphere/core";

interface CachedSensor {
  sensorUid: string;

  metrics:
    Partial<
      Record<MetricKey, number>
    >;

  lastUpdatedAt: Date;

  dirty: boolean;
}

export class SensorCache {

  private readonly sensors =
    new Map<
      string,
      CachedSensor
    >();

  update(
    sensorUid: string,
    metric: MetricKey,
    value: number,
    receivedAt = new Date()
  ): void {

    let sensor =
      this.sensors.get(
        sensorUid
      );

    if (!sensor) {

      sensor = {
        sensorUid,

        metrics: {},

        lastUpdatedAt:
          receivedAt,

        dirty: false
      };

      this.sensors.set(
        sensorUid,
        sensor
      );
    }

    sensor.metrics[metric] =
      value;

    sensor.lastUpdatedAt =
      receivedAt;

    sensor.dirty =
      true;
  }

  createDirtySnapshots(
    timestamp: Date
  ): SensorSnapshot[] {

    return Array
      .from(
        this.sensors.values()
      )
      .filter(
        sensor =>
          sensor.dirty
      )
      .map(
        sensor =>
          createSensorSnapshot({
            sensorUid:
              sensor.sensorUid,

            timestamp,

            lastUpdatedAt:
              sensor.lastUpdatedAt,

            metrics:
              sensor.metrics
          })
      );
  }

  markClean(
    sensorUid: string
  ): void {

    const sensor =
      this.sensors.get(
        sensorUid
      );

    if (sensor) {
      sensor.dirty =
        false;
    }
  }
}