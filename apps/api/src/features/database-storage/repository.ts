import type { Pool } from "pg";

export type StorageCategory =
  | "Core configuration"
  | "Measurements"
  | "Observations"
  | "BLE discovery/coverage"
  | "Routing diagnostics"
  | "Gateway diagnostics"
  | "Aggregates"
  | "Audit/operational state"
  | "Database internal"
  | "Unknown";

export interface StorageRelation {
  schema: string;
  name: string;
  category: StorageCategory;
  kind: "table" | "hypertable" | "materialized";
  totalBytes: number;
  dataBytes: number;
  indexBytes: number;
  toastBytes: number;
  liveRows: number | null;
  deadRows: number | null;
  oldestAt: string | null;
  newestAt: string | null;
  chunks: number | null;
  compressionEnabled: boolean | null;
  retention: string | null;
}

export interface StorageChunk {
  hypertableSchema: string;
  hypertableName: string;
  chunkSchema: string;
  chunkName: string;
  rangeStart: string | null;
  rangeEnd: string | null;
  totalBytes: number;
  dataBytes: number;
  indexBytes: number;
  toastBytes: number;
  compressed: boolean;
}

export interface StorageIndex {
  schema: string;
  relation: string;
  logicalRelation: string;
  indexName: string;
  indexBytes: number;
  scans: number;
  unique: boolean;
  definition: string | null;
}

export interface StoragePolicy {
  jobId: number;
  kind: "retention" | "compression" | "continuous_aggregate_refresh" | "other";
  relationSchema: string | null;
  relationName: string | null;
  scheduleInterval: string;
  config: Record<string, unknown> | null;
}

export interface StorageContinuousAggregate {
  viewSchema: string;
  viewName: string;
  materializationSchema: string;
  materializationName: string;
  materializedOnly: boolean;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  return 0;
}

