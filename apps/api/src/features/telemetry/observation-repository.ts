import type { Pool } from "pg";

export interface LatestObservationRecord {
  asset_id: string;
  asset_external_id: string;
  asset_name: string | null;
  metric_id: string;
  metric_key: string;
  display_name: string;
  unit: string | null;
  value_type: string;
  time: Date;
  value_double: number | null;
  value_text: string | null;
  value_boolean: boolean | null;
  value_json: Record<string, unknown> | null;
  source: string | null;
  source_ref: string | null;
  quality: Record<string, unknown>;
  metric_quality_config: Record<string, unknown>;
}

export interface ObservationHistoryQuery {
  metricId: string;
  from: Date;
  to: Date;
}

export interface ObservationAggregateQuery {
  metricId: string;
  from: Date;
  to: Date;
  bucket: string;
}

export interface ObservationAggregateRecord {
  bucket_start: Date;
  min_value: number | null;
  max_value: number | null;
  avg_value: number | null;
  sample_count: string;
}

export interface ObservationRepository {
  findLatest(
    assetId?: string
  ): Promise<LatestObservationRecord[]>;

  findHistory(
    query: ObservationHistoryQuery
  ): Promise<LatestObservationRecord[]>;

  aggregate(
    query: ObservationAggregateQuery
  ): Promise<ObservationAggregateRecord[]>;
}

export class PostgresObservationRepository
implements ObservationRepository {

  constructor(
    private readonly pool: Pool
  ) {}

  async findLatest(
    assetId?: string
  ): Promise<LatestObservationRecord[]> {

    const result =
      await this.pool.query<LatestObservationRecord>(
        `
        SELECT DISTINCT ON (am.id)
          a.id AS asset_id,
          a.external_id AS asset_external_id,
          a.name AS asset_name,
          am.id AS metric_id,
          am.metric_key,
          am.display_name,
          am.unit,
          am.value_type,
          o.time,
          o.value_double,
          o.value_text,
          o.value_boolean,
          o.value_json,
          o.source,
          o.source_ref,
          o.quality,
          COALESCE(am.quality_config, gp.quality_config, metric_quality_default(am.metric_key)) AS metric_quality_config
        FROM observations o
        JOIN asset_metrics am
          ON am.id = o.asset_metric_id
        LEFT JOIN metric_quality_policies gp
          ON gp.metric_key = am.metric_key
        JOIN assets a
          ON a.id = am.asset_id
        WHERE ($1::uuid IS NULL OR a.id = $1)
          AND am.enabled = TRUE
        ORDER BY am.id, o.time DESC
        `,
        [assetId ?? null]
      );

    return result.rows;
  }
  async findHistory(
    query: ObservationHistoryQuery
  ): Promise<LatestObservationRecord[]> {

    const result =
      await this.pool.query<LatestObservationRecord>(
        `
        SELECT
          a.id AS asset_id,
          a.external_id AS asset_external_id,
          a.name AS asset_name,
          am.id AS metric_id,
          am.metric_key,
          am.display_name,
          am.unit,
          am.value_type,
          o.time,
          o.value_double,
          o.value_text,
          o.value_boolean,
          o.value_json,
          o.source,
          o.source_ref,
          o.quality,
          COALESCE(am.quality_config, gp.quality_config, metric_quality_default(am.metric_key)) AS metric_quality_config
        FROM observations o
        JOIN asset_metrics am
          ON am.id = o.asset_metric_id
        LEFT JOIN metric_quality_policies gp
          ON gp.metric_key = am.metric_key
        JOIN assets a
          ON a.id = am.asset_id
        WHERE am.id = $1
          AND o.time >= $2
          AND o.time <= $3
        ORDER BY o.time ASC
        `,
        [
          query.metricId,
          query.from,
          query.to
        ]
      );

    return result.rows;
  }

  async aggregate(
    query: ObservationAggregateQuery
  ): Promise<ObservationAggregateRecord[]> {

    const result =
      await this.pool.query<ObservationAggregateRecord>(
        `
        SELECT
          time_bucket(
            $4::interval,
            o.time
          ) AS bucket_start,
          MIN(o.value_double) AS min_value,
          MAX(o.value_double) AS max_value,
          AVG(o.value_double) AS avg_value,
          COUNT(o.value_double)::text AS sample_count
        FROM observations o
        WHERE o.asset_metric_id = $1
          AND o.time >= $2
          AND o.time <= $3
          AND o.value_double IS NOT NULL
        GROUP BY bucket_start
        ORDER BY bucket_start ASC
        `,
        [
          query.metricId,
          query.from,
          query.to,
          query.bucket
        ]
      );

    return result.rows;
  }

}
