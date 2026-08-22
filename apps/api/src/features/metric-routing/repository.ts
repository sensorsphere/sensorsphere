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
  gateway_location_id: string | null;
  gateway_location_name: string | null;
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
  location?: string;
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
    if (filters.gatewayId) add("event.gateway_id = ?", filters.gatewayId);
    if (filters.location) add("location.name ILIKE ?", `%${filters.location}%`);
    if (filters.metric) add("event.metric = ?", filters.metric);

    values.push(filters.limit);
    const result = await this.pool.query<EventRecord>(`
      SELECT
        event.id, event.occurred_at, event.gateway_id,
        gateway.location_id AS gateway_location_id,
        location.name AS gateway_location_name,
        event.sensor_uid, event.sensor_name, event.metric, event.value,
        event.decision, event.reason, event.assigned_gateway_id, event.mode, event.source_topic,
        event.dedup_key, event.dedup_age_ms
      FROM metric_routing_events event
      LEFT JOIN gateways gateway
        ON gateway.gateway_id = event.gateway_id
      LEFT JOIN locations location
        ON location.id = gateway.location_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY event.occurred_at DESC, event.id DESC
      LIMIT $${values.length}
    `, values);

    return result.rows.map(row => ({
      id: Number(row.id),
      occurredAt: row.occurred_at.toISOString(),
      gatewayId: row.gateway_id,
      gatewayLocationId: row.gateway_location_id,
      gatewayLocationName: row.gateway_location_name,
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
