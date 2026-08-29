import type { Pool } from "pg";

import type {
  CreateGatewayDto,
  UpdateGatewayDto
} from "./dto.js";

export interface GatewayTypeRecord {
  id: string;
  key: string;
  name: string;
  description: string | null;
  color: string;
}

export interface GatewayRecord {
  id: string;
  gateway_id: string;
  name: string;
  name_manually_set: boolean;
  gateway_type_id: string;
  gateway_type_key: string;
  gateway_type_name: string;
  gateway_type_description: string | null;
  gateway_type_color: string;
  version: string | null;
  ip_address: string | null;
  mac_address: string | null;
  wifi_ssid: string | null;
  board_id: string | null;
  build_date: string | null;
  wifi_rssi: number | null;
  wifi_rssi_seen_at: Date | null;
  location_id: string | null;
  location_name: string | null;
  location_type: string | null;
  enabled: boolean;
  last_seen_at: Date | null;
  sensor_count: number;
  asset_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface GatewayRepository {
  findAll(): Promise<GatewayRecord[]>;
  findById(id: string): Promise<GatewayRecord | null>;
  findTypes(): Promise<GatewayTypeRecord[]>;
  typeExists(id: string): Promise<boolean>;
  createType(input: { key: string; name: string; description?: string | null; color: string }): Promise<GatewayTypeRecord>;
  updateType(id: string, input: { key?: string; name?: string; description?: string | null; color?: string }): Promise<GatewayTypeRecord | null>;
  deleteType(id: string): Promise<boolean>;
  countTypeUsage(id: string): Promise<number>;
  create(input: CreateGatewayDto): Promise<GatewayRecord>;
  update(id: string, input: UpdateGatewayDto): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}

const GATEWAY_SELECT = `
  SELECT
    g.id,
    g.gateway_id,
    g.name,
    g.name_manually_set,
    g.gateway_type_id,
    gt.key AS gateway_type_key,
    gt.name AS gateway_type_name,
    gt.description AS gateway_type_description,
    gt.color AS gateway_type_color,
    g.version,
    host(g.ip_address) AS ip_address,
    g.mac_address,
    g.wifi_ssid,
    g.board_id,
    g.build_date,
    g.wifi_rssi,
    g.wifi_rssi_seen_at,
    g.location_id,
    l.name AS location_name,
    l.type AS location_type,
    g.enabled,
    g.last_seen_at,
    (
      SELECT COUNT(*)::integer
      FROM sensors s
      WHERE s.gateway_id = g.id
    ) AS sensor_count,
    (
      SELECT COUNT(*)::integer
      FROM assets a
      WHERE a.gateway_id = g.id
    ) AS asset_count,
    g.created_at,
    g.updated_at
  FROM gateways g
  JOIN gateway_types gt
    ON gt.id = g.gateway_type_id
  LEFT JOIN locations l
    ON l.id = g.location_id
`;

export class PostgresGatewayRepository
implements GatewayRepository {

  constructor(
    private readonly pool: Pool
  ) {}

  async findAll(): Promise<GatewayRecord[]> {
    const result =
      await this.pool.query<GatewayRecord>(
        `
        ${GATEWAY_SELECT}
        ORDER BY g.name, g.gateway_id
        `
      );

    return result.rows;
  }

  async findById(
    id: string
  ): Promise<GatewayRecord | null> {
    const result =
      await this.pool.query<GatewayRecord>(
        `
        ${GATEWAY_SELECT}
        WHERE g.id = $1
        LIMIT 1
        `,
        [id]
      );

    return result.rows[0] ?? null;
  }

  async findTypes(): Promise<GatewayTypeRecord[]> {
    const result =
      await this.pool.query<GatewayTypeRecord>(
        `
        SELECT id, key, name, description, color
        FROM gateway_types
        ORDER BY name, key
        `
      );

    return result.rows;
  }

  async typeExists(id: string): Promise<boolean> {
    const result = await this.pool.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM gateway_types WHERE id = $1) AS exists`,
      [id]
    );

    return result.rows[0]?.exists ?? false;
  }

  async createType(input: { key: string; name: string; description?: string | null; color: string }): Promise<GatewayTypeRecord> {
    const result = await this.pool.query<GatewayTypeRecord>(
      `INSERT INTO gateway_types (key, name, description, color)
       VALUES ($1, $2, $3, $4)
       RETURNING id, key, name, description, color`,
      [input.key, input.name, input.description ?? null, input.color]
    );
    return result.rows[0];
  }

  async updateType(
    id: string,
    input: { key?: string; name?: string; description?: string | null; color?: string }
  ): Promise<GatewayTypeRecord | null> {
    const current = await this.pool.query<GatewayTypeRecord>(
      `SELECT id, key, name, description, color FROM gateway_types WHERE id = $1`,
      [id]
    );
    if (!current.rows[0]) return null;
    const next = { ...current.rows[0], ...input };
    const result = await this.pool.query<GatewayTypeRecord>(
      `UPDATE gateway_types
       SET key = $2, name = $3, description = $4, color = $5, updated_at = NOW()
       WHERE id = $1
       RETURNING id, key, name, description, color`,
      [id, next.key, next.name, next.description ?? null, next.color]
    );
    return result.rows[0] ?? null;
  }

  async deleteType(id: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM gateway_types WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async countTypeUsage(id: string): Promise<number> {
    const result = await this.pool.query<{ count: number }>(
      `SELECT COUNT(*)::integer AS count FROM gateways WHERE gateway_type_id = $1`,
      [id]
    );
    return result.rows[0]?.count ?? 0;
  }

  async create(
    input: CreateGatewayDto
  ): Promise<GatewayRecord> {
    const result = await this.pool.query<{ id: string }>(
      `
      INSERT INTO gateways (
        gateway_id,
        name,
        name_manually_set,
        gateway_type_id,
        version,
        ip_address,
        mac_address,
        wifi_ssid,
        board_id,
        build_date,
        location_id,
        enabled,
        type
      )
      VALUES (
        $1,
        $2,
        TRUE,
        $3,
        $4,
        $5::inet,
        $6,
        $7,
        $8,
        $9,
        $10::uuid,
        $11,
        'managed'
      )
      RETURNING id
      `,
      [
        input.gatewayId,
        input.name,
        input.gatewayTypeId,
        input.version ?? null,
        input.ipAddress ?? null,
        input.macAddress ?? null,
        input.wifiSsid ?? null,
        input.boardId ?? null,
        input.buildDate ?? null,
        input.locationId ?? null,
        input.enabled ?? true
      ]
    );

    const created =
      await this.findById(result.rows[0].id);

    if (!created) {
      throw new Error("Unable to reload created gateway");
    }

    return created;
  }

  async update(
    id: string,
    input: UpdateGatewayDto
  ): Promise<boolean> {
    const updates: string[] = [];
    const values: unknown[] = [];

    const addUpdate = (
      expression: string,
      value: unknown
    ): void => {
      values.push(value);
      updates.push(
        `${expression} = $${values.length}`
      );
    };

    if ("name" in input) {
      addUpdate("name", input.name);
      updates.push("name_manually_set = TRUE");
    }
    if ("gatewayTypeId" in input) {
      addUpdate("gateway_type_id", input.gatewayTypeId);
    }
    if ("version" in input) {
      addUpdate("version", input.version ?? null);
    }
    if ("ipAddress" in input) {
      values.push(input.ipAddress ?? null);
      updates.push(
        `ip_address = $${values.length}::inet`
      );
    }
    if ("macAddress" in input) {
      addUpdate("mac_address", input.macAddress ?? null);
    }
    if ("wifiSsid" in input) {
      addUpdate("wifi_ssid", input.wifiSsid ?? null);
    }
    if ("boardId" in input) {
      addUpdate("board_id", input.boardId ?? null);
    }
    if ("buildDate" in input) {
      addUpdate("build_date", input.buildDate ?? null);
    }
    if ("locationId" in input) {
      values.push(input.locationId ?? null);
      updates.push(`location_id = $${values.length}::uuid`);
    }
    if ("enabled" in input) {
      addUpdate("enabled", input.enabled);
    }

    if (updates.length === 0) {
      return false;
    }

    values.push(id);

    const result = await this.pool.query(
      `
      UPDATE gateways
      SET
        ${updates.join(", ")},
        updated_at = NOW()
      WHERE id = $${values.length}
      `,
      values
    );

    return result.rowCount === 1;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM gateways WHERE id = $1`,
      [id]
    );

    return result.rowCount === 1;
  }
}
