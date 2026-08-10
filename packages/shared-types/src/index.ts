export type MeasurementMetric =
  | "temperature"
  | "humidity"
  | "battery"
  | "voltage"
  | "rssi";

export interface SensorState {
  sensorUid: string;
  temperature?: number;
  humidity?: number;
  battery?: number;
  voltage?: number;
  rssi?: number;
  lastUpdate: Date;
  dirty: boolean;
}

export interface Measurement {
  time: string;
  sensorUid: string;
  temperature: number | null;
  humidity: number | null;
  battery: number | null;
  voltage: number | null;
  rssi: number | null;
}
