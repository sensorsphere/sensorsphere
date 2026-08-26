import type { Pool } from "pg";

import type {
  MetricRoutingDecision,
  MetricRoutingEventDto,
  MetricRoutingEventsPageDto,
  MetricRoutingStatusDto,
  MetricRoutingSummaryDto,
  GatewayTrafficEventDto,
  GatewayTrafficEventsPageDto,
  GatewayTrafficMessageType,
  GatewayTrafficSummaryDto
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
  backup_gateway_id: string | null;
  primary_gateway_last_seen_at: Date | null;
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
  beforeOccurredAt?: string;
  beforeId?: number;
}

interface GatewayTrafficRecord {
  id: string;
  occurred_at: Date;
  gateway_id: string | null;
  gateway_location_id: string | null;
  gateway_location_name: string | null;
  message_type: GatewayTrafficMessageType;
  sensor_uid: string | null;
  metric: string | null;
  payload: string;
  source_topic: string;
}

export interface GatewayTrafficFilters {
  hours: number;
  limit: number;
  messageType?: GatewayTrafficMessageType;
  gatewayId?: string;
  sensorUid?: string;
  metric?: string;
  topic?: string;
  payload?: string;
  beforeOccurredAt?: string;
  beforeId?: number;
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

  async findEvents(filters: MetricRoutingFilters): Promise<MetricRoutingEventsPageDto> {
    const values: unknown[] = [filters.hours];
    const clauses = ["event.occurred_at >= NOW() - ($1 * INTERVAL '1 hour')"];

    const add = (sql: string, value: unknown): void => {
      values.push(value);
      clauses.push(sql.replace("?", `$${values.length}`));
    };

    if (filters.decision) add("event.decision = ?", filters.decision);
    if (filters.sensorUid) add("event.sensor_uid = ?", filters.sensorUid);
    if (filters.gatewayId) add("event.gateway_id = ?", filters.gatewayId);
    if (filters.location) add("location.name ILIKE ?", `%${filters.location}%`);
    if (filters.metric) add("event.metric = ?", filters.metric);

    if (filters.beforeOccurredAt && filters.beforeId !== undefined) {
      values.push(filters.beforeOccurredAt);
      const occurredAtIndex = values.length;
      values.push(filters.beforeId);
      const idIndex = values.length;
      clauses.push(
        `(event.occurred_at, event.id) < ($${occurredAtIndex}::timestamptz, $${idIndex}::bigint)`
      );
    }

    values.push(filters.limit + 1);
    const result = await this.pool.query<EventRecord>(`
      SELECT
        event.id, event.occurred_at, event.gateway_id,
        gateway.location_id AS gateway_location_id,
        location.name AS gateway_location_name,
        event.sensor_uid, event.sensor_name, event.metric, event.value,
        event.decision, event.reason, event.assigned_gateway_id,
        event.backup_gateway_id, event.primary_gateway_last_seen_at,
        event.mode, event.source_topic,
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

    const hasMore = result.rows.length > filters.limit;
    const pageRows = hasMore
      ? result.rows.slice(0, filters.limit)
      : result.rows;

    const events = pageRows.map(row => ({
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
      backupGatewayId: row.backup_gateway_id,
      primaryGatewayLastSeenAt: row.primary_gateway_last_seen_at
        ? row.primary_gateway_last_seen_at.toISOString()
        : null,
      mode: row.mode,
      sourceTopic: row.source_topic,
      dedupKey: row.dedup_key,
      dedupAgeMs: row.dedup_age_ms
    }));

    const last = pageRows[pageRows.length - 1];

    return {
      events,
      nextCursor: hasMore && last
        ? {
            occurredAt: last.occurred_at.toISOString(),
            id: Number(last.id)
          }
        : null
    };
  }

  async findGatewayTrafficEvents(
    filters: GatewayTrafficFilters
  ): Promise<GatewayTrafficEventsPageDto> {
    const values: unknown[] = [filters.hours];
    const clauses = ["event.occurred_at >= NOW() - ($1 * INTERVAL '1 hour')"];

    const add = (sql: string, value: unknown): void => {
      values.push(value);
      clauses.push(sql.replace("?", `$${values.length}`));
    };

    if (filters.messageType) add("event.message_type = ?", filters.messageType);
    if (filters.gatewayId) add("event.gateway_id ILIKE ?", `%${filters.gatewayId}%`);
    if (filters.sensorUid) add("event.sensor_uid ILIKE ?", `%${filters.sensorUid}%`);
    if (filters.metric) add("event.metric ILIKE ?", `%${filters.metric}%`);
    if (filters.topic) add("event.source_topic ILIKE ?", `%${filters.topic}%`);
    if (filters.payload) add("event.payload ILIKE ?", `%${filters.payload}%`);

    if (filters.beforeOccurredAt && filters.beforeId !== undefined) {
      values.push(filters.beforeOccurredAt);
      const occurredAtIndex = values.length;
      values.push(filters.beforeId);
      const idIndex = values.length;
      clauses.push(
        `(event.occurred_at, event.id) < ($${occurredAtIndex}::timestamptz, $${idIndex}::bigint)`
      );
    }

    values.push(filters.limit + 1);
    const result = await this.pool.query<GatewayTrafficRecord>(`
      SELECT
        event.id, event.occurred_at, event.gateway_id,
        gateway.location_id AS gateway_location_id,
        location.name AS gateway_location_name,
        event.message_type, event.sensor_uid, event.metric,
        event.payload, event.source_topic
      FROM gateway_traffic_events event
      LEFT JOIN gateways gateway
        ON gateway.gateway_id = event.gateway_id
      LEFT JOIN locations location
        ON location.id = gateway.location_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY event.occurred_at DESC, event.id DESC
      LIMIT $${values.length}
    `, values);

    const hasMore = result.rows.length > filters.limit;
    const pageRows = hasMore
      ? result.rows.slice(0, filters.limit)
      : result.rows;

    const events: GatewayTrafficEventDto[] = pageRows.map(row => ({
      id: Number(row.id),
      occurredAt: row.occurred_at.toISOString(),
      gatewayId: row.gateway_id,
      gatewayLocationId: row.gateway_location_id,
      gatewayLocationName: row.gateway_location_name,
      messageType: row.message_type,
      sensorUid: row.sensor_uid,
      metric: row.metric,
      payload: row.payload,
      sourceTopic: row.source_topic
    }));

    const last = pageRows[pageRows.length - 1];

    return {
      events,
      nextCursor: hasMore && last
        ? {
            occurredAt: last.occurred_at.toISOString(),
            id: Number(last.id)
          }
        : null
    };
  }

  async getGatewayTrafficSummary(hours: number): Promise<GatewayTrafficSummaryDto> {
    const result = await this.pool.query<{
      received: number;
      metadata: number;
      sensor: number;
      unknown: number;
      gateways: number;
    }>(`
      SELECT
        COUNT(*)::integer AS received,
        COUNT(*) FILTER (WHERE message_type = 'METADATA')::integer AS metadata,
        COUNT(*) FILTER (WHERE message_type = 'SENSOR')::integer AS sensor,
        COUNT(*) FILTER (WHERE message_type = 'UNKNOWN')::integer AS unknown,
        COUNT(DISTINCT gateway_id) FILTER (WHERE gateway_id IS NOT NULL)::integer AS gateways
      FROM gateway_traffic_events
      WHERE occurred_at >= NOW() - ($1 * INTERVAL '1 hour')
    `, [hours]);

    const row = result.rows[0];
    return {
      hours,
      received: row?.received ?? 0,
      metadata: row?.metadata ?? 0,
      sensor: row?.sensor ?? 0,
      unknown: row?.unknown ?? 0,
      gateways: row?.gateways ?? 0
    };
  }

  async clearGatewayTraffic(): Promise<number> {
    const result = await this.pool.query(`DELETE FROM gateway_traffic_events`);
    return result.rowCount ?? 0;
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
