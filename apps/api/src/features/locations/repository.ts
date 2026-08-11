import type { Pool } from "pg";

export interface LocationRecord {
  id: string;
  parent_id: string | null;
  type: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface CreateLocationRecord {
  parent_id: string | null;
  type: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
}

export interface LocationRepository {
  findAll(): Promise<LocationRecord[]>;
  findById(id: string): Promise<LocationRecord | null>;
  create(
    location: CreateLocationRecord
  ): Promise<LocationRecord>;
}

const LOCATION_SELECT = `
  SELECT
      l.id,
      l.parent_id,
      l.type,
      l.name,
      l.description,
      l.metadata,
      l.created_at,
      l.updated_at
  FROM locations l
`;

export class PostgresLocationRepository
implements LocationRepository {

  constructor(
    private readonly pool: Pool
  ) {}

  async findAll(): Promise<LocationRecord[]> {
    const result =
      await this.pool.query<LocationRecord>(
        `
        ${LOCATION_SELECT}
        ORDER BY l.name
        `
      );

    return result.rows;
  }

  async findById(
    id: string
  ): Promise<LocationRecord | null> {

    const result =
      await this.pool.query<LocationRecord>(
        `
        ${LOCATION_SELECT}
        WHERE l.id = $1
        LIMIT 1
        `,
        [id]
      );

    return result.rows[0] ?? null;
  }

  async create(
    location: CreateLocationRecord
  ): Promise<LocationRecord> {

    const result =
      await this.pool.query<LocationRecord>(
        `
        INSERT INTO locations (
          parent_id,
          type,
          name,
          description,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
          id,
          parent_id,
          type,
          name,
          description,
          metadata,
          created_at,
          updated_at
        `,
        [
          location.parent_id,
          location.type,
          location.name,
          location.description,
          location.metadata
        ]
      );

    return result.rows[0]!;
  }
}
