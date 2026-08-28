export interface GatewayTypeDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  color: string;
}

export interface CreateGatewayTypeDto {
  key: string;
  name: string;
  description?: string | null;
  color: string;
}

export interface UpdateGatewayTypeDto {
  key?: string;
  name?: string;
  description?: string | null;
  color?: string;
}

export interface GatewayDto {
  id: string;
  gatewayId: string;
  name: string;
  nameManuallySet: boolean;
  type: GatewayTypeDto;
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

export interface CreateGatewayDto {
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
}

export interface UpdateGatewayDto {
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
