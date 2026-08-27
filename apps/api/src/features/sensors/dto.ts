export interface CreateSensorDto {
  uid: string;
  gatewayId?: string | null;
  backupGatewayId?: string | null;
}

export interface SensorDto {
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

export interface UpdateSensorDto {
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
