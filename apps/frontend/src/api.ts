import type {
  Asset,
  AssetClassification,
  AssetTypeMetadata,
  ManufacturerMetadata,
  TagMetadata,
  CreateAssetInput,
  UpdateAssetInput,
  LatestObservation,
  CreateLocationInput,
  Location,
  Measurement,
  ModuleVersionInfo,
  MoveLocationInput,
  UpdateLocationInput,
  MetricDisplaySetting,
  ObservationAggregatePoint,
  ObservationHistoryPoint,
  RuntimeConfig,
  Sensor,
  CreateSensorInput,
  UpdateSensor,
  Gateway,
  GatewayType,
  CreateGatewayTypeInput,
  UpdateGatewayTypeInput,
  CreateGatewayInput,
  UpdateGatewayInput,
  MetricRoutingDecision,
  MetricRoutingEventsPage,
  MetricRoutingStatus,
  MetricRoutingSummary,
  GatewayTrafficEventsPage,
  GatewayTrafficMessageType,
  GatewayTrafficSummary,
  ProjectTodoData,
  ProjectTodoSection,
  ProjectTodo,
  CreateProjectTodoInput,
  UpdateProjectTodoInput,
  SimpleDashboardData,
  SimpleDashboard,
  SimpleDashboardCard,
  SimpleDashboardEntityCard,
  SimpleDashboardSection,
  SimpleDashboardTemplate,
  SimpleDashboardTemplateCard,
  SimpleDashboardTemplateData,
  SimpleDashboardTemplateSection,
  DeviceRegistryDevice,
  DeviceHealthProfile,
  DeviceClassReference,
  DeviceTypeReference,
  DeviceTechnologyReference,
  DeviceIdentityLabelReference,
  CreateDeviceRegistryDeviceInput,
  UpdateDeviceRegistryDeviceInput,
  CreateDeviceHealthProfileInput,
  UpdateDeviceHealthProfileInput,
  ServiceRegistryService,
  ServiceClassReference,
  ServiceTypeReference,
  CreateServiceRegistryServiceInput,
  UpdateServiceRegistryServiceInput,
  MonitoringAgent,
  MonitoringAgentTokenResponse,
  MonitoringSlot,
  MonitoringCheck,
  CreateMonitoringAgentInput,
  UpdateMonitoringAgentInput,
  CreateMonitoringCheckInput,
  UpdateMonitoringCheckInput,
  DeviceAgent,
  DeviceAgentTokenResponse, ManagedAgentOperation, ManagedAgentOperationInput, AgentTokenCheckResult,
  CreateDeviceAgentInput,
  UpdateDeviceAgentInput,
  DeviceControlCommand,
  DeviceControlState,
  DeviceControlEntitiesState,
  RealtimeEntityRecord,
  DeviceDiscovery,
  DiscardedDeviceDiscovery,
  DiscoveredDeviceAction,
  AuthContext,
  SensorSphereUser,
  SensorSphereRole,
  IdentityProvider,
  UserSummary,
  AuthAuditEntry
} from "./types";

async function readJson<T>(
  response: Response
): Promise<T> {

  if (!response.ok) {
    const body =
      await response
        .json()
        .catch(() => null);

    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : `HTTP ${response.status}`;

    throw new Error(message);
  }

  return response.json();
}

function devAuthHeaders(): HeadersInit {
  const role =
    window.localStorage.getItem("sensorsphere.auth.devRole");

  return role === "admin" || role === "user"
    ? { "X-SensorSphere-Dev-Role": role }
    : {};
}

export function setDevAuthRole(role: SensorSphereRole): void {
  window.localStorage.setItem(
    "sensorsphere.auth.devRole",
    role
  );
}

export async function getAuthContext():
Promise<AuthContext> {
  return readJson<AuthContext>(
    await fetch(
      "/api/v1/auth/context",
      { headers: devAuthHeaders() }
    )
  );
}

export async function logout(): Promise<void> {
  const response = await fetch(
    "/api/v1/auth/logout",
    {
      method: "POST",
      headers: devAuthHeaders()
    }
  );
  if (!response.ok) await readJson<unknown>(response);
}

export function oidcLoginUrl(provider: IdentityProvider): string {
  return `/api/v1/auth/oidc/${provider}/start`;
}

export function oidcLinkUrl(provider: IdentityProvider): string {
  return `/api/v1/auth/oidc/${provider}/link`;
}

export async function getUsers():
Promise<SensorSphereUser[]> {
  return readJson<SensorSphereUser[]>(
    await fetch(
      "/api/v1/admin/users",
      { headers: devAuthHeaders() }
    )
  );
}

export async function approveUser(
  id: string
): Promise<SensorSphereUser> {
  return readJson<SensorSphereUser>(
    await fetch(
      `/api/v1/admin/users/${id}/approve`,
      {
        method: "POST",
        headers: devAuthHeaders()
      }
    )
  );
}

export async function createDevPendingUser(
  email: string,
  displayName?: string
): Promise<SensorSphereUser> {
  return readJson<SensorSphereUser>(
    await fetch(
      "/api/v1/auth/dev/users",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...devAuthHeaders()
        },
        body: JSON.stringify({ email, displayName })
      }
    )
  );
}

export async function getUserSummary():
Promise<UserSummary> {
  return readJson<UserSummary>(
    await fetch(
      "/api/v1/admin/users/summary",
      { headers: devAuthHeaders() }
    )
  );
}

export async function setUserRole(
  id: string,
  role: SensorSphereRole
): Promise<SensorSphereUser> {
  return readJson<SensorSphereUser>(
    await fetch(
      `/api/v1/admin/users/${id}/role`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...devAuthHeaders()
        },
        body: JSON.stringify({ role })
      }
    )
  );
}

async function userAction(
  id: string,
  action: "approve" | "reject" | "disable" | "enable"
): Promise<SensorSphereUser> {
  return readJson<SensorSphereUser>(
    await fetch(
      `/api/v1/admin/users/${id}/${action}`,
      {
        method: "POST",
        headers: devAuthHeaders()
      }
    )
  );
}

export const rejectUser =
  (id: string) => userAction(id, "reject");
export const disableUser =
  (id: string) => userAction(id, "disable");
export const enableUser =
  (id: string) => userAction(id, "enable");

export async function addDevUserIdentity(
  id: string,
  input: {
    provider: IdentityProvider;
    providerSubject: string;
    providerTenant?: string | null;
    providerEmail?: string | null;
  }
): Promise<SensorSphereUser> {
  return readJson<SensorSphereUser>(
    await fetch(
      `/api/v1/admin/users/${id}/identities`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...devAuthHeaders()
        },
        body: JSON.stringify(input)
      }
    )
  );
}

export async function unlinkUserIdentity(
  id: string,
  provider: IdentityProvider,
  subject: string
): Promise<void> {
  const response = await fetch(
    `/api/v1/admin/users/${id}/identities/${provider}/${encodeURIComponent(subject)}`,
    {
      method: "DELETE",
      headers: devAuthHeaders()
    }
  );
  if (!response.ok) await readJson<unknown>(response);
}

export async function getAuthAudit():
Promise<AuthAuditEntry[]> {
  return readJson<AuthAuditEntry[]>(
    await fetch(
      "/api/v1/admin/auth-audit",
      { headers: devAuthHeaders() }
    )
  );
}

export async function getRuntimeConfig():
Promise<RuntimeConfig> {

  const response =
    await fetch(
      "/api/v1/config"
    );

  return readJson<RuntimeConfig>(
    response
  );
}

