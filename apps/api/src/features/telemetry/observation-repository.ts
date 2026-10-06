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

const HOURLY_TIER_BUCKETS =
  new Set([
    "1 hour",
    "6 hours",
    "1 day"
  ]);

export function observationAggregateTier(
  bucket: string
): "raw" | "hourly" {
  return HOURLY_TIER_BUCKETS.has(bucket)
    ? "hourly"
    : "raw";
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
          COALESCE(s.name, a.external_id) AS asset_name,
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
        FROM asset_metrics am
        JOIN assets a
          ON a.id = am.asset_id
        LEFT JOIN metric_quality_policies gp
          ON gp.metric_key = am.metric_key
        LEFT JOIN sensors s
          ON s.sensor_uid = a.source_sensor_uid
        JOIN LATERAL (
          SELECT
            o.time,
            o.value_double,
            o.value_text,
            o.value_boolean,
            o.value_json,
            o.source,
            o.source_ref,
            o.quality
          FROM observations o
          WHERE o.asset_metric_id = am.id
          ORDER BY o.time DESC
          LIMIT 1
        ) o ON TRUE
        WHERE ($1::uuid IS NULL OR a.id = $1)
          AND am.enabled = TRUE
        ORDER BY am.id
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
          COALESCE(s.name, a.external_id) AS asset_name,
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
        LEFT JOIN sensors s
          ON s.sensor_uid = a.source_sensor_uid
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

    if (
      observationAggregateTier(
        query.bucket
      ) === "raw"
    ) {
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

    const result =
      await this.pool.query<ObservationAggregateRecord>(
        `
        WITH hourly_segments AS (
          SELECT
            h.bucket_start AS segment_time,
            h.min_value,
            h.max_value,
            h.avg_value,
            h.sample_count::bigint AS sample_count
          FROM observation_hourly h
          WHERE h.asset_metric_id = $1
            AND h.bucket_start >=
              CASE
                WHEN $2::timestamptz =
                  time_bucket(
                    INTERVAL '1 hour',
                    $2::timestamptz
                  )
                  THEN $2::timestamptz
                ELSE
                  time_bucket(
                    INTERVAL '1 hour',
                    $2::timestamptz
                  ) + INTERVAL '1 hour'
              END
            AND h.bucket_start <
              time_bucket(
                INTERVAL '1 hour',
                $3::timestamptz
              )
        ),
        raw_boundary_segments AS (
          SELECT
            time_bucket(
              INTERVAL '1 hour',
              o.time
            ) AS segment_time,
            MIN(o.value_double) AS min_value,
            MAX(o.value_double) AS max_value,
            AVG(o.value_double) AS avg_value,
            COUNT(o.value_double)::bigint AS sample_count
          FROM observations o
          WHERE o.asset_metric_id = $1
            AND o.time >= $2::timestamptz
            AND o.time <= $3::timestamptz
            AND o.value_double IS NOT NULL
            AND (
              o.time <
                CASE
                  WHEN $2::timestamptz =
                    time_bucket(
                      INTERVAL '1 hour',
                      $2::timestamptz
                    )
                    THEN $2::timestamptz
                  ELSE
                    time_bucket(
                      INTERVAL '1 hour',
                      $2::timestamptz
                    ) + INTERVAL '1 hour'
                END
              OR o.time >=
                time_bucket(
                  INTERVAL '1 hour',
                  $3::timestamptz
                )
            )
          GROUP BY segment_time
        ),
        segments AS (
          SELECT * FROM hourly_segments
          UNION ALL
          SELECT * FROM raw_boundary_segments
        )
        SELECT
          time_bucket(
            $4::interval,
            segment_time
          ) AS bucket_start,
          MIN(min_value) AS min_value,
          MAX(max_value) AS max_value,
          CASE
            WHEN SUM(sample_count) > 0
              THEN
                SUM(
                  avg_value *
                  sample_count
                ) /
                SUM(sample_count)
            ELSE NULL
          END AS avg_value,
          SUM(sample_count)::text AS sample_count
        FROM segments
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
