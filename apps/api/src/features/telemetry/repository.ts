import type { Pool } from "pg";

export interface MeasurementRecord {
  sensor_uid: string;
  time: Date;
  temperature: number | null;
  humidity: number | null;
  battery: number | null;
  voltage: number | null;
  rssi: number | null;
}

export interface HistoryQuery {
  sensorUid: string;
  from: Date;
  to: Date;
}

export interface TelemetryRepository {
  findLatest(): Promise<MeasurementRecord[]>;

  findHistory(
    query: HistoryQuery
  ): Promise<MeasurementRecord[]>;
}

export class PostgresTelemetryRepository
implements TelemetryRepository {

  constructor(
    private readonly pool: Pool
  ) {}

  async findLatest():
  Promise<MeasurementRecord[]> {

    const result =
      await this.pool.query<MeasurementRecord>(
        `
        SELECT DISTINCT ON (sensor_uid)
          sensor_uid,
          time,
          temperature,
          humidity,
          battery,
          voltage,
          rssi

        FROM measurements

        ORDER BY
          sensor_uid,
          time DESC
        `
      );

    return result.rows;
  }

  async findHistory(
    query: HistoryQuery
  ): Promise<MeasurementRecord[]> {

    const result =
      await this.pool.query<MeasurementRecord>(
        `
        SELECT
          sensor_uid,
          time,
          temperature,
          humidity,
          battery,
          voltage,
          rssi

        FROM measurements

        WHERE sensor_uid = $1
          AND time >= $2
          AND time <= $3

        ORDER BY time ASC
        `,
        [
          query.sensorUid,
          query.from,
          query.to
        ]
      );

    return result.rows;
  }
}