export interface GatewayDto {
  id: string;
  name: string;
  type: string;
  version: string | null;
  ipAddress: string | null;
  enabled: boolean;
  lastSeenAt: string | null;
  sensorCount: number;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGatewayDto {
  name: string;
  type: string;
  version?: string | null;
  ipAddress?: string | null;
  enabled?: boolean;
}

export interface UpdateGatewayDto {
  name?: string;
  type?: string;
  version?: string | null;
  ipAddress?: string | null;
  enabled?: boolean;
}
