import {
  Pool,
  type PoolClient
} from "pg";

import type {
  SensorSnapshot
} from "@sensorsphere/core";

import type {
  MeasurementRepository
} from "../../domain/measurement-repository.js";

export interface PostgresRepositoryConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export class PostgresMeasurementRepository
implements MeasurementRepository {

  private readonly pool: Pool;

  constructor(
    config: PostgresRepositoryConfig
  ) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password
    });
  }

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

    const client: PoolClient =
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

        await client.query(
          `
          INSERT INTO assets (
            id,
            external_id,
            asset_type,
            protocol,
            enabled,
            source_sensor_uid
          )
          SELECT
            gen_random_uuid(),
            $1,
            'sensor',
            'mqtt',
            TRUE,
            $1
          WHERE NOT EXISTS (
            SELECT 1
            FROM assets
            WHERE source_sensor_uid = $1
          )
          `,
          [
            snapshot.sensorUid
          ]
        );

        await client.query(
          `
          WITH metric_templates AS (
            SELECT DISTINCT ON (
              metric_key
            )
              metric_key,
              display_name,
              unit,
              value_type,
              enabled
            FROM asset_metrics
            WHERE metric_key IN (
              'temperature',
              'humidity',
              'battery',
              'voltage',
              'rssi'
            )
            ORDER BY
              metric_key,
              created_at ASC
          )
          INSERT INTO asset_metrics (
            id,
            asset_id,
            metric_key,
            display_name,
            unit,
            value_type,
            enabled
          )
          SELECT
            gen_random_uuid(),
            asset.id,
            template.metric_key,
            template.display_name,
            template.unit,
            template.value_type,
            template.enabled
          FROM assets asset
          CROSS JOIN metric_templates template
          WHERE asset.source_sensor_uid = $1
            AND NOT EXISTS (
              SELECT 1
              FROM asset_metrics existing
              WHERE existing.asset_id =
                    asset.id
                AND existing.metric_key =
                    template.metric_key
            )
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
            snapshot.metrics.temperature ?? null,
            snapshot.metrics.humidity ?? null,
            snapshot.metrics.battery ?? null,
            snapshot.metrics.voltage ?? null,
            snapshot.metrics.rssi ?? null
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

      const observationValues:
        unknown[] = [];

      const observationPlaceholders:
        string[] = [];

      const metricKeys = [
        "temperature",
        "humidity",
        "battery",
        "voltage",
        "rssi"
      ] as const;

      for (const snapshot of snapshots) {

        for (const metricKey of metricKeys) {

          const value =
            snapshot.metrics[metricKey];

          if (value === undefined) {
            continue;
          }

          const offset =
            observationValues.length;

          observationPlaceholders.push(
            `(
              $${offset + 1}::timestamptz,
              $${offset + 2}::text,
              $${offset + 3}::text,
              $${offset + 4}::double precision
            )`
          );

          observationValues.push(
            snapshot.timestamp,
            snapshot.sensorUid,
            metricKey,
            value
          );
        }
      }

      if (
        observationPlaceholders.length > 0
      ) {

        await client.query(
          `
          INSERT INTO observations
          (
            time,
            asset_metric_id,
            value_double,
            source,
            source_ref
          )
          SELECT
            incoming.time,
            metric.id,
            incoming.value,
            'ingestion-service',
            incoming.sensor_uid
          FROM (
            VALUES
              ${observationPlaceholders.join(",")}
          ) AS incoming(
            time,
            sensor_uid,
            metric_key,
            value
          )
          JOIN assets asset
            ON asset.source_sensor_uid =
               incoming.sensor_uid
          JOIN asset_metrics metric
            ON metric.asset_id = asset.id
           AND metric.metric_key =
               incoming.metric_key
           AND metric.enabled = TRUE
          `,
          observationValues
        );
      }

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