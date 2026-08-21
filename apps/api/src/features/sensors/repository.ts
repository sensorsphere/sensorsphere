import type { Pool } from "pg";

import type {
  UpdateSensorDto
} from "./dto.js";

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
  gateway_mqtt_id: string | null;
  gateway_type: string | null;
  last_measurement_at: Date | null;
  online: boolean;
  measurements_today: number;
}

export interface SensorRepository {
  findAll(): Promise<SensorRecord[]>;
  findById(id: string): Promise<SensorRecord | null>;
  updateMetadata(id: string, input: UpdateSensorDto): Promise<boolean>;
}

const SENSOR_SELECT = `
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
      g.gateway_id AS gateway_mqtt_id,
      g.name AS gateway_name,
      gt.name AS gateway_type,
      latest.time AS last_measurement_at,
      CASE
          WHEN latest.time IS NULL THEN FALSE
          WHEN latest.time >= NOW() - INTERVAL '5 minutes' THEN TRUE
          ELSE FALSE
      END AS online,
      COALESCE(today.measurement_count, 0)::INTEGER AS measurements_today
  FROM sensors s
  LEFT JOIN rooms r ON r.id = s.room_id
  LEFT JOIN gateways g ON g.id = s.gateway_id
  LEFT JOIN gateway_types gt ON gt.id = g.gateway_type_id
  LEFT JOIN LATERAL (
      SELECT m.time
      FROM measurements m
      WHERE m.sensor_uid = s.sensor_uid
      ORDER BY m.time DESC
      LIMIT 1
  ) latest ON TRUE
  LEFT JOIN LATERAL (
      SELECT COUNT(*)::INTEGER AS measurement_count
      FROM measurements m
      WHERE m.sensor_uid = s.sensor_uid
        AND m.time >= DATE_TRUNC('day', NOW())
  ) today ON TRUE
`;

export class PostgresSensorRepository
implements SensorRepository {

  constructor(
    private readonly pool: Pool
  ) {}

  async findAll(): Promise<SensorRecord[]> {
    const result =
      await this.pool.query<SensorRecord>(
        `
        ${SENSOR_SELECT}
        ORDER BY COALESCE(s.name, s.sensor_uid)
        `
      );

    return result.rows;
  }

  async findById(
    id: string
  ): Promise<SensorRecord | null> {
    const result =
      await this.pool.query<SensorRecord>(
        `
        ${SENSOR_SELECT}
        WHERE s.uuid = $1
        LIMIT 1
        `,
        [id]
      );

    return result.rows[0] ?? null;
  }

  async updateMetadata(
    id: string,
    input: UpdateSensorDto
  ): Promise<boolean> {

    const updates: string[] = [];
    const values: unknown[] = [];

    const addUpdate = (
      column: string,
      value: unknown
    ): void => {
      values.push(value);
      updates.push(`${column} = $${values.length}`);
    };

    if ("name" in input) {
      addUpdate("name", input.name ?? null);
    }

    if ("description" in input) {
      addUpdate("description", input.description ?? null);
    }

    if ("manufacturer" in input) {
      addUpdate("manufacturer", input.manufacturer ?? null);
    }

    if ("model" in input) {
      addUpdate("model", input.model ?? null);
    }

    if ("firmwareVersion" in input) {
      addUpdate("firmware_version", input.firmwareVersion ?? null);
    }

    if ("gatewayId" in input) {
      addUpdate("gateway_id", input.gatewayId ?? null);
    }

    if ("enabled" in input) {
      addUpdate("enabled", input.enabled);
    }

    if (updates.length == 0) {
      return false;
    }

    values.push(id);

    const result =
      await this.pool.query(
        `
        UPDATE sensors
        SET
          ${updates.join(", ")},
          updated_at = NOW()
        WHERE uuid = $${values.length}
        `,
        values
      );

    return result.rowCount === 1;
  }
}