export async function getModuleVersions():
Promise<ModuleVersionInfo[]> {

  const response =
    await fetch(
      "/api/v1/module-versions",
      { cache: "no-store" }
    );

  return readJson<ModuleVersionInfo[]>(
    response
  );
}

export async function getFrontendBuildDate():
Promise<string | null> {
  const response =
    await fetch(
      "/build-date.txt",
      { cache: "no-store" }
    );

  if (!response.ok) {
    return null;
  }

  const value =
    (await response.text()).trim();

  return value || null;
}

export async function getGatewayTypes():
Promise<GatewayType[]> {

  const response =
    await fetch(
      "/api/v1/gateway-types"
    );

  return readJson<GatewayType[]>(
    response
  );
}

export async function createGatewayType(
  input: CreateGatewayTypeInput
): Promise<GatewayType> {
  const response = await fetch("/api/v1/gateway-types", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return readJson<GatewayType>(response);
}

export async function updateGatewayType(
  id: string,
  input: UpdateGatewayTypeInput
): Promise<GatewayType> {
  const response = await fetch(`/api/v1/gateway-types/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return readJson<GatewayType>(response);
}

export async function deleteGatewayType(id: string): Promise<void> {
  const response = await fetch(`/api/v1/gateway-types/${id}`, { method: "DELETE" });
  if (!response.ok) await readJson<unknown>(response);
}

export async function getGateways():
Promise<Gateway[]> {

  const response =
    await fetch(
      "/api/v1/gateways"
    );

  return readJson<Gateway[]>(
    response
  );
}

export async function createGateway(
  input: CreateGatewayInput
): Promise<Gateway> {

  const response =
    await fetch(
      "/api/v1/gateways",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify(input)
      }
    );

  return readJson<Gateway>(response);
}

export async function updateGateway(
  id: string,
  input: UpdateGatewayInput
): Promise<Gateway> {

  const response =
    await fetch(
      `/api/v1/gateways/${id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify(input)
      }
    );

  return readJson<Gateway>(response);
}

export async function deleteGateway(
  id: string
): Promise<void> {

  const response =
    await fetch(
      `/api/v1/gateways/${id}`,
      {
        method: "DELETE"
      }
    );

  if (!response.ok) {
    await readJson<unknown>(response);
  }
}


export async function getMetricRoutingStatus():
Promise<MetricRoutingStatus> {
  return readJson<MetricRoutingStatus>(
    await fetch("/api/v1/metric-routing/status")
  );
}

export async function getMetricRoutingEvents(input: {
  hours: number;
  limit?: number;
  decision?: MetricRoutingDecision | string | null;
  sensorUid?: string;
  gatewayId?: string;
  location?: string;
  metric?: string;
  assignedGatewayId?: string;
  reason?: string;
  beforeOccurredAt?: string;
  beforeId?: number;
}): Promise<MetricRoutingEventsPage> {
  const params = new URLSearchParams({
    hours: String(input.hours),
    limit: String(input.limit ?? 500)
  });

  if (input.decision) params.set("decision", input.decision);
  if (input.sensorUid?.trim()) params.set("sensorUid", input.sensorUid.trim());
  if (input.gatewayId?.trim()) params.set("gatewayId", input.gatewayId.trim());
  if (input.location?.trim()) params.set("location", input.location.trim());
  if (input.metric?.trim()) params.set("metric", input.metric.trim());
  if (input.assignedGatewayId?.trim()) params.set("assignedGatewayId", input.assignedGatewayId.trim());
  if (input.reason?.trim()) params.set("reason", input.reason.trim());
  if (input.beforeOccurredAt) params.set("beforeOccurredAt", input.beforeOccurredAt);
  if (input.beforeId !== undefined) params.set("beforeId", String(input.beforeId));

  return readJson<MetricRoutingEventsPage>(
    await fetch(`/api/v1/metric-routing/events?${params}`)
  );
}

export async function getMetricRoutingSummary(
  hours: number
): Promise<MetricRoutingSummary> {
  return readJson<MetricRoutingSummary>(
    await fetch(`/api/v1/metric-routing/summary?hours=${encodeURIComponent(String(hours))}`)
  );
}

export async function clearMetricRoutingEvents(): Promise<{
  status: string;
  deletedEvents: number;
}> {
  return readJson<{
    status: string;
    deletedEvents: number;
  }>(
    await fetch(
      "/api/v1/metric-routing/events",
      { method: "DELETE" }
    )
  );
}

export async function getGatewayTrafficEvents(input: {
  hours: number;
  limit?: number;
  messageType?: GatewayTrafficMessageType | string | null;
  processing?: string | null;
  gatewayId?: string;
  sensorUid?: string;
  metric?: string;
  topic?: string;
  payload?: string;
  beforeOccurredAt?: string;
  beforeId?: number;
}): Promise<GatewayTrafficEventsPage> {
  const params = new URLSearchParams({
    hours: String(input.hours),
    limit: String(input.limit ?? 500)
  });

  if (input.messageType) params.set("messageType", input.messageType);
  if (input.processing) params.set("processing", input.processing);
  if (input.gatewayId?.trim()) params.set("gatewayId", input.gatewayId.trim());
  if (input.sensorUid?.trim()) params.set("sensorUid", input.sensorUid.trim());
  if (input.metric?.trim()) params.set("metric", input.metric.trim());
  if (input.topic?.trim()) params.set("topic", input.topic.trim());
  if (input.payload?.trim()) params.set("payload", input.payload.trim());
  if (input.beforeOccurredAt) params.set("beforeOccurredAt", input.beforeOccurredAt);
  if (input.beforeId !== undefined) params.set("beforeId", String(input.beforeId));

  return readJson<GatewayTrafficEventsPage>(
    await fetch(`/api/v1/gateway-traffic/events?${params}`)
  );
}

export async function getGatewayTrafficSummary(
  hours: number
): Promise<GatewayTrafficSummary> {
  return readJson<GatewayTrafficSummary>(
    await fetch(`/api/v1/gateway-traffic/summary?hours=${encodeURIComponent(String(hours))}`)
  );
}

export async function clearGatewayTrafficEvents(): Promise<{
  status: string;
  deletedEvents: number;
}> {
  return readJson<{
    status: string;
    deletedEvents: number;
  }>(
    await fetch(
      "/api/v1/gateway-traffic/events",
      { method: "DELETE" }
    )
  );
}

export async function getSensors():
Promise<Sensor[]> {

  const response =
    await fetch(
      "/api/v1/sensors"
    );

  return readJson<Sensor[]>(
    response
  );
}

export async function createSensor(
  input: CreateSensorInput
): Promise<Sensor> {

  const response =
    await fetch(
      "/api/v1/sensors",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body:
          JSON.stringify(input)
      }
    );

  return readJson<Sensor>(
    response
  );
}

export async function getSensor(
  id: string
): Promise<Sensor> {

  const response =
    await fetch(
      `/api/v1/sensors/${id}`
    );

  return readJson<Sensor>(
    response
  );
}

export async function updateSensor(
  id: string,
  input: UpdateSensor
): Promise<Sensor> {

  const response =
    await fetch(
      `/api/v1/sensors/${id}`,
      {
        method: "PATCH",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(input)
      }
    );

  return readJson<Sensor>(
    response
  );
}

