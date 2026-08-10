import pg from "pg";

import type {
  SensorSnapshot
} from "@sensorsphere/core";

import type {
  SensorState
} from "@iot/shared-types";

import type {
  MeasurementRepository
} from "../../domain/measurement-repository.js";

const { Pool } = pg;

export class PostgresMeasurementRepository
implements MeasurementRepository {

  private readonly pool =
    new Pool({
      host:
        process.env.DB_HOST ??
        "timescaledb",

      port:
        Number(
          process.env.DB_PORT ??
          5432
        ),

      database:
        process.env.DB_NAME ??
        "iot",

      user:
        process.env.DB_USER ??
        "iot_app",

      password:
        process.env.DB_PASSWORD
    });

  async testConnection():
  Promise<void> {

    await this.pool.query(
      "SELECT 1"
    );
  }

  async saveSnapshotBatch(
    snapshots: SensorSnapshot[]
  ): Promise<void> {

    if (snapshots.length === 0) {
        return;
    }

    const client =
        await this.pool.connect();

    try {

        await client.query(
        "BEGIN"
        );

        for (
        const snapshot
        of snapshots
        ) {

        await client.query(
            `
            INSERT INTO sensors(sensor_uid)
            VALUES ($1)

            ON CONFLICT (sensor_uid)

            DO UPDATE
            SET updated_at = NOW()
            `,
            [
            snapshot.sensorUid
            ]
        );
        }

        const values: unknown[] =
        [];

        const placeholders:
        string[] = [];

        snapshots.forEach(
        (snapshot, index) => {

            const offset =
            index * 7;

            placeholders.push(
            `(
                $${offset + 1},
                $${offset + 2},
                $${offset + 3},
                $${offset + 4},
                $${offset + 5},
                $${offset + 6},
                $${offset + 7}
            )`
            );

            values.push(

            snapshot.timestamp,

            snapshot.sensorUid,

            snapshot.metrics
                .temperature
                ?? null,

            snapshot.metrics
                .humidity
                ?? null,

            snapshot.metrics
                .battery
                ?? null,

            snapshot.metrics
                .voltage
                ?? null,

            snapshot.metrics
                .rssi
                ?? null
            );
        }
        );

        await client.query(
        `
        INSERT INTO measurements
        (
            time,
            sensor_uid,
            temperature,
            humidity,
            battery,
            voltage,
            rssi
        )

        VALUES

        ${placeholders.join(",")}
        `,
        values
        );

        await client.query(
        "COMMIT"
        );

    } catch (error) {

        await client.query(
        "ROLLBACK"
        );

        throw error;

    } finally {

        client.release();
    }
    }
}