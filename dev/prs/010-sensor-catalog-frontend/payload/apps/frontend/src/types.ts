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
  time: string;

  temperature: number | null;
  humidity: number | null;
  battery: number | null;
  voltage: number | null;
  rssi: number | null;
}