export async function getLatestMeasurements():
Promise<Measurement[]> {

  const [
    measurementsResponse,
    sensors
  ] =
    await Promise.all([
      fetch(
        "/api/v1/measurements/latest"
      ),
      getSensors()
    ]);

  const measurements =
    await readJson<Measurement[]>(
      measurementsResponse
    );

  const sensorsByUid =
    new Map(
      sensors.map(
        sensor => [
          sensor.uid,
          sensor
        ]
      )
    );

  return measurements.map(
    measurement => ({
      ...measurement,
      sensorName:
        sensorsByUid.get(
          measurement.sensorUid
        )?.name ?? null
    })
  );
}

export async function getHistory(
  sensorUid: string,
  hours = 24
): Promise<Measurement[]> {

  const to =
    new Date();

  const from =
    new Date(
      to.getTime() -
      hours * 60 * 60 * 1000
    );

  const params =
    new URLSearchParams({
      sensor_uid:
        sensorUid,

      from:
        from.toISOString(),

      to:
        to.toISOString()
    });

  const response =
    await fetch(
      `/api/v1/measurements/history?${params}`
    );

  return readJson<Measurement[]>(
    response
  );
}


export async function getAssetClassification():
Promise<AssetClassification> {
  return readJson<AssetClassification>(
    await fetch("/api/v1/asset-classification")
  );
}

export async function createAssetType(input: {
  key: string;
  name: string;
  description?: string | null;
}): Promise<AssetTypeMetadata> {
  return readJson<AssetTypeMetadata>(
    await fetch("/api/v1/asset-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export async function updateAssetType(
  key: string,
  input: Partial<{ key: string; name: string; description: string | null }>
): Promise<AssetTypeMetadata> {
  return readJson<AssetTypeMetadata>(
    await fetch(`/api/v1/asset-types/${encodeURIComponent(key)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export async function deleteAssetType(key: string): Promise<void> {
  const response = await fetch(`/api/v1/asset-types/${encodeURIComponent(key)}`, { method: "DELETE" });
  if (!response.ok) await readJson<unknown>(response);
}

export async function createManufacturer(name: string): Promise<ManufacturerMetadata> {
  return readJson<ManufacturerMetadata>(
    await fetch("/api/v1/manufacturers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    })
  );
}

export async function updateManufacturer(
  currentName: string,
  name: string
): Promise<ManufacturerMetadata> {
  return readJson<ManufacturerMetadata>(
    await fetch(`/api/v1/manufacturers/${encodeURIComponent(currentName)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    })
  );
}

export async function deleteManufacturer(name: string): Promise<void> {
  const response = await fetch(`/api/v1/manufacturers/${encodeURIComponent(name)}`, { method: "DELETE" });
  if (!response.ok) await readJson<unknown>(response);
}

export async function createTag(name: string): Promise<TagMetadata> {
  return readJson<TagMetadata>(
    await fetch("/api/v1/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    })
  );
}

export async function updateTag(id: string, name: string): Promise<TagMetadata> {
  return readJson<TagMetadata>(
    await fetch(`/api/v1/tags/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    })
  );
}

export async function deleteTag(id: string): Promise<void> {
  const response = await fetch(`/api/v1/tags/${id}`, { method: "DELETE" });
  if (!response.ok) await readJson<unknown>(response);
}

export async function getAssets():
Promise<Asset[]> {

  const response =
    await fetch(
      "/api/v1/assets"
    );

  return readJson<Asset[]>(
    response
  );
}

export async function createAsset(
  input: CreateAssetInput
): Promise<Asset> {
  const response =
    await fetch(
      "/api/v1/assets",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify(input)
      }
    );

  return readJson<Asset>(response);
}

export async function updateAsset(
  assetId: string,
  input: UpdateAssetInput
): Promise<Asset> {
  const response =
    await fetch(
      `/api/v1/assets/${assetId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify(input)
      }
    );

  return readJson<Asset>(response);
}

export async function deleteAsset(
  assetId: string
): Promise<void> {
  const response =
    await fetch(
      `/api/v1/assets/${assetId}`,
      { method: "DELETE" }
    );

  if (!response.ok) {
    const body =
      await response.json().catch(() => null);
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : `HTTP ${response.status}`;
    throw new Error(message);
  }
}

export async function getLatestObservations():
Promise<LatestObservation[]> {

  const response =
    await fetch(
      "/api/v1/observations/latest"
    );

  return readJson<LatestObservation[]>(
    response
  );
}

export async function getObservationHistory(
  metricId: string,
  hours = 24
): Promise<ObservationHistoryPoint[]> {

  const to =
    new Date();

  const from =
    new Date(
      to.getTime() -
      hours * 60 * 60 * 1000
    );

  const params =
    new URLSearchParams({
      metricId,
      from:
        from.toISOString(),
      to:
        to.toISOString()
    });

  const response =
    await fetch(
      `/api/v1/observations/history?${params}`
    );

  return readJson<ObservationHistoryPoint[]>(
    response
  );
}

export async function getObservationAggregates(
  metricId: string,
  hours: number,
  bucket: "15 minutes" | "1 hour"
): Promise<ObservationAggregatePoint[]> {

  const to =
    new Date();

  const from =
    new Date(
      to.getTime() -
      hours * 60 * 60 * 1000
    );

  const params =
    new URLSearchParams({
      metricId,
      from:
        from.toISOString(),
      to:
        to.toISOString(),
      bucket
    });

  const response =
    await fetch(
      `/api/v1/observations/aggregate?${params}`
    );

  return readJson<ObservationAggregatePoint[]>(
    response
  );
}

export async function getMetricDisplaySettings():
Promise<MetricDisplaySetting[]> {

  const response =
    await fetch(
      "/api/v1/metric-display-settings"
    );

  return readJson<MetricDisplaySetting[]>(
    response
  );
}

export async function updateMetricDisplaySetting(
  metricKey: string,
  color: string
): Promise<MetricDisplaySetting> {

  const response =
    await fetch(
      `/api/v1/metric-display-settings/${encodeURIComponent(metricKey)}`,
      {
        method: "PUT",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            color
          })
      }
    );

  return readJson<MetricDisplaySetting>(
    response
  );
}

export async function getLocations():
Promise<Location[]> {

  const response =
    await fetch(
      "/api/v1/locations"
    );

  return readJson<Location[]>(
    response
  );
}

export async function updateAssetLocation(
  assetId: string,
  locationId: string | null
): Promise<Asset> {

  const response =
    await fetch(
      `/api/v1/assets/${assetId}/location`,
      {
        method: "PATCH",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            locationId
          })
      }
    );

  return readJson<Asset>(
    response
  );
}

export async function createLocation(
  input: CreateLocationInput
): Promise<Location> {

  const response =
    await fetch(
      "/api/v1/locations",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(input)
      }
    );

  return readJson<Location>(
    response
  );
}

export async function updateLocation(
  id: string,
  input: UpdateLocationInput
): Promise<Location> {

  const response =
    await fetch(
      `/api/v1/locations/${id}`,
      {
        method: "PATCH",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(input)
      }
    );

  return readJson<Location>(
    response
  );
}

export async function deleteLocation(
  id: string
): Promise<void> {

  const response =
    await fetch(
      `/api/v1/locations/${id}`,
      {
        method: "DELETE"
      }
    );

  if (!response.ok) {
    const body =
      await response
        .json()
        .catch(() => null);

    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : `HTTP ${response.status}`;

    throw new Error(message);
  }
}

export async function moveLocation(
  id: string,
  input: MoveLocationInput
): Promise<Location> {

  const response =
    await fetch(
      `/api/v1/locations/${id}/move`,
      {
        method: "PATCH",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(input)
      }
    );

  return readJson<Location>(
    response
  );
}

