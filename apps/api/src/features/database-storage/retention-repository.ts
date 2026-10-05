import type { Pool, PoolClient } from "pg";

import type {
  RetentionDefinition,
  RetentionPolicyKey,
  RetentionRisk
} from "./retention.js";

export interface ManagedRetentionPolicy {
  key: RetentionPolicyKey;
  configuredSeconds: number | null;
  actualSeconds: number | null;
  inSync: boolean;
  updatedAt: string | null;
  updatedByUserId: string | null;
  updatedByRole: string | null;
}

export interface RetentionImpactEstimate {
  eligibleRows: number;
  eligibleChunks: number;
  estimatedAllocatedBytes: number;
  oldestAffectedAt: string | null;
  newestAffectedAt: string | null;
  physicalReclaimExpected: boolean;
  estimateMethod:
    | "chunk-metadata+exact-row-count"
    | "exact-row-count"
    | "none";
}

export interface RetentionAuditEntry {
  id: number;
  createdAt: string;
  actorUserId: string | null;
  actorRole: string | null;
  policyKey: RetentionPolicyKey;
  previousRetentionSeconds: number | null;
  requestedRetentionSeconds: number | null;
  risk: RetentionRisk;
  status: "APPLIED" | "FAILED";
  preview: Record<string, unknown>;
  error: string | null;
}

export interface RetentionActor {
  userId: string | null;
  role: string | null;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  return 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return toNumber(value);
}

