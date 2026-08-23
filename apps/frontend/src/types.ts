export interface RuntimeConfig {
  instanceName: string;
}

export type MetricQualityStatus =
  | "GOOD"
  | "WARNING"
  | "CRITICAL"
  | "UNKNOWN";

export type MetricQualityConfig =
  | { mode: "NONE" }
  | {
      mode: "HIGHER_IS_BETTER";
      warning: number;
      good: number;
    }
  | {
      mode: "LOWER_IS_BETTER";
      good: number;
      warning: number;
    }
  | {
      mode: "RANGE";
      criticalMin: number;
      warningMin: number;
      warningMax: number;
      criticalMax: number;
    };

export interface MetricQuality {
  status: MetricQualityStatus;
  config: MetricQualityConfig;
}

export interface Sensor {
  id: string;
  uid: string;

  name: string | null;
  description: string | null;

  manufacturer: string | null;
  model: string | null;
  firmwareVersion: string | null;

  enabled: boolean;

  macAddress: string | null;

  room: {
    id: string;
    name: string;
  } | null;

  gateway: {
    id: string;
    gatewayId: string;
    name: string;
    type: string;
  } | null;

  backupGateway: {
    id: string;
    gatewayId: string;
    name: string;
    type: string;
  } | null;

  lastMeasurementAt: string | null;

  online: boolean;
  measurementsToday: number;

  createdAt: string;
  updatedAt: string;
}

export interface UpdateSensor {
  name?: string | null;
  description?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  firmwareVersion?: string | null;
  gatewayId?: string | null;
  backupGatewayId?: string | null;
  enabled?: boolean;
}

export interface GatewayType {
  id: string;
  key: string;
  name: string;
  description: string | null;
}

export interface Gateway {
  id: string;
  gatewayId: string;
  name: string;
  nameManuallySet: boolean;
  type: GatewayType;
  version: string | null;
  ipAddress: string | null;
  macAddress: string | null;
  wifiSsid: string | null;
  boardId: string | null;
  buildDate: string | null;
  wifiRssi: number | null;
  wifiRssiSeenAt: string | null;
  location: {
    id: string;
    name: string;
    type: string;
  } | null;
  enabled: boolean;
  lastSeenAt: string | null;
  sensorCount: number;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGatewayInput {
  gatewayId: string;
  name: string;
  gatewayTypeId: string;
  version?: string | null;
  ipAddress?: string | null;
  macAddress?: string | null;
  wifiSsid?: string | null;
  boardId?: string | null;
  buildDate?: string | null;
  locationId?: string | null;
  enabled?: boolean;
}

export interface UpdateGatewayInput {
  name?: string;
  gatewayTypeId?: string;
  version?: string | null;
  ipAddress?: string | null;
  macAddress?: string | null;
  wifiSsid?: string | null;
  boardId?: string | null;
  buildDate?: string | null;
  locationId?: string | null;
  enabled?: boolean;
}

export interface Measurement {
  sensorUid: string;
  sensorName?: string | null;
  time: string;

  temperature: number | null;
  humidity: number | null;
  battery: number | null;
  voltage: number | null;
  rssi: number | null;
}

export interface AssetMetric {
  id: string;
  key: string;
  displayName: string;
  unit: string | null;
  valueType: string;
  enabled: boolean;
  qualityConfig: MetricQualityConfig;
  globalQualityConfig: MetricQualityConfig;
  qualityOverridden: boolean;
}

export interface MetricDisplaySetting {
  metricKey: string;
  color: string;
  updatedAt: string;
}

export interface Asset {
  id: string;
  externalId: string;
  name: string | null;
  description: string | null;
  manufacturer: string | null;
  model: string | null;
  firmwareVersion: string | null;
  assetType: string;
  protocol: string | null;
  enabled: boolean;
  health: {
    status:
      | "online"
      | "warning"
      | "offline";
    lastSeenAt: string | null;
    ageSeconds: number | null;
    warningAfterSeconds: number;
    offlineAfterSeconds: number;
  };
  sensor: {
    uid: string;
    name: string | null;
  } | null;
  location: {
    id: string;
    name: string;
    type: string;
    metadata: Record<string, unknown>;
  } | null;
  metrics: AssetMetric[];
  lastMeasurementAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateAssetHealthInput {
  warningAfterSeconds: number;
  offlineAfterSeconds: number;
}

export interface LatestObservation {
  assetId: string;
  assetExternalId: string;
  assetName: string | null;
  metricId: string;
  metricKey: string;
  displayName: string;
  unit: string | null;
  valueType: string;
  time: string;
  value:
    | number
    | string
    | boolean
    | Record<string, unknown>;
  source: string | null;
  sourceRef: string | null;
  quality: MetricQuality;
}

export interface ObservationHistoryPoint {
  metricId: string;
  metricKey: string;
  displayName: string;
  unit: string | null;
  valueType: string;
  time: string;
  value:
    | number
    | string
    | boolean
    | Record<string, unknown>;
  source: string | null;
  sourceRef: string | null;
  quality: MetricQuality;
}

export interface ObservationAggregatePoint {
  bucketStart: string;
  min: number | null;
  max: number | null;
  avg: number | null;
  count: number;
}

export interface Location {
  id: string;
  parentId: string | null;
  type: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type LocationType =
  | "SITE"
  | "BUILDING"
  | "FLOOR"
  | "ROOM"
  | "ZONE"
  | "AREA"
  | "OTHER";

export interface CreateLocationInput {
  parentId?: string | null;
  type: LocationType;
  name: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
}

export interface UpdateLocationInput {
  type?: LocationType;
  name?: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
}

export interface MoveLocationInput {
  parentId: string | null;
}

export interface GatewayCoverageRow {
  gatewayId: string;
  sensorUid: string;
  sampleCount: number;
  avgRssi: number;
  minRssi: number;
  maxRssi: number;
  stddevRssi: number;
  firstSeenAt: string;
  lastSeenAt: string;
  rank: number;
  leadDb: number | null;
}

export interface GatewayCoverageGateway {
  gatewayId: string;
  boardId: string | null;
  macAddress: string | null;
  wifiRssi: number | null;
  wifiRssiSeenAt: string | null;
  wifiSsid: string | null;
  buildDate: string | null;
  ipAddress: string | null;
  locationId: string | null;
  locationName: string | null;
  lastSeenAt: string | null;
  sampleCount: number;
  sensorCount: number;
}

export interface GatewayCoverageResponse {
  hours: number;
  generatedAt: string;
  gateways: GatewayCoverageGateway[];
  rows: GatewayCoverageRow[];
}


export type MetricRoutingMode =
  | "legacy"
  | "dry_run"
  | "active";

export type MetricRoutingDecision =
  | "ACCEPT"
  | "IGNORE"
  | "DEDUPLICATE"
  | "ERROR";

export interface MetricRoutingStatus {
  mode: MetricRoutingMode;
  updatedAt: string;
}

export interface MetricRoutingEvent {
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

export interface MetricRoutingEventsPage {
  events: MetricRoutingEvent[];
  nextCursor: {
    occurredAt: string;
    id: number;
  } | null;
}

export interface MetricRoutingSummary {
  hours: number;
  received: number;
  accepted: number;
  ignored: number;
  deduplicated: number;
  errors: number;
}
