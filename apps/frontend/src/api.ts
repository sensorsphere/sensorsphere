import type {
  Asset,
  LatestObservation,
  CreateLocationInput,
  Location,
  Measurement,
  MoveLocationInput,
  UpdateLocationInput,
  ObservationAggregatePoint,
  ObservationHistoryPoint,
  RuntimeConfig,
  Sensor,
  UpdateSensor
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
