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
  location_id: string | null;
  location_name: string | null;
  location_type: string | null;
  room_id: string | null;
  room_name: string | null;
  source_sensor_uid: string | null;
  source_sensor_name: string | null;
  last_measurement_at: Date | null;
  age_seconds: number | null;
  warning_after_seconds: number;
  offline_after_seconds: number;
  health_status:
    | "online"
    | "warning"
    | "offline";
  created_at: Date;
  updated_at: Date;
}

export interface CreateAssetRecord {
  external_id: string;
  name: string | null;
  description: string | null;
  manufacturer: string | null;
  model: string | null;
  firmware_version: string | null;
  asset_type: string;
  protocol: string | null;
  enabled: boolean;
}

export interface AssetRepository {
  findAll(): Promise<AssetRecord[]>;
  findById(id: string): Promise<AssetRecord | null>;
  findByExternalId(
    externalId: string
  ): Promise<AssetRecord | null>;
  findMetrics(assetIds: string[]): Promise<AssetMetricRecord[]>;
  create(
    asset: CreateAssetRecord
  ): Promise<AssetRecord>;
  updateDetails(
    id: string,
    asset: Partial<CreateAssetRecord>
  ): Promise<AssetRecord | null>;
  locationExists(
    locationId: string
  ): Promise<boolean>;
  updateLocation(
    id: string,
    locationId: string | null
  ): Promise<AssetRecord | null>;
  updateHealthThresholds(
    id: string,
    warningAfterSeconds: number,
    offlineAfterSeconds: number
  ): Promise<boolean>;
  hasMetrics(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
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
      a.location_id,
      l.name AS location_name,
      l.type AS location_type,
      a.room_id,
      r.name AS room_name,
      a.source_sensor_uid,
      s.name AS source_sensor_name,
      latest.time AS last_measurement_at,
      CASE
        WHEN latest.time IS NULL
          THEN NULL
        ELSE FLOOR(
          EXTRACT(
            EPOCH FROM (
              NOW() - latest.time
            )
          )
        )::integer
      END AS age_seconds,
      a.warning_after_seconds,
      a.offline_after_seconds,
      CASE
        WHEN latest.time IS NULL
          THEN 'offline'
        WHEN NOW() - latest.time <
             make_interval(
               secs =>
                 a.warning_after_seconds
             )
          THEN 'online'
        WHEN NOW() - latest.time <
             make_interval(
               secs =>
                 a.offline_after_seconds
             )
          THEN 'warning'
        ELSE 'offline'
      END AS health_status,
      a.created_at,
      a.updated_at
  FROM assets a
  LEFT JOIN gateways g ON g.id = a.gateway_id
  LEFT JOIN locations l ON l.id = a.location_id
  LEFT JOIN rooms r ON r.id = a.room_id
  LEFT JOIN sensors s ON s.sensor_uid = a.source_sensor_uid
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

  async findByExternalId(
    externalId: string
  ): Promise<AssetRecord | null> {
    const result =
      await this.pool.query<AssetRecord>(
        `
        ${ASSET_SELECT}
        WHERE a.external_id = $1
        LIMIT 1
        `,
        [externalId]
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

  async create(
    asset: CreateAssetRecord
  ): Promise<AssetRecord> {

    const result =
      await this.pool.query<AssetRecord>(
        `
        INSERT INTO assets (
          id,
          external_id,
          name,
          description,
          manufacturer,
          model,
          firmware_version,
          asset_type,
          protocol,
          enabled
        )
        VALUES (
          gen_random_uuid(),
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9
        )
        RETURNING
          id,
          external_id,
          name,
          description,
          manufacturer,
          model,
          firmware_version,
          asset_type,
          protocol,
          enabled,
          gateway_id,
          NULL::text AS gateway_name,
          location_id,
          NULL::text AS location_name,
          NULL::text AS location_type,
          room_id,
          NULL::text AS room_name,
          source_sensor_uid,
          NULL::timestamptz AS last_measurement_at,
          created_at,
          updated_at
        `,
        [
          asset.external_id,
          asset.name,
          asset.description,
          asset.manufacturer,
          asset.model,
          asset.firmware_version,
          asset.asset_type,
          asset.protocol,
          asset.enabled
        ]
      );

    return result.rows[0]!;
  }

  async updateDetails(
    id: string,
    asset: Partial<CreateAssetRecord>
  ): Promise<AssetRecord | null> {

    const current =
      await this.findById(id);

    if (!current) {
      return null;
    }

    const result =
      await this.pool.query<AssetRecord>(
        `
        UPDATE assets
        SET
          external_id = $2,
          name = $3,
          description = $4,
          manufacturer = $5,
          model = $6,
          firmware_version = $7,
          asset_type = $8,
          protocol = $9,
          enabled = $10,
          updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          external_id,
          name,
          description,
          manufacturer,
          model,
          firmware_version,
          asset_type,
          protocol,
          enabled,
          gateway_id,
          NULL::text AS gateway_name,
          location_id,
          NULL::text AS location_name,
          NULL::text AS location_type,
          room_id,
          NULL::text AS room_name,
          source_sensor_uid,
          NULL::timestamptz AS last_measurement_at,
          created_at,
          updated_at
        `,
        [
          id,
          asset.external_id ?? current.external_id,
          asset.name !== undefined
            ? asset.name
            : current.name,
          asset.description !== undefined
            ? asset.description
            : current.description,
          asset.manufacturer !== undefined
            ? asset.manufacturer
            : current.manufacturer,
          asset.model !== undefined
            ? asset.model
            : current.model,
          asset.firmware_version !== undefined
            ? asset.firmware_version
            : current.firmware_version,
          asset.asset_type ?? current.asset_type,
          asset.protocol !== undefined
            ? asset.protocol
            : current.protocol,
          asset.enabled ?? current.enabled
        ]
      );

    return result.rows[0] ?? null;
  }
  async locationExists(
    locationId: string
  ): Promise<boolean> {

    const result =
      await this.pool.query<{
        exists: boolean;
      }>(
        `
        SELECT EXISTS (
          SELECT 1
          FROM locations
          WHERE id = $1
        ) AS exists
        `,
        [locationId]
      );

    return result.rows[0]?.exists ?? false;
  }

  async updateLocation(
    id: string,
    locationId: string | null
  ): Promise<AssetRecord | null> {

    const result =
      await this.pool.query<AssetRecord>(
        `
        UPDATE assets
        SET
          location_id = $2,
          updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          external_id,
          name,
          description,
          manufacturer,
          model,
          firmware_version,
          asset_type,
          protocol,
          enabled,
          gateway_id,
          NULL::text AS gateway_name,
          location_id,
          NULL::text AS location_name,
          NULL::text AS location_type,
          room_id,
          NULL::text AS room_name,
          source_sensor_uid,
          NULL::timestamptz AS last_measurement_at,
          created_at,
          updated_at
        `,
        [
          id,
          locationId
        ]
      );

    return result.rows[0] ?? null;
  }

  async updateHealthThresholds(
    id: string,
    warningAfterSeconds: number,
    offlineAfterSeconds: number
  ): Promise<boolean> {

    const result =
      await this.pool.query(
        `
        UPDATE assets
        SET
          warning_after_seconds = $2,
          offline_after_seconds = $3,
          updated_at = NOW()
        WHERE id = $1
        `,
        [
          id,
          warningAfterSeconds,
          offlineAfterSeconds
        ]
      );

    return (
      result.rowCount
      ?? 0
    ) > 0;
  }

  async hasMetrics(
    id: string
  ): Promise<boolean> {

    const result =
      await this.pool.query<{
        exists: boolean;
      }>(
        `
        SELECT EXISTS (
          SELECT 1
          FROM asset_metrics
          WHERE asset_id = $1
        ) AS exists
        `,
        [id]
      );

    return result.rows[0]?.exists ?? false;
  }

  async delete(
    id: string
  ): Promise<boolean> {

    const result =
      await this.pool.query(
        `
        DELETE FROM assets
        WHERE id = $1
        `,
        [id]
      );

    return (result.rowCount ?? 0) > 0;
  }

}
