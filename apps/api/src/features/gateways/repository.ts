import type { Pool } from "pg";

import type {
  CreateGatewayDto,
  UpdateGatewayDto
} from "./dto.js";

export interface GatewayRecord {
  id: string;
  name: string;
  type: string;
  version: string | null;
  ip_address: string | null;
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
  create(input: CreateGatewayDto): Promise<GatewayRecord>;
  update(id: string, input: UpdateGatewayDto): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}

const GATEWAY_SELECT = `
  SELECT
    g.id,
    g.name,
    g.type,
    g.version,
    g.ip_address::text AS ip_address,
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
        ORDER BY g.name, g.id
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

  async create(
    input: CreateGatewayDto
  ): Promise<GatewayRecord> {
    const result = await this.pool.query<{ id: string }>(
      `
      INSERT INTO gateways (
        name,
        type,
        version,
        ip_address,
        enabled
      )
      VALUES (
        $1,
        $2,
        $3,
        $4::inet,
        $5
      )
      RETURNING id
      `,
      [
        input.name,
        input.type,
        input.version ?? null,
        input.ipAddress ?? null,
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
    }
    if ("type" in input) {
      addUpdate("type", input.type);
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
