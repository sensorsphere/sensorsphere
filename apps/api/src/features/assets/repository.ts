import type { Pool } from "pg";

export interface AssetMetricRecord {
  id: string;
  asset_id: string;
  metric_key: string;
  display_name: string;
  unit: string | null;
  value_type: string;
  enabled: boolean;
}

export interface AssetRecord {
  id: string;
  external_id: string;
  name: string | null;
  description: string | null;
  manufacturer: string | null;
  model: string | null;
  firmware_version: string | null;
  asset_type: string;
  protocol: string | null;
  enabled: boolean;
  gateway_id: string | null;
  gateway_name: string | null;
  room_id: string | null;
  room_name: string | null;
  source_sensor_uid: string | null;
  last_measurement_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface AssetRepository {
  findAll(): Promise<AssetRecord[]>;
  findById(id: string): Promise<AssetRecord | null>;
  findMetrics(assetIds: string[]): Promise<AssetMetricRecord[]>;
}

const ASSET_SELECT = `
  SELECT
      a.id,
      a.external_id,
      a.name,
      a.description,
      a.manufacturer,
      a.model,
      a.firmware_version,
      a.asset_type,
      a.protocol,
      a.enabled,
      a.gateway_id,
      g.name AS gateway_name,
      a.room_id,
      r.name AS room_name,
      a.source_sensor_uid,
      latest.time AS last_measurement_at,
      a.created_at,
      a.updated_at
  FROM assets a
  LEFT JOIN gateways g ON g.id = a.gateway_id
  LEFT JOIN rooms r ON r.id = a.room_id
  LEFT JOIN LATERAL (
      SELECT m.time
      FROM measurements m
      WHERE m.sensor_uid = a.source_sensor_uid
      ORDER BY m.time DESC
      LIMIT 1
  ) latest ON TRUE
`;

export class PostgresAssetRepository
implements AssetRepository {

  constructor(
    private readonly pool: Pool
  ) {}

  async findAll(): Promise<AssetRecord[]> {
    const result =
      await this.pool.query<AssetRecord>(
        `
        ${ASSET_SELECT}
        ORDER BY COALESCE(a.name, a.external_id)
        `
      );

    return result.rows;
  }

  async findById(
    id: string
  ): Promise<AssetRecord | null> {
    const result =
      await this.pool.query<AssetRecord>(
        `
        ${ASSET_SELECT}
        WHERE a.id = $1
        LIMIT 1
        `,
        [id]
      );

    return result.rows[0] ?? null;
  }

  async findMetrics(
    assetIds: string[]
  ): Promise<AssetMetricRecord[]> {

    if (assetIds.length === 0) {
      return [];
    }

    const result =
      await this.pool.query<AssetMetricRecord>(
        `
        SELECT
          id,
          asset_id,
          metric_key,
          display_name,
          unit,
          value_type,
          enabled
        FROM asset_metrics
        WHERE asset_id = ANY($1::uuid[])
        ORDER BY asset_id, metric_key
        `,
        [assetIds]
      );

    return result.rows;
  }
}