export async function getGatewayCoverage(
  hours = 24
): Promise<import("./types").GatewayCoverageResponse> {
  const params =
    new URLSearchParams({
      hours: String(hours)
    });

  const response =
    await fetch(
      `/api/v1/gateway-coverage?${params}`
    );

  return readJson<import("./types").GatewayCoverageResponse>(
    response
  );
}

export async function updateGatewayCoverageLocation(
  gatewayId: string,
  locationId: string | null
): Promise<{
  status: string;
  gatewayId: string;
  locationId: string | null;
}> {
  const response =
    await fetch(
      `/api/v1/gateway-coverage/${encodeURIComponent(gatewayId)}/location`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          locationId
        })
      }
    );

  return readJson<{
    status: string;
    gatewayId: string;
    locationId: string | null;
  }>(response);
}

export async function resetGatewayCoverage():
Promise<{
  status: string;
  deletedSamples: number;
}> {
  const response =
    await fetch(
      "/api/v1/gateway-coverage",
      {
        method: "DELETE"
      }
    );

  return readJson<{
    status: string;
    deletedSamples: number;
  }>(response);
}

export async function resetGatewayCoverageGateway(
  gatewayId: string
): Promise<{
  status: string;
  gatewayId: string;
  deletedSamples: number;
}> {
  const response =
    await fetch(
      `/api/v1/gateway-coverage/${encodeURIComponent(gatewayId)}/samples`,
      {
        method: "DELETE"
      }
    );

  return readJson<{
    status: string;
    gatewayId: string;
    deletedSamples: number;
  }>(response);
}

export async function resetGatewayCoverageSensor(
  sensorUid: string
): Promise<{
  status: string;
  sensorUid: string;
  deletedSamples: number;
}> {
  const response =
    await fetch(
      `/api/v1/gateway-coverage/sensors/${encodeURIComponent(sensorUid)}/samples`,
      {
        method: "DELETE"
      }
    );

  return readJson<{
    status: string;
    sensorUid: string;
    deletedSamples: number;
  }>(response);
}

export async function deleteGatewayCoverageSensor(
  sensorUid: string
): Promise<{
  status: string;
  sensorUid: string;
  deletedSamples: number;
}> {
  const response =
    await fetch(
      `/api/v1/gateway-coverage/sensors/${encodeURIComponent(sensorUid)}`,
      {
        method: "DELETE"
      }
    );

  return readJson<{
    status: string;
    sensorUid: string;
    deletedSamples: number;
  }>(response);
}

export async function deleteAllGatewayCoverageGateways():
Promise<{
  status: string;
  deletedGateways: number;
  deletedSamples: number;
}> {
  const response =
    await fetch(
      "/api/v1/gateway-coverage/gateways",
      {
        method: "DELETE"
      }
    );

  return readJson<{
    status: string;
    deletedGateways: number;
    deletedSamples: number;
  }>(response);
}

export async function deleteGatewayCoverageGateway(
  gatewayId: string
): Promise<{
  status: string;
  gatewayId: string;
  deletedSamples: number;
}> {
  const response =
    await fetch(
      `/api/v1/gateway-coverage/${encodeURIComponent(gatewayId)}`,
      {
        method: "DELETE"
      }
    );

  return readJson<{
    status: string;
    gatewayId: string;
    deletedSamples: number;
  }>(response);
}


export async function getProjectTodos():
Promise<ProjectTodoData> {
  return readJson<ProjectTodoData>(
    await fetch("/api/v1/project-todos")
  );
}

export async function createProjectTodoSection(input: {
  name: string;
  sortOrder?: number;
}): Promise<ProjectTodoSection> {
  return readJson<ProjectTodoSection>(
    await fetch("/api/v1/project-todos/sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export async function updateProjectTodoSection(
  id: string,
  input: { name?: string; sortOrder?: number }
): Promise<ProjectTodoSection> {
  return readJson<ProjectTodoSection>(
    await fetch(`/api/v1/project-todos/sections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export async function deleteProjectTodoSection(id: string): Promise<void> {
  const response = await fetch(`/api/v1/project-todos/sections/${id}`, { method: "DELETE" });
  if (!response.ok) await readJson<unknown>(response);
}

export async function createProjectTodo(input: CreateProjectTodoInput): Promise<ProjectTodo> {
  return readJson<ProjectTodo>(
    await fetch("/api/v1/project-todos/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export async function updateProjectTodo(
  id: string,
  input: UpdateProjectTodoInput
): Promise<ProjectTodo> {
  return readJson<ProjectTodo>(
    await fetch(`/api/v1/project-todos/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export async function deleteProjectTodo(id: string): Promise<void> {
  const response = await fetch(`/api/v1/project-todos/tasks/${id}`, { method: "DELETE" });
  if (!response.ok) await readJson<unknown>(response);
}

export async function exportProjectTodosMarkdown(): Promise<string> {
  const response = await fetch("/api/v1/project-todos/export");
  if (!response.ok) await readJson<unknown>(response);
  return response.text();
}

export async function importProjectTodosMarkdown(markdown: string): Promise<{
  sections: number;
  tasks: number;
}> {
  return readJson<{ sections: number; tasks: number }>(
    await fetch("/api/v1/project-todos/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markdown, replace: true })
    })
  );
}


export async function getSimpleDashboards():
Promise<SimpleDashboardData> {
  return readJson<SimpleDashboardData>(
    await fetch("/api/v1/simple-dashboards", { cache: "no-store" })
  );
}

export async function createSimpleDashboard(
  name: string
): Promise<SimpleDashboard> {
  return readJson<SimpleDashboard>(
    await fetch("/api/v1/simple-dashboards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    })
  );
}

export async function renameSimpleDashboard(
  id: string,
  name: string
): Promise<SimpleDashboard> {
  return readJson<SimpleDashboard>(
    await fetch(`/api/v1/simple-dashboards/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    })
  );
}

export async function reorderSimpleDashboards(dashboardIds: string[]): Promise<void> {
  await readJson<{ status: string }>(
    await fetch("/api/v1/simple-dashboards/order", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dashboardIds })
    })
  );
}

export async function createSimpleDashboardSection(dashboardId: string, name: string): Promise<SimpleDashboardSection> {
  return readJson<SimpleDashboardSection>(
    await fetch(`/api/v1/simple-dashboards/${encodeURIComponent(dashboardId)}/sections`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name })
    })
  );
}

export async function renameSimpleDashboardSection(dashboardId: string, sectionId: string, name: string): Promise<SimpleDashboardSection> {
  return readJson<SimpleDashboardSection>(
    await fetch(`/api/v1/simple-dashboards/${encodeURIComponent(dashboardId)}/sections/${encodeURIComponent(sectionId)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name })
    })
  );
}

export async function deleteSimpleDashboardSection(dashboardId: string, sectionId: string): Promise<void> {
  const response = await fetch(`/api/v1/simple-dashboards/${encodeURIComponent(dashboardId)}/sections/${encodeURIComponent(sectionId)}`, { method: "DELETE" });
  if (!response.ok) await readJson<never>(response);
}

export async function reorderSimpleDashboardSections(dashboardId: string, sectionIds: string[]): Promise<void> {
  await readJson<{ status: string }>(
    await fetch(`/api/v1/simple-dashboards/${encodeURIComponent(dashboardId)}/sections/order`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sectionIds })
    })
  );
}

