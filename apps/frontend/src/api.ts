import type {
  Sensor,
  Measurement
} from "./types";

export async function getSensors(): Promise<Sensor[]> {
  const response =
    await fetch("/api/sensors");

  if (!response.ok) {
    throw new Error("Unable to load sensors");
  }

  return response.json();
}

export async function getLatestMeasurements():
Promise<Measurement[]> {

  const response =
    await fetch("/api/measurements/latest");

  if (!response.ok) {
    throw new Error(
      "Unable to load latest measurements"
    );
  }

  return response.json();
}

export async function getHistory(
  sensorUid: string,
  hours = 24
): Promise<Measurement[]> {

  const to = new Date();

  const from =
    new Date(
      to.getTime() -
      hours * 60 * 60 * 1000
    );

  const params =
    new URLSearchParams({
      sensor_uid: sensorUid,
      from: from.toISOString(),
      to: to.toISOString()
    });

  const response =
    await fetch(
      `/api/measurements/history?${params}`
    );

  if (!response.ok) {
    throw new Error(
      "Unable to load measurement history"
    );
  }

  return response.json();
}