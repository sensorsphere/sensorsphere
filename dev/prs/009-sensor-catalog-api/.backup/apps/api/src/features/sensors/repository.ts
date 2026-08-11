import type { Pool } from "pg";

export interface SensorRecord {
  id: string;
  uid: string;

  name: string | null;
  description: string | null;

  manufacturer: string | null;
  model: string | null;
  firmware_version: string | null;

  enabled: boolean;

  mac_address: string | null;

  created_at: Date;
  updated_at: Date;

  room_id: string | null;
  room_name: string | null;

  gateway_id: string | null;
  gateway_name: string | null;
  gateway_type: string | null;

  last_measurement_at: Date | null;

  online: boolean;

  measurements_today: number;
}

export interface SensorRepository {
  findAll(): Promise<SensorRecord[]>;
}

export class PostgresSensorRepository
implements SensorRepository {

  constructor(
    private readonly pool: Pool
  ) {}

  async findAll():
  Promise<SensorRecord[]> {

    const result =
      await this.pool.query<SensorRecord>(
        `
        SELECT
            s.uuid AS id,
            s.sensor_uid AS uid,

            s.name,
            s.description,

            s.manufacturer,
            s.model,
            s.firmware_version,

            s.enabled,

            s.mac_address,

            s.created_at,
            s.updated_at,

            r.id AS room_id,
            r.name AS room_name,

            g.id AS gateway_id,
            g.name AS gateway_name,
            g.type AS gateway_type,

            latest.time AS last_measurement_at,

            CASE
                WHEN latest.time IS NULL
                    THEN FALSE

                WHEN latest.time >= NOW() - INTERVAL '5 minutes'
                    THEN TRUE

                ELSE FALSE
            END AS online,

            COALESCE(today.measurement_count, 0)::INTEGER
                AS measurements_today

        FROM sensors s

        LEFT JOIN rooms r
            ON r.id = s.room_id

        LEFT JOIN gateways g
            ON g.id = s.gateway_id

        LEFT JOIN LATERAL (
            SELECT m.time
            FROM measurements m
            WHERE m.sensor_uid = s.sensor_uid
            ORDER BY m.time DESC
            LIMIT 1
        ) latest
            ON TRUE

        LEFT JOIN LATERAL (
            SELECT COUNT(*)::INTEGER
                AS measurement_count
            FROM measurements m
            WHERE m.sensor_uid = s.sensor_uid
              AND m.time >= DATE_TRUNC('day', NOW())
        ) today
            ON TRUE

        ORDER BY
            COALESCE(s.name, s.sensor_uid)
        `
      );

    return result.rows;
  }
}