export async function deleteSimpleDashboard(
  id: string
): Promise<void> {
  const response = await fetch(
    `/api/v1/simple-dashboards/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
  if (!response.ok) {
    await readJson<never>(response);
  }
}

export async function addSimpleDashboardCard(
  dashboardId: string,
  assetMetricId: string,
  sectionId: string | null = null
): Promise<SimpleDashboardCard> {
  return readJson<SimpleDashboardCard>(
    await fetch(
      `/api/v1/simple-dashboards/${encodeURIComponent(dashboardId)}/cards`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetMetricId, sectionId })
      }
    )
  );
}

export async function addSimpleDashboardEntityCard(
  dashboardId: string,
  deviceId: string,
  entityValue: string,
  widgetType: "auto" | "switch" | "value" | "status" = "auto",
  sectionId: string | null = null
): Promise<SimpleDashboardEntityCard> {
  return readJson<SimpleDashboardEntityCard>(
    await fetch(`/api/v1/simple-dashboards/${encodeURIComponent(dashboardId)}/entity-cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, entityValue, widgetType, sectionId })
    })
  );
}

export async function updateSimpleDashboardEntityCard(
  dashboardId: string,
  cardId: string,
  input: { widgetType: "auto" | "switch" | "value" | "status"; sectionId: string | null; title: string | null; size: "small" | "medium" | "large"; targetDashboardId?: string }
): Promise<SimpleDashboardEntityCard> {
  return readJson<SimpleDashboardEntityCard>(await fetch(
    `/api/v1/simple-dashboards/${encodeURIComponent(dashboardId)}/entity-cards/${encodeURIComponent(cardId)}`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }
  ));
}

export async function deleteSimpleDashboardEntityCard(
  dashboardId: string,
  cardId: string
): Promise<void> {
  const response = await fetch(
    `/api/v1/simple-dashboards/${encodeURIComponent(dashboardId)}/entity-cards/${encodeURIComponent(cardId)}`,
    { method: "DELETE" }
  );
  if (!response.ok) await readJson<never>(response);
}

export async function updateSimpleDashboardCard(
  dashboardId: string,
  cardId: string,
  assetMetricId: string,
  sectionId: string | null = null,
  targetDashboardId?: string
): Promise<SimpleDashboardCard> {
  return readJson<SimpleDashboardCard>(
    await fetch(
      `/api/v1/simple-dashboards/${encodeURIComponent(dashboardId)}/cards/${encodeURIComponent(cardId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetMetricId, sectionId, targetDashboardId })
      }
    )
  );
}

export async function deleteSimpleDashboardCard(
  dashboardId: string,
  cardId: string
): Promise<void> {
  const response = await fetch(
    `/api/v1/simple-dashboards/${encodeURIComponent(dashboardId)}/cards/${encodeURIComponent(cardId)}`,
    { method: "DELETE" }
  );
  if (!response.ok) {
    await readJson<never>(response);
  }
}

export async function reorderSimpleDashboardCards(
  dashboardId: string,
  cardIds: string[]
): Promise<void> {
  await readJson<{ status: string }>(
    await fetch(
      `/api/v1/simple-dashboards/${encodeURIComponent(dashboardId)}/cards/order`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds })
      }
    )
  );
}

export async function getSimpleDashboardTemplates(): Promise<SimpleDashboardTemplateData> {
  return readJson<SimpleDashboardTemplateData>(
    await fetch("/api/v1/simple-dashboard-templates", { cache: "no-store" })
  );
}

export async function createSimpleDashboardTemplate(name: string): Promise<SimpleDashboardTemplate> {
  return readJson<SimpleDashboardTemplate>(
    await fetch("/api/v1/simple-dashboard-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    })
  );
}

export async function renameSimpleDashboardTemplate(id: string, name: string): Promise<SimpleDashboardTemplate> {
  return readJson<SimpleDashboardTemplate>(
    await fetch(`/api/v1/simple-dashboard-templates/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    })
  );
}

export async function deleteSimpleDashboardTemplate(id: string): Promise<void> {
  const response = await fetch(`/api/v1/simple-dashboard-templates/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) await readJson<never>(response);
}

export async function createSimpleDashboardTemplateSection(templateId: string, name: string): Promise<SimpleDashboardTemplateSection> {
  return readJson<SimpleDashboardTemplateSection>(
    await fetch(`/api/v1/simple-dashboard-templates/${encodeURIComponent(templateId)}/sections`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name })
    })
  );
}

export async function renameSimpleDashboardTemplateSection(templateId: string, sectionId: string, name: string): Promise<SimpleDashboardTemplateSection> {
  return readJson<SimpleDashboardTemplateSection>(
    await fetch(`/api/v1/simple-dashboard-templates/${encodeURIComponent(templateId)}/sections/${encodeURIComponent(sectionId)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name })
    })
  );
}

export async function deleteSimpleDashboardTemplateSection(templateId: string, sectionId: string): Promise<void> {
  const response = await fetch(`/api/v1/simple-dashboard-templates/${encodeURIComponent(templateId)}/sections/${encodeURIComponent(sectionId)}`, { method: "DELETE" });
  if (!response.ok) await readJson<never>(response);
}

export async function addSimpleDashboardTemplateAsset(templateId: string, sectionId: string, assetId: string): Promise<SimpleDashboardTemplateCard> {
  return readJson<SimpleDashboardTemplateCard>(
    await fetch(`/api/v1/simple-dashboard-templates/${encodeURIComponent(templateId)}/cards`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sectionId, assetId })
    })
  );
}

export async function deleteSimpleDashboardTemplateAsset(templateId: string, cardId: string): Promise<void> {
  const response = await fetch(`/api/v1/simple-dashboard-templates/${encodeURIComponent(templateId)}/cards/${encodeURIComponent(cardId)}`, { method: "DELETE" });
  if (!response.ok) await readJson<never>(response);
}

export async function instantiateSimpleDashboardTemplate(templateId: string, metricKeys: string[]): Promise<SimpleDashboard[]> {
  return readJson<SimpleDashboard[]>(
    await fetch(`/api/v1/simple-dashboard-templates/${encodeURIComponent(templateId)}/instances`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metricKeys })
    })
  );
}


export async function convertSimpleDashboardToTemplate(
  id: string,
  input: { name: string; createInstance: boolean; metricKey: string | null }
): Promise<{ template: SimpleDashboardTemplate; instance: SimpleDashboard | null }> {
  return readJson<{ template: SimpleDashboardTemplate; instance: SimpleDashboard | null }>(
    await fetch(`/api/v1/simple-dashboards/${encodeURIComponent(id)}/convert-to-template`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export async function detachSimpleDashboard(id: string): Promise<SimpleDashboard> {
  return readJson<SimpleDashboard>(
    await fetch(`/api/v1/simple-dashboards/${encodeURIComponent(id)}/detach`, { method: "POST" })
  );
}

export async function reorderSimpleDashboardTemplateSections(templateId: string, sectionIds: string[]): Promise<void> {
  await readJson<{ status: string }>(await fetch(`/api/v1/simple-dashboard-templates/${encodeURIComponent(templateId)}/sections/order`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sectionIds })
  }));
}

export async function reorderSimpleDashboardTemplateAssets(templateId: string, cardIds: string[]): Promise<void> {
  await readJson<{ status: string }>(await fetch(`/api/v1/simple-dashboard-templates/${encodeURIComponent(templateId)}/cards/order`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardIds })
  }));
}



export async function getDeviceClassReferences(): Promise<DeviceClassReference[]> {
  return readJson<DeviceClassReference[]>(await fetch("/api/v1/device-registry/reference/device-classes"));
}

