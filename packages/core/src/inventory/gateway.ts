export type GatewayType =
  | "esphome"
  | "zigbee2mqtt"
  | "home-assistant"
  | "lorawan"
  | "other";

export interface Gateway {
  readonly id: string;

  readonly name: string;
  readonly type: GatewayType;

  readonly version: string | null;
  readonly ipAddress: string | null;

  readonly enabled: boolean;

  readonly lastSeenAt: Date | null;

  readonly createdAt: Date;
  readonly updatedAt: Date;
}
