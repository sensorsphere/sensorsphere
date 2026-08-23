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
