import type {
  Measurement,
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

  const response =
    await fetch(
      "/api/v1/measurements/latest"
    );

  return readJson<Measurement[]>(
    response
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