export async function getDeviceTaxonomyClasses(): Promise<DeviceClassReference[]> {
  return readJson<DeviceClassReference[]>(await fetch("/api/v1/device-registry/taxonomy/classes"));
}

export async function createDeviceTaxonomyClass(input: DeviceClassReference): Promise<DeviceClassReference> {
  return readJson<DeviceClassReference>(await fetch("/api/v1/device-registry/taxonomy/classes", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
  }));
}

export async function updateDeviceTaxonomyClass(code: string, input: Partial<Omit<DeviceClassReference, "code">>): Promise<DeviceClassReference> {
  return readJson<DeviceClassReference>(await fetch(`/api/v1/device-registry/taxonomy/classes/${encodeURIComponent(code)}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
  }));
}

export async function deleteDeviceTaxonomyClass(code: string): Promise<void> {
  const response = await fetch(`/api/v1/device-registry/taxonomy/classes/${encodeURIComponent(code)}`, { method: "DELETE" });
  if (!response.ok) await readJson<unknown>(response);
}

export async function getDeviceTaxonomyTypes(): Promise<DeviceTypeReference[]> {
  return readJson<DeviceTypeReference[]>(await fetch("/api/v1/device-registry/taxonomy/types"));
}

export async function createDeviceTaxonomyType(input: DeviceTypeReference): Promise<DeviceTypeReference> {
  return readJson<DeviceTypeReference>(await fetch("/api/v1/device-registry/taxonomy/types", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
  }));
}

export async function updateDeviceTaxonomyType(code: string, input: Partial<Omit<DeviceTypeReference, "code">>): Promise<DeviceTypeReference> {
  return readJson<DeviceTypeReference>(await fetch(`/api/v1/device-registry/taxonomy/types/${encodeURIComponent(code)}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
  }));
}

export async function deleteDeviceTaxonomyType(code: string): Promise<void> {
  const response = await fetch(`/api/v1/device-registry/taxonomy/types/${encodeURIComponent(code)}`, { method: "DELETE" });
  if (!response.ok) await readJson<unknown>(response);
}

export async function getDeviceTaxonomyTechnologies(): Promise<DeviceTechnologyReference[]> {
  return readJson<DeviceTechnologyReference[]>(await fetch("/api/v1/device-registry/taxonomy/technologies"));
}

export async function createDeviceTaxonomyTechnology(input: DeviceTechnologyReference): Promise<DeviceTechnologyReference> {
  return readJson<DeviceTechnologyReference>(await fetch("/api/v1/device-registry/taxonomy/technologies", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
  }));
}

export async function updateDeviceTaxonomyTechnology(code: string, input: Partial<Omit<DeviceTechnologyReference, "code">>): Promise<DeviceTechnologyReference> {
  return readJson<DeviceTechnologyReference>(await fetch(`/api/v1/device-registry/taxonomy/technologies/${encodeURIComponent(code)}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
  }));
}

export async function deleteDeviceTaxonomyTechnology(code: string): Promise<void> {
  const response = await fetch(`/api/v1/device-registry/taxonomy/technologies/${encodeURIComponent(code)}`, { method: "DELETE" });
  if (!response.ok) await readJson<unknown>(response);
}

export async function getDeviceTypeReferences(): Promise<DeviceTypeReference[]> {
  return readJson<DeviceTypeReference[]>(await fetch("/api/v1/device-registry/reference/device-types"));
}

export async function getDeviceTechnologyReferences(): Promise<DeviceTechnologyReference[]> {
  return readJson<DeviceTechnologyReference[]>(await fetch("/api/v1/device-registry/reference/technologies"));
}

export async function getDeviceIdentityLabelReferences(): Promise<DeviceIdentityLabelReference[]> {
  return readJson<DeviceIdentityLabelReference[]>(await fetch("/api/v1/device-registry/reference/identity-labels"));
}

export async function getDeviceRegistryDevices(): Promise<DeviceRegistryDevice[]> {
  return readJson<DeviceRegistryDevice[]>(await fetch("/api/v1/device-registry/devices"));
}

export async function createDeviceRegistryDevice(
  input: CreateDeviceRegistryDeviceInput
): Promise<DeviceRegistryDevice> {
  return readJson<DeviceRegistryDevice>(await fetch("/api/v1/device-registry/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}

export async function updateDeviceRegistryDevice(
  id: string,
  input: UpdateDeviceRegistryDeviceInput
): Promise<DeviceRegistryDevice> {
  return readJson<DeviceRegistryDevice>(await fetch(`/api/v1/device-registry/devices/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}

export async function deleteDeviceRegistryDevice(id: string): Promise<void> {
  const response = await fetch(`/api/v1/device-registry/devices/${id}`, { method: "DELETE" });
  if (!response.ok) await readJson<unknown>(response);
}

export async function getDeviceHealthProfiles(): Promise<DeviceHealthProfile[]> {
  return readJson<DeviceHealthProfile[]>(await fetch("/api/v1/device-registry/health-profiles"));
}

export async function createDeviceHealthProfile(
  input: CreateDeviceHealthProfileInput
): Promise<DeviceHealthProfile> {
  return readJson<DeviceHealthProfile>(await fetch("/api/v1/device-registry/health-profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}

export async function updateDeviceHealthProfile(
  id: string,
  input: UpdateDeviceHealthProfileInput
): Promise<DeviceHealthProfile> {
  return readJson<DeviceHealthProfile>(await fetch(`/api/v1/device-registry/health-profiles/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}

export async function deleteDeviceHealthProfile(id: string): Promise<void> {
  const response = await fetch(`/api/v1/device-registry/health-profiles/${id}`, { method: "DELETE" });
  if (!response.ok) await readJson<unknown>(response);
}


export async function getServiceClassReferences(): Promise<ServiceClassReference[]> {
  return readJson<ServiceClassReference[]>(await fetch("/api/v1/service-registry/reference/service-classes"));
}
export async function getServiceTypeReferences(): Promise<ServiceTypeReference[]> {
  return readJson<ServiceTypeReference[]>(await fetch("/api/v1/service-registry/reference/service-types"));
}
export async function getServiceTaxonomyClasses(): Promise<ServiceClassReference[]> {
  return readJson<ServiceClassReference[]>(await fetch("/api/v1/service-registry/taxonomy/classes"));
}
export async function getServiceTaxonomyTypes(): Promise<ServiceTypeReference[]> {
  return readJson<ServiceTypeReference[]>(await fetch("/api/v1/service-registry/taxonomy/types"));
}
export async function createServiceTaxonomyClass(input: ServiceClassReference): Promise<ServiceClassReference> {
  return readJson<ServiceClassReference>(await fetch("/api/v1/service-registry/taxonomy/classes", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(input) }));
}
export async function updateServiceTaxonomyClass(code:string,input:Partial<Omit<ServiceClassReference,"code">>):Promise<ServiceClassReference>{
  return readJson<ServiceClassReference>(await fetch(`/api/v1/service-registry/taxonomy/classes/${encodeURIComponent(code)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)}));
}
export async function deleteServiceTaxonomyClass(code:string):Promise<void>{ const r=await fetch(`/api/v1/service-registry/taxonomy/classes/${encodeURIComponent(code)}`,{method:"DELETE"}); if(!r.ok) await readJson<unknown>(r); }
export async function createServiceTaxonomyType(input: ServiceTypeReference): Promise<ServiceTypeReference> {
  return readJson<ServiceTypeReference>(await fetch("/api/v1/service-registry/taxonomy/types", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(input) }));
}
export async function updateServiceTaxonomyType(code:string,input:Partial<Omit<ServiceTypeReference,"code">>):Promise<ServiceTypeReference>{
  return readJson<ServiceTypeReference>(await fetch(`/api/v1/service-registry/taxonomy/types/${encodeURIComponent(code)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)}));
}
export async function deleteServiceTaxonomyType(code:string):Promise<void>{ const r=await fetch(`/api/v1/service-registry/taxonomy/types/${encodeURIComponent(code)}`,{method:"DELETE"}); if(!r.ok) await readJson<unknown>(r); }
export async function getServiceRegistryServices():Promise<ServiceRegistryService[]>{ return readJson<ServiceRegistryService[]>(await fetch("/api/v1/service-registry/services")); }
export async function createServiceRegistryService(input:CreateServiceRegistryServiceInput):Promise<ServiceRegistryService>{ return readJson<ServiceRegistryService>(await fetch("/api/v1/service-registry/services",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)})); }
export async function updateServiceRegistryService(id:string,input:UpdateServiceRegistryServiceInput):Promise<ServiceRegistryService>{ return readJson<ServiceRegistryService>(await fetch(`/api/v1/service-registry/services/${id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)})); }
export async function deleteServiceRegistryService(id:string):Promise<void>{ const r=await fetch(`/api/v1/service-registry/services/${id}`,{method:"DELETE"}); if(!r.ok) await readJson<unknown>(r); }


export async function getDeviceAgents(): Promise<DeviceAgent[]> {
  return readJson<DeviceAgent[]>(await fetch("/api/v1/device-control/agents"));
}

export async function createDeviceAgent(input: CreateDeviceAgentInput): Promise<DeviceAgentTokenResponse> {
  return readJson<DeviceAgentTokenResponse>(await fetch("/api/v1/device-control/agents", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
  }));
}

export async function updateDeviceAgent(id: string, input: UpdateDeviceAgentInput): Promise<DeviceAgent> {
  return readJson<DeviceAgent>(await fetch(`/api/v1/device-control/agents/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
  }));
}

export async function regenerateDeviceAgentToken(id: string): Promise<DeviceAgentTokenResponse> {
  return readJson<DeviceAgentTokenResponse>(await fetch(`/api/v1/device-control/agents/${id}/regenerate-token`, { method: "POST" }));
}

export async function requestDeviceAgentUpdate(id: string, version: string): Promise<DeviceAgent> {
  return readJson<DeviceAgent>(await fetch(`/api/v1/device-control/agents/${id}/update`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ version })
  }));
}

export async function requestSupervisorAgentUpdate(id: string, version: string): Promise<DeviceAgent> {
  return readJson<DeviceAgent>(await fetch(`/api/v1/device-control/agents/${id}/supervisor/update`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ version })
  }));
}

export async function startManagedAgentOperation(id: string, input: ManagedAgentOperationInput): Promise<ManagedAgentOperation> {
  return readJson<ManagedAgentOperation>(await fetch(`/api/v1/device-control/agents/${id}/managed-agents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  }));
}