function toTimestamp(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export class DatabaseRetentionRepository {
  constructor(private readonly pool: Pool) {}

  async getManagedPolicies(): Promise<ManagedRetentionPolicy[]> {
    const sql = [
      "WITH actual AS (",
      "  SELECT",
      "    hypertable_name AS policy_key,",
      "    CASE",
      "      WHEN config->>'drop_after' = '1 year' THEN 31536000::bigint",
      "      ELSE EXTRACT(EPOCH FROM ((config->>'drop_after')::interval))::bigint",
      "    END AS actual_seconds",
      "  FROM timescaledb_information.jobs",
      "  WHERE proc_name = 'policy_retention'",
      ")",
      "SELECT",
      "  settings.policy_key,",
      "  settings.retention_seconds AS configured_seconds,",
      "  CASE",
      "    WHEN settings.policy_key IN ('gateway_traffic_events', 'metric_routing_events')",
      "      THEN settings.retention_seconds",
      "    ELSE actual.actual_seconds",
      "  END AS actual_seconds,",
      "  settings.updated_at,",
      "  settings.updated_by_user_id,",
      "  settings.updated_by_role",
      "FROM database_retention_settings settings",
      "LEFT JOIN actual ON actual.policy_key = settings.policy_key",
      "ORDER BY settings.policy_key"
    ].join("\n");

    const result = await this.pool.query(sql);

    return result.rows.map(row => {
      const configuredSeconds = nullableNumber(row.configured_seconds);
      const actualSeconds = nullableNumber(row.actual_seconds);
      return {
        key: String(row.policy_key) as RetentionPolicyKey,
        configuredSeconds,
        actualSeconds,
        inSync: configuredSeconds === actualSeconds,
        updatedAt: toTimestamp(row.updated_at),
        updatedByUserId: row.updated_by_user_id
          ? String(row.updated_by_user_id)
          : null,
        updatedByRole: row.updated_by_role
          ? String(row.updated_by_role)
          : null
      };
    });
  }

  async previewImpact(
    definition: RetentionDefinition,
    currentSeconds: number | null,
    requestedSeconds: number | null,
    risk: RetentionRisk
  ): Promise<RetentionImpactEstimate> {
    if (risk !== "DESTRUCTIVE" || requestedSeconds === null) {
      return {
        eligibleRows: 0,
        eligibleChunks: 0,
        estimatedAllocatedBytes: 0,
        oldestAffectedAt: null,
        newestAffectedAt: null,
        physicalReclaimExpected: definition.mechanism === "timescale",
        estimateMethod: "none"
      };
    }

    if (definition.mechanism === "application") {
      return this.previewApplicationImpact(
        definition,
        currentSeconds,
        requestedSeconds
      );
    }

    return this.previewTimescaleImpact(
      definition,
      currentSeconds,
      requestedSeconds
    );
  }

  private async previewApplicationImpact(
    definition: RetentionDefinition,
    currentSeconds: number | null,
    requestedSeconds: number
  ): Promise<RetentionImpactEstimate> {
    if (
      definition.relation !== "gateway_traffic_events" &&
      definition.relation !== "metric_routing_events"
    ) {
      throw new Error("Unsupported application retention relation");
    }

    const relation = definition.relation;
    const sql = [
      "SELECT",
      "  COUNT(*)::bigint AS total_rows,",
      "  COUNT(*) FILTER (",
      "    WHERE occurred_at < NOW() - make_interval(secs => $1::double precision)",
      "      AND ($2::bigint IS NULL OR occurred_at >= NOW() - make_interval(secs => $2::double precision))",
      "  )::bigint AS eligible_rows,",
      "  MIN(occurred_at) FILTER (",
      "    WHERE occurred_at < NOW() - make_interval(secs => $1::double precision)",
      "      AND ($2::bigint IS NULL OR occurred_at >= NOW() - make_interval(secs => $2::double precision))",
      "  ) AS oldest_affected_at,",
      "  MAX(occurred_at) FILTER (",
      "    WHERE occurred_at < NOW() - make_interval(secs => $1::double precision)",
      "      AND ($2::bigint IS NULL OR occurred_at >= NOW() - make_interval(secs => $2::double precision))",
      "  ) AS newest_affected_at,",
      "  pg_total_relation_size('public." + relation + "'::regclass)::bigint AS total_bytes",
      "FROM public." + relation
    ].join("\n");

    const result = await this.pool.query(sql, [
      requestedSeconds,
      currentSeconds
    ]);
    const row = result.rows[0] ?? {};
    const totalRows = toNumber(row.total_rows);
    const eligibleRows = toNumber(row.eligible_rows);
    const totalBytes = toNumber(row.total_bytes);
    const estimatedAllocatedBytes =
      totalRows > 0
        ? Math.round(totalBytes * (eligibleRows / totalRows))
        : 0;

    return {
      eligibleRows,
      eligibleChunks: 0,
      estimatedAllocatedBytes,
      oldestAffectedAt: toTimestamp(row.oldest_affected_at),
      newestAffectedAt: toTimestamp(row.newest_affected_at),
      physicalReclaimExpected: false,
      estimateMethod: "exact-row-count"
    };
  }

  private async resolveTimescalePhysicalRelation(
    definition: RetentionDefinition
  ): Promise<{ schema: string; name: string }> {
    if (definition.key !== "observation_hourly") {
      return { schema: "public", name: definition.relation };
    }

    const result = await this.pool.query(
      [
        "SELECT",
        "  materialization_hypertable_schema AS schema,",
        "  materialization_hypertable_name AS name",
        "FROM timescaledb_information.continuous_aggregates",
        "WHERE view_schema = 'public'",
        "  AND view_name = 'observation_hourly'"
      ].join("\n")
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("observation_hourly materialization hypertable not found");
    }
    return {
      schema: String(row.schema),
      name: String(row.name)
    };
  }

  private async previewTimescaleImpact(
    definition: RetentionDefinition,
    currentSeconds: number | null,
    requestedSeconds: number
  ): Promise<RetentionImpactEstimate> {
    const physical = await this.resolveTimescalePhysicalRelation(definition);
    const qualified = physical.schema + "." + physical.name;

    const sql = [
      "WITH eligible AS (",
      "  SELECT c.chunk_schema, c.chunk_name, c.range_start, c.range_end",
      "  FROM timescaledb_information.chunks c",
      "  WHERE c.hypertable_schema = $1",
      "    AND c.hypertable_name = $2",
      "    AND c.range_end <= NOW() - make_interval(secs => $3::double precision)",
      "    AND (",
      "      $4::bigint IS NULL",
      "      OR c.range_end > NOW() - make_interval(secs => $4::double precision)",
      "    )",
      "), sizes AS (",
      "  SELECT * FROM chunks_detailed_size($5::regclass)",
      ")",
      "SELECT",
      "  COUNT(*)::bigint AS eligible_chunks,",
      "  COALESCE(SUM(COALESCE(sizes.total_bytes, 0)), 0)::bigint AS estimated_bytes,",
      "  MIN(eligible.range_start) AS oldest_affected_at,",
      "  MAX(eligible.range_end) AS newest_affected_at",
      "FROM eligible",
      "LEFT JOIN sizes",
      "  ON sizes.chunk_schema = eligible.chunk_schema",
      " AND sizes.chunk_name = eligible.chunk_name"
    ].join("\n");

    const timeColumn =
      definition.key === "observation_hourly"
        ? "bucket_start"
        : "time";
    const logicalRelation = "public." + definition.relation;
    const countSql = [
      "SELECT COUNT(*)::bigint AS eligible_rows",
      "FROM " + logicalRelation,
      "WHERE " + timeColumn +
        " < NOW() - make_interval(secs => $1::double precision)",
      "  AND (",
      "    $2::bigint IS NULL",
      "    OR " + timeColumn +
        " >= NOW() - make_interval(secs => $2::double precision)",
      "  )"
    ].join("\n");

    const [chunkResult, countResult] = await Promise.all([
      this.pool.query(sql, [
        physical.schema,
        physical.name,
        requestedSeconds,
        currentSeconds,
        qualified
      ]),
      this.pool.query(countSql, [
        requestedSeconds,
        currentSeconds
      ])
    ]);
    const row = chunkResult.rows[0] ?? {};
    const countRow = countResult.rows[0] ?? {};

    return {
      eligibleRows: toNumber(countRow.eligible_rows),
      eligibleChunks: toNumber(row.eligible_chunks),
      estimatedAllocatedBytes: toNumber(row.estimated_bytes),
      oldestAffectedAt: toTimestamp(row.oldest_affected_at),
      newestAffectedAt: toTimestamp(row.newest_affected_at),
      physicalReclaimExpected: true,
      estimateMethod: "chunk-metadata+exact-row-count"
    };
  }

  private async writeAudit(
    db: Pool | PoolClient,
    input: {
      actor: RetentionActor;
      policyKey: RetentionPolicyKey;
      previousSeconds: number | null;
      requestedSeconds: number | null;
      risk: RetentionRisk;
      status: "APPLIED" | "FAILED";
      preview: Record<string, unknown>;
      error: string | null;
    }
  ): Promise<void> {
    await db.query(
      [
        "INSERT INTO database_retention_audit (",
        "  actor_user_id, actor_role, policy_key,",
        "  previous_retention_seconds, requested_retention_seconds,",
        "  risk, status, preview, error",
        ") VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)"
      ].join("\n"),
      [
        input.actor.userId,
        input.actor.role,
        input.policyKey,
        input.previousSeconds,
        input.requestedSeconds,
        input.risk,
        input.status,
        JSON.stringify(input.preview),
        input.error
      ]
    );
  }

  async applyPolicy(input: {
    definition: RetentionDefinition;
    previousSeconds: number | null;
    requestedSeconds: number | null;
    risk: RetentionRisk;
    actor: RetentionActor;
    preview: Record<string, unknown>;
  }): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      if (input.definition.mechanism === "timescale") {
        const relation = "public." + input.definition.relation;
        await client.query(
          "SELECT remove_retention_policy($1::regclass, if_exists => TRUE)",
          [relation]
        );

        if (input.requestedSeconds !== null) {
          await client.query(
            [
              "SELECT add_retention_policy(",
              "  $1::regclass,",
              "  drop_after => make_interval(secs => $2::double precision),",
              "  if_not_exists => TRUE,",
              "  schedule_interval => INTERVAL '1 day'",
              ")"
            ].join("\n"),
            [relation, input.requestedSeconds]
          );
        }
      }

      await client.query(
        [
          "UPDATE database_retention_settings",
          "SET retention_seconds = $2,",
          "    updated_at = NOW(),",
          "    updated_by_user_id = $3,",
          "    updated_by_role = $4",
          "WHERE policy_key = $1"
        ].join("\n"),
        [
          input.definition.key,
          input.requestedSeconds,
          input.actor.userId,
          input.actor.role
        ]
      );

      await this.writeAudit(client, {
        actor: input.actor,
        policyKey: input.definition.key,
        previousSeconds: input.previousSeconds,
        requestedSeconds: input.requestedSeconds,
        risk: input.risk,
        status: "APPLIED",
        preview: input.preview,
        error: null
      });

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      const message =
        error instanceof Error ? error.message : "Unknown retention apply error";

      await this.writeAudit(this.pool, {
        actor: input.actor,
        policyKey: input.definition.key,
        previousSeconds: input.previousSeconds,
        requestedSeconds: input.requestedSeconds,
        risk: input.risk,
        status: "FAILED",
        preview: input.preview,
        error: message
      }).catch(() => undefined);

      throw error;
    } finally {
      client.release();
    }
  }

  async getAudit(limit = 100): Promise<RetentionAuditEntry[]> {
    const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 500));
    const result = await this.pool.query(
      [
        "SELECT",
        "  id, created_at, actor_user_id, actor_role, policy_key,",
        "  previous_retention_seconds, requested_retention_seconds,",
        "  risk, status, preview, error",
        "FROM database_retention_audit",
        "ORDER BY created_at DESC, id DESC",
        "LIMIT $1"
      ].join("\n"),
      [safeLimit]
    );

    return result.rows.map(row => ({
      id: toNumber(row.id),
      createdAt: toTimestamp(row.created_at) ?? new Date(0).toISOString(),
      actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
      actorRole: row.actor_role ? String(row.actor_role) : null,
      policyKey: String(row.policy_key) as RetentionPolicyKey,
      previousRetentionSeconds: nullableNumber(row.previous_retention_seconds),
      requestedRetentionSeconds: nullableNumber(row.requested_retention_seconds),
      risk: String(row.risk) as RetentionRisk,
      status: row.status === "FAILED" ? "FAILED" : "APPLIED",
      preview:
        row.preview && typeof row.preview === "object"
          ? row.preview as Record<string, unknown>
          : {},
      error: row.error ? String(row.error) : null
    }));
  }
}
