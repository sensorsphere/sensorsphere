export type MetricRoutingMode = "legacy" | "dry_run" | "active";
export type MetricRoutingDecision = "ACCEPT" | "IGNORE" | "DEDUPLICATE" | "ERROR";

export interface MetricRoutingEventDto {
  id: number;
  occurredAt: string;
  gatewayId: string;
  gatewayLocationId: string | null;
  gatewayLocationName: string | null;
  sensorUid: string;
  sensorName: string | null;
  metric: string;
  value: number;
  decision: MetricRoutingDecision;
  reason: string;
  assignedGatewayId: string | null;
  backupGatewayId: string | null;
  primaryGatewayLastSeenAt: string | null;
  mode: "dry_run" | "active";
  sourceTopic: string;
  dedupKey: string | null;
  dedupAgeMs: number | null;
}


export interface MetricRoutingEventsPageDto {
  events: MetricRoutingEventDto[];
  nextCursor: {
    occurredAt: string;
    id: number;
  } | null;
}

export interface MetricRoutingStatusDto {
  mode: MetricRoutingMode;
  updatedAt: string;
}

export interface MetricRoutingSummaryDto {
  hours: number;
  received: number;
  accepted: number;
  ignored: number;
  deduplicated: number;
  errors: number;
}


export type GatewayTrafficMessageType = "METADATA" | "SENSOR" | "UNKNOWN";

export interface GatewayTrafficEventDto {
  id: number;
  occurredAt: string;
  gatewayId: string | null;
  gatewayLocationId: string | null;
  gatewayLocationName: string | null;
  messageType: GatewayTrafficMessageType;
  sensorUid: string | null;
  metric: string | null;
  payload: string;
  sourceTopic: string;
}

export interface GatewayTrafficEventsPageDto {
  events: GatewayTrafficEventDto[];
  nextCursor: {
    occurredAt: string;
    id: number;
  } | null;
}

export interface GatewayTrafficSummaryDto {
  hours: number;
  received: number;
  metadata: number;
  sensor: number;
  unknown: number;
  gateways: number;
}