export async function getManagedAgentOperation(commandId: string): Promise<ManagedAgentOperation> {
  return readJson<ManagedAgentOperation>(await fetch(`/api/v1/device-control/managed-agents/${commandId}`));
}

export async function runManagedAgentOperation(id: string, input: ManagedAgentOperationInput): Promise<ManagedAgentOperation> {
  let operation = await startManagedAgentOperation(id, input);
  const deadline = Date.now() + 615000;
  while (operation.status === "SENT" && Date.now() < deadline) {
    await new Promise(resolve => window.setTimeout(resolve, 400));
    operation = await getManagedAgentOperation(operation.commandId);
  }
  if (operation.status === "SENT") throw new Error("Managed Agent operation did not finish before the client timeout");
  if (operation.status !== "SUCCESS") throw new Error(operation.error ?? `Managed Agent operation ${operation.status.toLowerCase()}`);
  return operation;
}

async function waitSupervisorTokenCheck(startUrl: string): Promise<AgentTokenCheckResult> {
  let operation = await readJson<ManagedAgentOperation>(await fetch(startUrl, { method: "POST" }));
  const deadline = Date.now() + 35_000;
  while (operation.status === "SENT" && Date.now() < deadline) {
    await new Promise(resolve => window.setTimeout(resolve, 400));
    operation = await readJson<ManagedAgentOperation>(await fetch(`/api/v1/device-control/supervisor-managed-agents/${operation.commandId}`));
  }
  if (operation.status === "SENT") throw new Error("Token check did not finish before the client timeout");
  if (operation.status !== "SUCCESS") throw new Error(operation.error ?? `Token check ${operation.status.toLowerCase()}`);
  return (operation.result ?? {}) as AgentTokenCheckResult;
}


export async function deleteSupervisorManagedAgentAssignment(assignmentId: string): Promise<void> {
  const response = await fetch(`/api/v1/device-control/supervisor-managed-agent-assignments/${assignmentId}`, { method: "DELETE" });
  if (!response.ok) await readJson<unknown>(response);
}

export async function runSupervisorManagedAgentOperation(
  supervisorId: string,
  input: ManagedAgentOperationInput & { agentId?: string; installDir?: string },
  onProgress?: (operation: ManagedAgentOperation) => void
): Promise<ManagedAgentOperation> {
  let operation = await readJson<ManagedAgentOperation>(await fetch(`/api/v1/device-control/supervisors/${supervisorId}/managed-agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
  onProgress?.(operation);
  const deadline = Date.now() + 615000;
  while (operation.status === "SENT" && Date.now() < deadline) {
    await new Promise(resolve => window.setTimeout(resolve, 400));
    operation = await readJson<ManagedAgentOperation>(await fetch(`/api/v1/device-control/supervisor-managed-agents/${operation.commandId}`));
    onProgress?.(operation);
  }
  if (operation.status === "SENT") throw new Error("Supervisor managed-agent operation did not finish before the client timeout");
  if (operation.status !== "SUCCESS") throw new Error(operation.error ?? `Supervisor managed-agent operation ${operation.status.toLowerCase()}`);
  return operation;
}

export interface ProxmoxEndpointConfigDto {
  id: string; product: "PVE" | "PBS"; url: string; tokenId: string; tokenSecret?: string; tokenSecretConfigured?: boolean; originalId?: string; verifyTls: boolean;
}
export interface ProxmoxConfigDto { configured: boolean; endpoints: ProxmoxEndpointConfigDto[]; config_path?: string; }

async function waitSupervisorConfigOperation(response: Response): Promise<ProxmoxConfigDto> {
  let operation = await readJson<ManagedAgentOperation>(response);
  const deadline = Date.now() + 65_000;
  while (operation.status === "SENT" && Date.now() < deadline) {
    await new Promise(resolve => window.setTimeout(resolve, 400));
    operation = await readJson<ManagedAgentOperation>(await fetch(`/api/v1/device-control/supervisor-managed-agents/${operation.commandId}`));
  }
  if (operation.status === "SENT") throw new Error("Proxmox configuration operation did not finish before the client timeout");
  if (operation.status !== "SUCCESS") throw new Error(operation.error ?? `Proxmox configuration operation ${operation.status.toLowerCase()}`);
  return (operation.result ?? { configured: false, endpoints: [] }) as ProxmoxConfigDto;
}

export async function getDeviceAgentProxmoxConfig(id: string): Promise<ProxmoxConfigDto> {
  return waitSupervisorConfigOperation(await fetch(`/api/v1/device-control/agents/${id}/proxmox-config`));
}
export async function saveDeviceAgentProxmoxConfig(id: string, endpoints: ProxmoxEndpointConfigDto[]): Promise<ProxmoxConfigDto> {
  return waitSupervisorConfigOperation(await fetch(`/api/v1/device-control/agents/${id}/proxmox-config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoints }) }));
}
export async function deleteDeviceAgentProxmoxConfig(id: string): Promise<ProxmoxConfigDto> {
  return waitSupervisorConfigOperation(await fetch(`/api/v1/device-control/agents/${id}/proxmox-config`, { method: "DELETE" }));
}

