import type {
  SensorSnapshot
} from "@sensorsphere/core";

export interface MeasurementRepository {

  testConnection():
    Promise<void>;

  saveSnapshotBatch(
    snapshots:
      SensorSnapshot[]
  ): Promise<void>;
}