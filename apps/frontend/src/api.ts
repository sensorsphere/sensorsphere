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
  SimpleDashboardSection
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

export async function updateSimpleDashboardCard(
  dashboardId: string,
  cardId: string,
  assetMetricId: string,
  sectionId: string | null = null
): Promise<SimpleDashboardCard> {
  return readJson<SimpleDashboardCard>(
    await fetch(
      `/api/v1/simple-dashboards/${encodeURIComponent(dashboardId)}/cards/${encodeURIComponent(cardId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetMetricId, sectionId })
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
