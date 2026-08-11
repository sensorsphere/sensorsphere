export interface Sensor {
  sensor_uid: string;
  name: string | null;
  mac_address: string | null;
  location: string | null;
  updated_at: string;
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