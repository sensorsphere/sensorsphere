import type { Pool } from "pg";

import type {
  MetricRoutingDecision,
  MetricRoutingEventDto,
  MetricRoutingStatusDto,
  MetricRoutingSummaryDto
} from "./dto.js";

interface EventRecord {
  id: string;
  occurred_at: Date;
  gateway_id: string;
  sensor_uid: string;
  sensor_name: string | null;
  metric: string;
  value: number;
  decision: MetricRoutingDecision;
  reason: string;
  assigned_gateway_id: string | null;
  mode: "dry_run" | "active";
  source_topic: string;
  dedup_key: string | null;
  dedup_age_ms: number | null;
}

export interface MetricRoutingFilters {
  hours: number;
  limit: number;
  decision?: MetricRoutingDecision;
  sensorUid?: string;
  gatewayId?: string;
  metric?: string;
}

export class MetricRoutingRepository {
  constructor(private readonly pool: Pool) {}

  async getStatus(): Promise<MetricRoutingStatusDto> {
    const result = await this.pool.query<{ mode: MetricRoutingStatusDto["mode"]; updated_at: Date }>(`
      SELECT mode, updated_at
      FROM metric_routing_status
      WHERE singleton = TRUE
    `);

    const row = result.rows[0];
    return {
      mode: row?.mode ?? "dry_run",
      updatedAt: (row?.updated_at ?? new Date(0)).toISOString()
    };
  }

  async findEvents(filters: MetricRoutingFilters): Promise<MetricRoutingEventDto[]> {
    const values: unknown[] = [filters.hours];
    const clauses = ["occurred_at >= NOW() - ($1 * INTERVAL '1 hour')"];

    const add = (sql: string, value: unknown): void => {
      values.push(value);
      clauses.push(sql.replace("?", `$${values.length}`));
    };

    if (filters.decision) add("decision = ?", filters.decision);
    if (filters.sensorUid) add("sensor_uid = ?", filters.sensorUid);
    if (filters.gatewayId) add("gateway_id = ?", filters.gatewayId);
    if (filters.metric) add("metric = ?", filters.metric);

    values.push(filters.limit);
    const result = await this.pool.query<EventRecord>(`
      SELECT
        id, occurred_at, gateway_id, sensor_uid, sensor_name, metric, value,
        decision, reason, assigned_gateway_id, mode, source_topic,
        dedup_key, dedup_age_ms
      FROM metric_routing_events
      WHERE ${clauses.join(" AND ")}
      ORDER BY occurred_at DESC, id DESC
      LIMIT $${values.length}
    `, values);

    return result.rows.map(row => ({
      id: Number(row.id),
      occurredAt: row.occurred_at.toISOString(),
      gatewayId: row.gateway_id,
      sensorUid: row.sensor_uid,
      sensorName: row.sensor_name,
      metric: row.metric,
      value: row.value,
      decision: row.decision,
      reason: row.reason,
      assignedGatewayId: row.assigned_gateway_id,
      mode: row.mode,
      sourceTopic: row.source_topic,
      dedupKey: row.dedup_key,
      dedupAgeMs: row.dedup_age_ms
    }));
  }

  async getSummary(hours: number): Promise<MetricRoutingSummaryDto> {
    const result = await this.pool.query<{
      received: number;
      accepted: number;
      ignored: number;
      deduplicated: number;
      errors: number;
    }>(`
      SELECT
        COUNT(*)::integer AS received,
        COUNT(*) FILTER (WHERE decision = 'ACCEPT')::integer AS accepted,
        COUNT(*) FILTER (WHERE decision = 'IGNORE')::integer AS ignored,
        COUNT(*) FILTER (WHERE decision = 'DEDUPLICATE')::integer AS deduplicated,
        COUNT(*) FILTER (WHERE decision = 'ERROR')::integer AS errors
      FROM metric_routing_events
      WHERE occurred_at >= NOW() - ($1 * INTERVAL '1 hour')
    `, [hours]);

    const row = result.rows[0];
    return {
      hours,
      received: row?.received ?? 0,
      accepted: row?.accepted ?? 0,
      ignored: row?.ignored ?? 0,
      deduplicated: row?.deduplicated ?? 0,
      errors: row?.errors ?? 0
    };
  }

  async clear(): Promise<number> {
    const result = await this.pool.query(`DELETE FROM metric_routing_events`);
    return result.rowCount ?? 0;
  }
}
