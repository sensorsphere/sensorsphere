import type { Pool } from "pg";

import type {
  CreateSensorDto,
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
  blacklisted: boolean;
  mac_address: string | null;
  created_at: Date;
  updated_at: Date;
  room_id: string | null;
  room_name: string | null;
  gateway_id: string | null;
  gateway_name: string | null;
  gateway_mqtt_id: string | null;
  gateway_type: string | null;
  backup_gateway_id: string | null;
  backup_gateway_name: string | null;
  backup_gateway_mqtt_id: string | null;
  backup_gateway_type: string | null;
  last_measurement_at: Date | null;
  online: boolean;
  measurements_today: number;
}

export interface SensorRepository {
  findAll(): Promise<SensorRecord[]>;
  findById(id: string): Promise<SensorRecord | null>;
  createAndAssign(input: CreateSensorDto): Promise<SensorRecord>;
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
      s.blacklisted,
      s.mac_address,
      s.created_at,
      s.updated_at,
      r.id AS room_id,
      r.name AS room_name,
      g.id AS gateway_id,
      g.gateway_id AS gateway_mqtt_id,
      g.name AS gateway_name,
      gt.name AS gateway_type,
      bg.id AS backup_gateway_id,
      bg.gateway_id AS backup_gateway_mqtt_id,
      bg.name AS backup_gateway_name,
      bgt.name AS backup_gateway_type,
      latest.time AS last_measurement_at,
      CASE
          WHEN GREATEST(s.last_seen_at, latest.time) IS NULL THEN FALSE
          WHEN GREATEST(s.last_seen_at, latest.time) >= NOW() - INTERVAL '5 minutes' THEN TRUE
          ELSE FALSE
      END AS online,
      COALESCE(today.measurement_count, 0)::INTEGER AS measurements_today
  FROM sensors s
  LEFT JOIN rooms r ON r.id = s.room_id
  LEFT JOIN gateways g ON g.id = s.gateway_id
  LEFT JOIN gateway_types gt ON gt.id = g.gateway_type_id
  LEFT JOIN sensor_gateway_assignments sga
    ON sga.sensor_id = s.id
   AND sga.priority = 2
   AND sga.enabled = TRUE
  LEFT JOIN gateways bg ON bg.id = sga.gateway_id
  LEFT JOIN gateway_types bgt ON bgt.id = bg.gateway_type_id
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

  async createAndAssign(
    input: CreateSensorDto
  ): Promise<SensorRecord> {
    const client =
      await this.pool.connect();

    try {
      await client.query("BEGIN");

      const inserted =
        await client.query<{
          id: string;
          uuid: string;
        }>(
          `
          INSERT INTO sensors (
            sensor_uid,
            gateway_id
          )
          VALUES ($1, $2::uuid)
          ON CONFLICT (sensor_uid) DO UPDATE
          SET
            gateway_id = COALESCE(
              sensors.gateway_id,
              EXCLUDED.gateway_id
            ),
            updated_at = NOW()
          RETURNING
            id::text AS id,
            uuid::text AS uuid
          `,
          [
            input.uid,
            input.gatewayId ?? null
          ]
        );

      const sensorRow =
        inserted.rows[0];

      if (!sensorRow) {
        throw new Error(
          "Unable to create sensor"
        );
      }

      if (input.backupGatewayId) {
        await client.query(
          `
          DELETE FROM sensor_gateway_assignments
          WHERE sensor_id = $1::bigint
            AND priority = 2
          `,
          [sensorRow.id]
        );

        await client.query(
          `
          INSERT INTO sensor_gateway_assignments (
            sensor_id,
            gateway_id,
            priority,
            enabled
          )
          VALUES (
            $1::bigint,
            $2::uuid,
            2,
            TRUE
          )
          `,
          [
            sensorRow.id,
            input.backupGatewayId
          ]
        );
      }

      await client.query("COMMIT");

      const created =
        await this.findById(
          sensorRow.uuid
        );

      if (!created) {
        throw new Error(
          "Created sensor could not be reloaded"
        );
      }

      return created;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async updateMetadata(
    id: string,
    input: UpdateSensorDto
  ): Promise<boolean> {
    const client =
      await this.pool.connect();

    try {
      await client.query("BEGIN");

      const updates: string[] = [];
      const values: unknown[] = [];

      const addUpdate = (
        column: string,
        value: unknown
      ): void => {
        values.push(value);
        updates.push(`${column} = $${values.length}`);
      };

      if ("name" in input) addUpdate("name", input.name ?? null);
      if ("description" in input) addUpdate("description", input.description ?? null);
      if ("manufacturer" in input) addUpdate("manufacturer", input.manufacturer ?? null);
      if ("model" in input) addUpdate("model", input.model ?? null);
      if ("firmwareVersion" in input) addUpdate("firmware_version", input.firmwareVersion ?? null);
      if ("gatewayId" in input) addUpdate("gateway_id", input.gatewayId ?? null);
      if ("enabled" in input) addUpdate("enabled", input.enabled);
      if ("blacklisted" in input) addUpdate("blacklisted", input.blacklisted);

      if (updates.length > 0) {
        values.push(id);
        await client.query(
          `
          UPDATE sensors
          SET ${updates.join(", ")}, updated_at = NOW()
          WHERE uuid = $${values.length}
          `,
          values
        );
      }

      if ("backupGatewayId" in input) {
        const sensorResult = await client.query<{ id: string }>(
          `SELECT id::text AS id FROM sensors WHERE uuid = $1 LIMIT 1`,
          [id]
        );
        const sensorId = sensorResult.rows[0]?.id;
        if (!sensorId) {
          await client.query("ROLLBACK");
          return false;
        }

        await client.query(
          `DELETE FROM sensor_gateway_assignments WHERE sensor_id = $1::bigint AND priority = 2`,
          [sensorId]
        );

        if (input.backupGatewayId) {
          await client.query(
            `
            INSERT INTO sensor_gateway_assignments (sensor_id, gateway_id, priority, enabled)
            VALUES ($1::bigint, $2::uuid, 2, TRUE)
            `,
            [sensorId, input.backupGatewayId]
          );
        }
      }

      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