function toTimestamp(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function classifyRelation(name: string): StorageCategory {
  if (name === "measurements") return "Measurements";
  if (name === "observations") return "Observations";
  if (name === "gateway_device_ble_observations") return "BLE discovery/coverage";
  if (name === "metric_routing_events" || name === "metric_routing_status") return "Routing diagnostics";
  if (name === "gateway_traffic_events") return "Gateway diagnostics";
  if (name.startsWith("observation_") || name.includes("aggregate")) return "Aggregates";
  if (
    name.startsWith("auth_") ||
    name.startsWith("schema_migrations") ||
    name.startsWith("project_todo") ||
    name.endsWith("_operation_history")
  ) return "Audit/operational state";
  if (
    name.startsWith("_hyper_") ||
    name.startsWith("timescaledb_") ||
    name.startsWith("_timescaledb")
  ) return "Database internal";
  if (
    name === "assets" ||
    name === "asset_metrics" ||
    name === "sensors" ||
    name === "gateways" ||
    name === "locations" ||
    name.startsWith("device_registry") ||
    name.startsWith("service_registry")
  ) return "Core configuration";
  return "Unknown";
}

export class DatabaseStorageRepository {
  constructor(private readonly pool: Pool) {}

  async getSummary(): Promise<{
    databaseBytes: number;
    allocatedRelationBytes: number;
    dataBytes: number;
    indexBytes: number;
    toastBytes: number;
  }> {
    const result = await this.pool.query(`
      WITH physical AS (
        SELECT
          c.oid,
          pg_relation_size(c.oid) AS data_bytes,
          pg_indexes_size(c.oid) AS index_bytes,
          GREATEST(
            pg_total_relation_size(c.oid)
              - pg_relation_size(c.oid)
              - pg_indexes_size(c.oid),
            0
          ) AS toast_bytes,
          pg_total_relation_size(c.oid) AS total_bytes
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'm')
          AND n.nspname NOT IN ('pg_catalog', 'information_schema')
          AND n.nspname NOT LIKE 'pg_toast%'
      )
      SELECT
        pg_database_size(current_database())::bigint AS database_bytes,
        COALESCE(SUM(total_bytes), 0)::bigint AS allocated_relation_bytes,
        COALESCE(SUM(data_bytes), 0)::bigint AS data_bytes,
        COALESCE(SUM(index_bytes), 0)::bigint AS index_bytes,
        COALESCE(SUM(toast_bytes), 0)::bigint AS toast_bytes
      FROM physical
    `);
    const row = result.rows[0] ?? {};
    return {
      databaseBytes: toNumber(row.database_bytes),
      allocatedRelationBytes: toNumber(row.allocated_relation_bytes),
      dataBytes: toNumber(row.data_bytes),
      indexBytes: toNumber(row.index_bytes),
      toastBytes: toNumber(row.toast_bytes)
    };
  }

  async getPolicies(): Promise<StoragePolicy[]> {
    const result = await this.pool.query(`
      SELECT
        job_id,
        proc_name,
        hypertable_schema,
        hypertable_name,
        schedule_interval::text AS schedule_interval,
        config
      FROM timescaledb_information.jobs
      WHERE proc_name IN (
        'policy_retention',
        'policy_compression',
        'policy_refresh_continuous_aggregate'
      )
      ORDER BY job_id
    `);

    return result.rows.map(row => ({
      jobId: toNumber(row.job_id),
      kind:
        row.proc_name === "policy_retention"
          ? "retention"
          : row.proc_name === "policy_compression"
            ? "compression"
            : row.proc_name === "policy_refresh_continuous_aggregate"
              ? "continuous_aggregate_refresh"
              : "other",
      relationSchema: row.hypertable_schema ?? null,
      relationName: row.hypertable_name ?? null,
      scheduleInterval: String(row.schedule_interval ?? ""),
      config: row.config && typeof row.config === "object" ? row.config : null
    }));
  }

  async getRelations(policies: StoragePolicy[]): Promise<StorageRelation[]> {
    const [hypertables, regular, eventRanges] = await Promise.all([
      this.pool.query(`
        SELECT
          h.hypertable_schema AS schema,
          h.hypertable_name AS name,
          h.num_chunks,
          h.compression_enabled,
          size.table_bytes,
          size.index_bytes,
          size.toast_bytes,
          size.total_bytes,
          COALESCE(stats.live_rows, 0)::bigint AS live_rows,
          COALESCE(stats.dead_rows, 0)::bigint AS dead_rows,
          chunks.oldest_at,
          chunks.newest_at
        FROM timescaledb_information.hypertables h
        CROSS JOIN LATERAL hypertable_detailed_size(
          format('%I.%I', h.hypertable_schema, h.hypertable_name)::regclass
        ) size
        LEFT JOIN LATERAL (
          SELECT
            SUM(COALESCE(s.n_live_tup, 0))::bigint AS live_rows,
            SUM(COALESCE(s.n_dead_tup, 0))::bigint AS dead_rows
          FROM timescaledb_information.chunks c
          LEFT JOIN pg_stat_user_tables s
            ON s.schemaname = c.chunk_schema
           AND s.relname = c.chunk_name
          WHERE c.hypertable_schema = h.hypertable_schema
            AND c.hypertable_name = h.hypertable_name
        ) stats ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            MIN(range_start) AS oldest_at,
            MAX(range_end) AS newest_at
          FROM timescaledb_information.chunks c
          WHERE c.hypertable_schema = h.hypertable_schema
            AND c.hypertable_name = h.hypertable_name
        ) chunks ON TRUE
        ORDER BY size.total_bytes DESC
      `),
      this.pool.query(`
        SELECT
          n.nspname AS schema,
          c.relname AS name,
          CASE WHEN c.relkind = 'm' THEN 'materialized' ELSE 'table' END AS kind,
          pg_relation_size(c.oid)::bigint AS data_bytes,
          pg_indexes_size(c.oid)::bigint AS index_bytes,
          GREATEST(
            pg_total_relation_size(c.oid)
              - pg_relation_size(c.oid)
              - pg_indexes_size(c.oid),
            0
          )::bigint AS toast_bytes,
          pg_total_relation_size(c.oid)::bigint AS total_bytes,
          s.n_live_tup::bigint AS live_rows,
          s.n_dead_tup::bigint AS dead_rows
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
        LEFT JOIN timescaledb_information.hypertables h
          ON h.hypertable_schema = n.nspname
         AND h.hypertable_name = c.relname
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'm')
          AND h.hypertable_name IS NULL
        ORDER BY pg_total_relation_size(c.oid) DESC
      `),
      this.pool.query(`
        SELECT 'gateway_traffic_events' AS name,
               MIN(occurred_at) AS oldest_at,
               MAX(occurred_at) AS newest_at
        FROM gateway_traffic_events
        UNION ALL
        SELECT 'metric_routing_events',
               MIN(occurred_at),
               MAX(occurred_at)
        FROM metric_routing_events
      `)
    ]);

    const retentionByRelation = new Map<string, string>();
    for (const policy of policies) {
      if (policy.kind !== "retention" || !policy.relationName) continue;
      const dropAfter = policy.config?.drop_after;
      retentionByRelation.set(
        policy.relationName,
        typeof dropAfter === "string" ? dropAfter : "configured"
      );
    }
    retentionByRelation.set("gateway_traffic_events", "48 hours");
    retentionByRelation.set("metric_routing_events", "48 hours");

    const eventRangeByName = new Map(
      eventRanges.rows.map(row => [
        String(row.name),
        { oldestAt: toTimestamp(row.oldest_at), newestAt: toTimestamp(row.newest_at) }
      ])
    );

    const relations: StorageRelation[] = hypertables.rows.map(row => ({
      schema: String(row.schema),
      name: String(row.name),
      category: classifyRelation(String(row.name)),
      kind: "hypertable",
      totalBytes: toNumber(row.total_bytes),
      dataBytes: toNumber(row.table_bytes),
      indexBytes: toNumber(row.index_bytes),
      toastBytes: toNumber(row.toast_bytes),
      liveRows: toNumber(row.live_rows),
      deadRows: toNumber(row.dead_rows),
      oldestAt: toTimestamp(row.oldest_at),
      newestAt: toTimestamp(row.newest_at),
      chunks: toNumber(row.num_chunks),
      compressionEnabled: Boolean(row.compression_enabled),
      retention: retentionByRelation.get(String(row.name)) ?? null
    }));

    for (const row of regular.rows) {
      const range = eventRangeByName.get(String(row.name));
      relations.push({
        schema: String(row.schema),
        name: String(row.name),
        category: classifyRelation(String(row.name)),
        kind: row.kind === "materialized" ? "materialized" : "table",
        totalBytes: toNumber(row.total_bytes),
        dataBytes: toNumber(row.data_bytes),
        indexBytes: toNumber(row.index_bytes),
        toastBytes: toNumber(row.toast_bytes),
        liveRows: row.live_rows === null ? null : toNumber(row.live_rows),
        deadRows: row.dead_rows === null ? null : toNumber(row.dead_rows),
        oldestAt: range?.oldestAt ?? null,
        newestAt: range?.newestAt ?? null,
        chunks: null,
        compressionEnabled: null,
        retention: retentionByRelation.get(String(row.name)) ?? null
      });
    }

    return relations.sort((left, right) => right.totalBytes - left.totalBytes);
  }

  async getChunks(): Promise<StorageChunk[]> {
    const result = await this.pool.query(`
      SELECT
        c.hypertable_schema,
        c.hypertable_name,
        c.chunk_schema,
        c.chunk_name,
        c.range_start,
        c.range_end,
        c.is_compressed,
        pg_relation_size(
          format('%I.%I', c.chunk_schema, c.chunk_name)::regclass
        )::bigint AS table_bytes,
        pg_indexes_size(
          format('%I.%I', c.chunk_schema, c.chunk_name)::regclass
        )::bigint AS index_bytes,
        GREATEST(
          pg_total_relation_size(
            format('%I.%I', c.chunk_schema, c.chunk_name)::regclass
          )
          - pg_relation_size(
            format('%I.%I', c.chunk_schema, c.chunk_name)::regclass
          )
          - pg_indexes_size(
            format('%I.%I', c.chunk_schema, c.chunk_name)::regclass
          ),
          0
        )::bigint AS toast_bytes,
        pg_total_relation_size(
          format('%I.%I', c.chunk_schema, c.chunk_name)::regclass
        )::bigint AS total_bytes
      FROM timescaledb_information.chunks c
      ORDER BY c.hypertable_schema, c.hypertable_name, c.range_start
    `);

    return result.rows.map(row => ({
      hypertableSchema: String(row.hypertable_schema),
      hypertableName: String(row.hypertable_name),
      chunkSchema: String(row.chunk_schema),
      chunkName: String(row.chunk_name),
      rangeStart: toTimestamp(row.range_start),
      rangeEnd: toTimestamp(row.range_end),
      totalBytes: toNumber(row.total_bytes),
      dataBytes: toNumber(row.table_bytes),
      indexBytes: toNumber(row.index_bytes),
      toastBytes: toNumber(row.toast_bytes),
      compressed: Boolean(row.is_compressed)
    }));
  }

  async getIndexes(): Promise<StorageIndex[]> {
    const result = await this.pool.query(`
      SELECT
        s.schemaname AS schema,
        s.relname AS relation,
        COALESCE(c.hypertable_name, s.relname) AS logical_relation,
        i.relname AS index_name,
        pg_relation_size(i.oid)::bigint AS index_bytes,
        COALESCE(s.idx_scan, 0)::bigint AS scans,
        ix.indisunique AS is_unique,
        pg_get_indexdef(i.oid) AS definition
      FROM pg_stat_user_indexes s
      JOIN pg_class i ON i.oid = s.indexrelid
      JOIN pg_index ix ON ix.indexrelid = i.oid
      LEFT JOIN timescaledb_information.chunks c
        ON c.chunk_schema = s.schemaname
       AND c.chunk_name = s.relname
      ORDER BY pg_relation_size(i.oid) DESC
      LIMIT 100
    `);

    return result.rows.map(row => ({
      schema: String(row.schema),
      relation: String(row.relation),
      logicalRelation: String(row.logical_relation),
      indexName: String(row.index_name),
      indexBytes: toNumber(row.index_bytes),
      scans: toNumber(row.scans),
      unique: Boolean(row.is_unique),
      definition: row.definition ? String(row.definition) : null
    }));
  }

  async getContinuousAggregates(): Promise<StorageContinuousAggregate[]> {
    const result = await this.pool.query(`
      SELECT
        view_schema,
        view_name,
        materialization_hypertable_schema,
        materialization_hypertable_name,
        materialized_only
      FROM timescaledb_information.continuous_aggregates
      ORDER BY view_schema, view_name
    `);

    return result.rows.map(row => ({
      viewSchema: String(row.view_schema),
      viewName: String(row.view_name),
      materializationSchema: String(row.materialization_hypertable_schema),
      materializationName: String(row.materialization_hypertable_name),
      materializedOnly: Boolean(row.materialized_only)
    }));
  }
}
