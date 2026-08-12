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
  quality: Record<string, unknown>;
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
  quality: Record<string, unknown>;
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