export async function checkDeviceAgentToken(id: string): Promise<AgentTokenCheckResult> {
  return waitSupervisorTokenCheck(`/api/v1/device-control/agents/${id}/check-token`);
}

export async function checkMonitoringAgentToken(id: string): Promise<AgentTokenCheckResult> {
  return waitSupervisorTokenCheck(`/api/v1/device-control/monitoring-agents/${id}/check-token`);
}

export async function deleteDeviceAgent(id: string): Promise<void> {
  const response = await fetch(`/api/v1/device-control/agents/${id}`, { method: "DELETE" });
  if (!response.ok) await readJson<unknown>(response);
}

export async function startDeviceDiscovery(
  agentId: string,
  provider: string,
  timeoutSeconds = 4
): Promise<DeviceDiscovery> {
  return readJson<DeviceDiscovery>(await fetch(`/api/v1/device-control/agents/${agentId}/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, timeoutSeconds })
  }));
}

export async function getDeviceDiscovery(id: string): Promise<DeviceDiscovery> {
  return readJson<DeviceDiscovery>(await fetch(`/api/v1/device-control/discoveries/${id}`));
}

export async function getDeviceDiscoveries(): Promise<DeviceDiscovery[]> {
  return readJson<DeviceDiscovery[]>(await fetch("/api/v1/device-control/discoveries"));
}

export async function getDiscardedDeviceDiscoveries(): Promise<DiscardedDeviceDiscovery[]> {
  return readJson<DiscardedDeviceDiscovery[]>(await fetch("/api/v1/device-control/discovery-discarded"));
}

export async function setDeviceDiscoveryDiscarded(input: { provider: string; identityKey: string; label?: string | null; discarded: boolean }): Promise<void> {
  const response = await fetch("/api/v1/device-control/discovery-discarded", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) await readJson<unknown>(response);
}

export async function startDiscoveredDeviceAction(
  agentId: string,
  provider: string,
  action: string,
  target: Record<string, unknown>,
  parameters: Record<string, unknown> = {},
  timeoutSeconds = 10
): Promise<DiscoveredDeviceAction> {
  return readJson<DiscoveredDeviceAction>(await fetch(`/api/v1/device-control/agents/${agentId}/discovered-actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, action, target, parameters, timeoutSeconds })
  }));
}

export async function getDiscoveredDeviceAction(id: string): Promise<DiscoveredDeviceAction> {
  return readJson<DiscoveredDeviceAction>(await fetch(`/api/v1/device-control/discovered-actions/${id}`));
}

export async function createDeviceControlCommand(
  deviceId: string,
  action: string,
  parameters: Record<string, unknown> = {},
  ttlSeconds = 30
): Promise<DeviceControlCommand> {
  return readJson<DeviceControlCommand>(await fetch("/api/v1/device-control/commands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, action, parameters, ttlSeconds })
  }));
}

export async function getDeviceControlCommand(id: string): Promise<DeviceControlCommand> {
  return readJson<DeviceControlCommand>(await fetch(`/api/v1/device-control/commands/${id}`));
}

export async function getDeviceControlState(id: string): Promise<DeviceControlState | null> {
  return readJson<DeviceControlState | null>(await fetch(`/api/v1/device-control/devices/${id}/state`));
}

export async function getDeviceControlEntities(id: string): Promise<DeviceControlEntitiesState | null> {
  return readJson<DeviceControlEntitiesState | null>(await fetch(`/api/v1/device-control/devices/${id}/entities`));
}

export async function getRealtimeEntities(): Promise<RealtimeEntityRecord[]> {
  return readJson<RealtimeEntityRecord[]>(await fetch("/api/v1/device-control/entities"));
}

export async function getMonitoringAgents(): Promise<MonitoringAgent[]> {
  return readJson<MonitoringAgent[]>(await fetch("/api/v1/monitoring/agents"));
}

export async function getMonitoringSlots(): Promise<MonitoringSlot[]> {
  return readJson<MonitoringSlot[]>(await fetch("/api/v1/monitoring/slots"));
}

export async function createMonitoringSlot(input: {
  name: string;
  description?: string | null;
  enabled?: boolean;
  agentId?: string | null;
}): Promise<MonitoringSlot> {
  return readJson<MonitoringSlot>(await fetch("/api/v1/monitoring/slots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}

export async function updateMonitoringSlot(id: string, input: {
  name?: string;
  description?: string | null;
  enabled?: boolean;
  agentId?: string | null;
}): Promise<MonitoringSlot> {
  return readJson<MonitoringSlot>(await fetch(`/api/v1/monitoring/slots/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}

export async function deleteMonitoringSlot(id: string): Promise<void> {
  const response = await fetch(`/api/v1/monitoring/slots/${id}`, { method: "DELETE" });
  if (!response.ok) await readJson<unknown>(response);
}

export async function bulkAssignMonitoringSlots(input: {
  checkIds: string[];
  mode: "ADD" | "REMOVE" | "REPLACE";
  slotIds: string[];
}): Promise<{ updatedChecks: number }> {
  return readJson<{ updatedChecks: number }>(await fetch("/api/v1/monitoring/checks/bulk-slots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}

export async function createMonitoringAgent(input: CreateMonitoringAgentInput): Promise<MonitoringAgentTokenResponse> {
  return readJson<MonitoringAgentTokenResponse>(await fetch("/api/v1/monitoring/agents", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
  }));
}

export async function updateMonitoringAgent(id: string, input: UpdateMonitoringAgentInput): Promise<MonitoringAgent> {
  return readJson<MonitoringAgent>(await fetch(`/api/v1/monitoring/agents/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
  }));
}

export async function regenerateMonitoringAgentToken(id: string): Promise<MonitoringAgentTokenResponse> {
  return readJson<MonitoringAgentTokenResponse>(await fetch(`/api/v1/monitoring/agents/${id}/regenerate-token`, { method: "POST" }));
}

export async function deleteMonitoringAgent(id: string): Promise<void> {
  const response = await fetch(`/api/v1/monitoring/agents/${id}`, { method: "DELETE" });
  if (!response.ok) await readJson<unknown>(response);
}

export async function getMonitoringChecks(): Promise<MonitoringCheck[]> {
  return readJson<MonitoringCheck[]>(await fetch("/api/v1/monitoring/checks"));
}

export async function createMonitoringCheck(input: CreateMonitoringCheckInput): Promise<MonitoringCheck> {
  return readJson<MonitoringCheck>(await fetch("/api/v1/monitoring/checks", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
  }));
}

export async function updateMonitoringCheck(id: string, input: UpdateMonitoringCheckInput): Promise<MonitoringCheck> {
  return readJson<MonitoringCheck>(await fetch(`/api/v1/monitoring/checks/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input)
  }));
}

export async function deleteMonitoringCheck(id: string): Promise<void> {
  const response = await fetch(`/api/v1/monitoring/checks/${id}`, { method: "DELETE" });
  if (!response.ok) await readJson<unknown>(response);
}
