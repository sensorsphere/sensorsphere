export type ModuleChangeType =
  | "added"
  | "changed"
  | "fixed"
  | "removed"
  | "deprecated"
  | "security";

export interface ModuleChange {
  type: ModuleChangeType;
  description: string;
}

export interface ModuleChangelogEntry {
  releasedAt: string;
  patch: string;
  changes: ModuleChange[];
}

export interface ModuleVersionInfo {
  module: string;
  version: string | null;
  changelog: Record<string, ModuleChangelogEntry>;
}

export interface RuntimeConfig {
  instanceName: string;
  builds?: {
    api: string | null;
    ingestion: string | null;
  };
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
  blacklisted: boolean;

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

export interface CreateSensorInput {
  uid: string;
  gatewayId?: string | null;
  backupGatewayId?: string | null;
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
  blacklisted?: boolean;
}

export interface GatewayType {
  id: string;
  key: string;
  name: string;
  description: string | null;
  color: string;
}

export interface CreateGatewayTypeInput {
  key: string;
  name: string;
  description?: string | null;
  color: string;
}

export interface UpdateGatewayTypeInput {
  key?: string;
  name?: string;
  description?: string | null;
  color?: string;
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
  tags?: string[];
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
  description: string | null;
  manufacturer: string | null;
  model: string | null;
  firmwareVersion: string | null;
  assetType: string;
  protocol: string | null;
  enabled: boolean;
  tags: string[];
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


export interface AssetTypeMetadata {
  key: string;
  name: string;
  description: string | null;
}

export interface ManufacturerMetadata {
  name: string;
}

export interface TagMetadata {
  id: string;
  name: string;
}

export interface AssetClassification {
  assetTypes: AssetTypeMetadata[];
  manufacturers: ManufacturerMetadata[];
  tags: TagMetadata[];
}

export interface CreateAssetInput {
  externalId: string;
  description?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  firmwareVersion?: string | null;
  assetType: string;
  protocol?: string | null;
  enabled?: boolean;
  tags?: string[];
}

export interface UpdateAssetInput {
  externalId?: string;
  description?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  firmwareVersion?: string | null;
  assetType?: string;
  protocol?: string | null;
  enabled?: boolean;
  warningAfterSeconds?: number;
  offlineAfterSeconds?: number;
  tags?: string[];
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


export type GatewayTrafficMessageType =
  | "METADATA"
  | "SENSOR"
  | "UNKNOWN";

export type GatewayTrafficProcessing =
  | "GATEWAY_METADATA"
  | "SENSOR_METADATA"
  | "METRIC_ROUTING"
  | "COVERAGE_ROUTING"
  | "UNRECOGNIZED";

export interface GatewayTrafficEvent {
  id: number;
  occurredAt: string;
  gatewayId: string | null;
  gatewayLocationId: string | null;
  gatewayLocationName: string | null;
  messageType: GatewayTrafficMessageType;
  processing: GatewayTrafficProcessing;
  sensorUid: string | null;
  metric: string | null;
  payload: string;
  sourceTopic: string;
}

export interface GatewayTrafficEventsPage {
  events: GatewayTrafficEvent[];
  nextCursor: {
    occurredAt: string;
    id: number;
  } | null;
}

export interface GatewayTrafficSummary {
  hours: number;
  received: number;
  metadata: number;
  sensor: number;
  unknown: number;
  gateways: number;
}

export type ProjectTodoStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "DONE";

export type ProjectTodoPriority =
  | "LOW"
  | "NORMAL"
  | "HIGH"
  | "CRITICAL";

export interface ProjectTodoSection {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectTodo {
  id: string;
  sectionId: string;
  parentId: string | null;
  title: string;
  description: string | null;
  status: ProjectTodoStatus;
  priority: ProjectTodoPriority;
  component: string | null;
  prReference: string | null;
  patchReference: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ProjectTodoData {
  sections: ProjectTodoSection[];
  tasks: ProjectTodo[];
  summary: {
    open: number;
    inProgress: number;
    done: number;
    total: number;
    progressPercent: number;
  };
}

export interface CreateProjectTodoInput {
  sectionId: string;
  parentId?: string | null;
  title: string;
  description?: string | null;
  status?: ProjectTodoStatus;
  priority?: ProjectTodoPriority;
  component?: string | null;
  prReference?: string | null;
  patchReference?: string | null;
  sortOrder?: number;
}

export type UpdateProjectTodoInput =
  Partial<CreateProjectTodoInput>;

export interface SimpleDashboard {
  id: string;
  name: string;
  sortOrder: number;
  templateId: string | null;
  templateMetricKey: string | null;
  templateName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SimpleDashboardSection {
  id: string;
  dashboardId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SimpleDashboardCard {
  id: string;
  dashboardId: string;
  sectionId: string | null;
  assetMetricId: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SimpleDashboardData {
  dashboards: SimpleDashboard[];
  sections: SimpleDashboardSection[];
  cards: SimpleDashboardCard[];
  entityCards: SimpleDashboardEntityCard[];
}

export interface SimpleDashboardEntityCard {
  id: string;
  dashboardId: string;
  sectionId: string | null;
  deviceId: string;
  entityValue: string;
  widgetType: "auto" | "switch" | "value" | "status";
  title: string | null;
  size: "small" | "medium" | "large";
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}


export interface SimpleDashboardTemplate {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface SimpleDashboardTemplateSection {
  id: string;
  templateId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SimpleDashboardTemplateCard {
  id: string;
  templateId: string;
  sectionId: string;
  assetId: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SimpleDashboardTemplateData {
  templates: SimpleDashboardTemplate[];
  sections: SimpleDashboardTemplateSection[];
  cards: SimpleDashboardTemplateCard[];
}

export type DeviceRegistryClass = string;

export interface DeviceClassReference {
  code: string;
  label: string;
  description: string | null;
  icon: string;
  color: string;
  enabled: boolean;
  sortOrder: number;
}

export interface DeviceTypeReference {
  code: string;
  label: string;
  deviceClass: DeviceRegistryClass;
  category: string;
  icon: string;
  color: string;
  enabled: boolean;
  sortOrder: number;
}

export interface DeviceTechnologyReference {
  code: string;
  label: string;
  category: string;
  icon: string;
  color: string;
  enabled: boolean;
  sortOrder: number;
}

export interface DeviceIdentityLabelReference {
  code: string;
  label: string;
  description: string | null;
  enabled: boolean;
  sortOrder: number;
}

export type DeviceHealthStatus =
  | "ONLINE"
  | "WARNING"
  | "OFFLINE"
  | "UNKNOWN"
  | "DISABLED";

export interface DeviceIdentity {
  id?: string;
  identityType: string;
  value: string;
  source: string | null;
  labelCode?: string | null;
  label?: string | null;
  isPrimary?: boolean;
  sortOrder?: number;
}

export interface DeviceLink {
  id?: string;
  targetType: "sensor" | "asset" | "gateway";
  targetId: string;
}

export interface DeviceAccessLink {
  id?: string;
  name: string;
  linkType: string;
  urlTemplate: string;
  username: string | null;
  port: number | null;
  parameters: Record<string, string>;
  icon: string;
  color: string;
  enabled: boolean;
  sortOrder: number;
  publishAsService?: boolean;
  publishedServiceName?: string | null;
  publishedServiceClass?: string | null;
  publishedServiceType?: string | null;
  publishedServiceDescription?: string | null;
}

export interface DeviceHealthProfile {
  id: string;
  name: string;
  description: string | null;
  warningAfterSeconds: number | null;
  offlineAfterSeconds: number | null;
  batteryWarningPercent: number | null;
  batteryCriticalPercent: number | null;
  rssiWarning: number | null;
  rssiCritical: number | null;
  monitoringPolicy: "IGNORE" | "ANY_UP" | "ALL_UP";
  createdAt: string;
  updatedAt: string;
}

export interface DeviceRegistryDevice {
  id: string;
  name: string;
  deviceClass: DeviceRegistryClass;
  deviceClassInfo: Pick<DeviceClassReference, "code" | "label" | "icon" | "color">;
  deviceType: string;
  deviceTypeInfo: Pick<DeviceTypeReference, "code" | "label" | "icon" | "color">;
  technology: string | null;
  technologies: DeviceTechnologyReference[];
  macAddress: string | null;
  ipAddress: string | null;
  ieeeAddress: string | null;
  fqdn: string | null;
  manufacturer: string | null;
  model: string | null;
  firmwareVersion: string | null;
  description: string | null;
  location: { id: string; name: string } | null;
  parentDevice: { id: string; name: string } | null;
  healthProfile: { id: string; name: string } | null;
  controlAgent: { id: string; name: string } | null;
  controlProvider: string | null;
  enabled: boolean;
  lastSeenAt: string | null;
  batteryPercent: number | null;
  rssi: number | null;
  health: {
    status: DeviceHealthStatus;
    reasons: string[];
  };
  identities: DeviceIdentity[];
  links: DeviceLink[];
  accessLinks: DeviceAccessLink[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeviceRegistryDeviceInput {
  name: string;
  deviceClass: DeviceRegistryClass;
  deviceType: string;
  technology?: string | null;
  technologies?: string[];
  macAddress?: string | null;
  ipAddress?: string | null;
  ieeeAddress?: string | null;
  fqdn?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  firmwareVersion?: string | null;
  description?: string | null;
  locationId?: string | null;
  parentDeviceId?: string | null;
  healthProfileId?: string | null;
  controlAgentId?: string | null;
  enabled?: boolean;
  lastSeenAt?: string | null;
  batteryPercent?: number | null;
  rssi?: number | null;
  identities?: DeviceIdentity[];
  links?: DeviceLink[];
  accessLinks?: DeviceAccessLink[];
}

export type UpdateDeviceRegistryDeviceInput = Partial<CreateDeviceRegistryDeviceInput>;

export interface CreateDeviceHealthProfileInput {
  name: string;
  description?: string | null;
  warningAfterSeconds?: number | null;
  offlineAfterSeconds?: number | null;
  batteryWarningPercent?: number | null;
  batteryCriticalPercent?: number | null;
  rssiWarning?: number | null;
  rssiCritical?: number | null;
  monitoringPolicy?: "IGNORE" | "ANY_UP" | "ALL_UP";
}

export type UpdateDeviceHealthProfileInput = Partial<CreateDeviceHealthProfileInput>;

export type ServiceHealthStatus = "ONLINE" | "WARNING" | "OFFLINE" | "UNKNOWN" | "DISABLED";

export interface ServiceClassReference {
  code: string;
  label: string;
  description: string | null;
  icon: string;
  color: string;
  enabled: boolean;
  sortOrder: number;
}

export interface ServiceTypeReference {
  code: string;
  label: string;
  serviceClass: string;
  description: string | null;
  icon: string;
  color: string;
  enabled: boolean;
  sortOrder: number;
}

export interface ServiceRegistryAccessLink {
  id?: string;
  name: string;
  linkType: string;
  urlTemplate: string;
  username: string | null;
  port: number | null;
  parameters: Record<string, string>;
  icon: string;
  color: string;
  enabled: boolean;
  sortOrder: number;
}

export interface ServiceRegistryResource {
  id?: string;
  name: string;
  resourceType: string;
  externalId: string | null;
  description: string | null;
  linkedDeviceId: string | null;
  enabled: boolean;
  sortOrder: number;
}

export interface ServiceRegistryAccount {
  id?: string;
  name: string;
  accountIdentifier: string | null;
  contractIdentifier: string | null;
  description: string | null;
  enabled: boolean;
  sortOrder: number;
  resources: ServiceRegistryResource[];
}

export interface ServiceRegistryService {
  id: string;
  source: "SERVICE_REGISTRY" | "DEVICE_ACCESS_LINK";
  readOnly: boolean;
  sourceDevice?: { id: string; name: string } | null;
  sourceAccessLinkId?: string | null;
  name: string;
  serviceClass: string;
  serviceClassInfo: Pick<ServiceClassReference, "code" | "label" | "icon" | "color">;
  serviceType: string;
  serviceTypeInfo: Pick<ServiceTypeReference, "code" | "label" | "icon" | "color">;
  provider: string | null;
  description: string | null;
  enabled: boolean;
  healthStatus: ServiceHealthStatus;
  lastCheckedAt: string | null;
  accounts: ServiceRegistryAccount[];
  accessLinks: ServiceRegistryAccessLink[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateServiceRegistryServiceInput {
  name: string;
  serviceClass: string;
  serviceType: string;
  provider?: string | null;
  description?: string | null;
  enabled?: boolean;
  healthStatus?: ServiceHealthStatus;
  lastCheckedAt?: string | null;
  accounts?: ServiceRegistryAccount[];
  accessLinks?: ServiceRegistryAccessLink[];
}

export type UpdateServiceRegistryServiceInput = Partial<CreateServiceRegistryServiceInput>;

export type MonitoringCheckType = "PING" | "TCP" | "HTTP" | "HTTPS";
export type MonitoringTargetMode = "PRIMARY_IP" | "PRIMARY_FQDN" | "PRIMARY_ADDRESS" | "CUSTOM";
export type MonitoringExecutionMode = "FAILOVER" | "ALL";
export type MonitoringResultStatus = "UP" | "DOWN" | "UNKNOWN";

export interface MonitoringAgent {
  id: string;
  name: string;
  enabled: boolean;
  labels: Record<string, string>;
  agentLabels: string[];
  version: string | null;
  hostname: string | null;
  os: string | null;
  osVersion: string | null;
  architecture: string | null;
  lastIp: string | null;
  localIp: string | null;
  sourceIp: string | null;
  xForwardedFor: string | null;
  xRealIp: string | null;
  lastSeenAt: string | null;
  heartbeatTimeoutSeconds: number;
  configRevision: number;
  online: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MonitoringAgentTokenResponse {
  agent: MonitoringAgent;
  token: string;
}

export interface MonitoringCheckAssignment {
  agentId: string;
  agentName?: string;
  enabled?: boolean;
  priority?: number;
}

export interface MonitoringCheckState {
  agentId: string;
  agentName: string;
  status: MonitoringResultStatus;
  latencyMs: number | null;
  message: string | null;
  lastCheckAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
}

export interface MonitoringCheck {
  id: string;
  deviceId: string;
  deviceName: string;
  name: string;
  enabled: boolean;
  checkType: MonitoringCheckType;
  targetMode: MonitoringTargetMode;
  targetValue: string | null;
  port: number | null;
  path: string | null;
  intervalSeconds: number;
  timeoutSeconds: number;
  failureThreshold: number;
  recoveryThreshold: number;
  executionMode: MonitoringExecutionMode;
  config: Record<string, unknown>;
  assignments: MonitoringCheckAssignment[];
  states: MonitoringCheckState[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateMonitoringAgentInput {
  name: string;
  labels?: Record<string, string>;
  heartbeatTimeoutSeconds?: number;
}

export interface UpdateMonitoringAgentInput {
  name?: string;
  enabled?: boolean;
  labels?: Record<string, string>;
  heartbeatTimeoutSeconds?: number;
}

export interface CreateMonitoringCheckInput {
  deviceId: string;
  name: string;
  enabled?: boolean;
  checkType: MonitoringCheckType;
  targetMode: MonitoringTargetMode;
  targetValue?: string | null;
  port?: number | null;
  path?: string | null;
  intervalSeconds: number;
  timeoutSeconds: number;
  failureThreshold: number;
  recoveryThreshold: number;
  executionMode: MonitoringExecutionMode;
  assignments: MonitoringCheckAssignment[];
  config?: Record<string, unknown>;
}

export type UpdateMonitoringCheckInput = Partial<CreateMonitoringCheckInput>;

export interface DeviceAgentCapability {
  provider: string;
  actions: string[];
  discovery?: boolean;
}

export interface DeviceAgent {
  id: string;
  name: string;
  enabled: boolean;
  labels: Record<string, string>;
  agentLabels: string[];
  reportedName: string | null;
  version: string | null;
  hostname: string | null;
  os: string | null;
  osVersion: string | null;
  architecture: string | null;
  capabilities: DeviceAgentCapability[];
  lastSeenAt: string | null;
  heartbeatTimeoutSeconds: number;
  online: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDeviceAgentInput {
  name: string;
  labels?: Record<string, string>;
  heartbeatTimeoutSeconds?: number;
}

export interface UpdateDeviceAgentInput {
  name?: string;
  enabled?: boolean;
  labels?: Record<string, string>;
  heartbeatTimeoutSeconds?: number;
}

export interface DeviceAgentTokenResponse {
  agent: DeviceAgent;
  token: string;
}

export type DeviceControlCommandStatus =
  | "PENDING"
  | "SENT"
  | "SUCCESS"
  | "FAILED"
  | "TIMEOUT"
  | "REJECTED";

export interface DeviceControlCommand {
  id?: string;
  commandId?: string;
  deviceId?: string;
  agentId?: string;
  provider?: string;
  action?: string;
  parameters?: Record<string, unknown>;
  status: DeviceControlCommandStatus;
  result?: Record<string, unknown> | null;
  error?: string | null;
  expiresAt: string;
  sentAt?: string | null;
  finishedAt?: string | null;
  createdAt?: string;
}



export type DeviceDiscoveryStatus = "SENT" | "SUCCESS" | "FAILED" | "TIMEOUT";

export interface DeviceDiscovery {
  commandId: string;
  agentId: string;
  provider: string;
  status: DeviceDiscoveryStatus;
  devices: Array<Record<string, unknown>>;
  error: string | null;
  createdAt: string;
  expiresAt: string;
  finishedAt: string | null;
}

export interface DiscardedDeviceDiscovery {
  provider: string;
  identityKey: string;
  label: string | null;
  createdAt: string;
}

export type DiscoveredDeviceActionStatus = "SENT" | "SUCCESS" | "FAILED" | "TIMEOUT";

export interface DiscoveredDeviceAction {
  commandId: string;
  agentId: string;
  provider: string;
  action: string;
  target: Record<string, unknown>;
  status: DiscoveredDeviceActionStatus;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  expiresAt: string;
  finishedAt: string | null;
}

export interface DeviceControlState {
  deviceId: string;
  agentId: string;
  provider: string;
  state: Record<string, unknown>;
  observedAt: string;
}

export interface DeviceControlEntitiesState {
  deviceId: string;
  agentId: string;
  provider: string;
  connected: boolean;
  host: string | null;
  error: string | null;
  entities: Array<Record<string, unknown>>;
  observedAt: string;
}

export interface RealtimeEntityRecord {
  deviceId: string;
  deviceName: string;
  agentId: string;
  agentName: string | null;
  provider: string;
  connected: boolean;
  host: string | null;
  error: string | null;
  entityId: string;
  entityValue: string;
  entityName: string;
  entityType: string;
  currentValue: boolean | number | string | null;
  unit: string | null;
  controllable: boolean;
  observedAt: string;
  deviceObservedAt: string;
}
