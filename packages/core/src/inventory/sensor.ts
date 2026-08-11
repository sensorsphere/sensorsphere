export interface Sensor {
  readonly id: string;
  readonly uid: string;

  readonly name: string | null;
  readonly description: string | null;

  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly firmwareVersion: string | null;

  readonly enabled: boolean;

  readonly gatewayId: string | null;
  readonly roomId: string | null;

  readonly createdAt: Date;
  readonly updatedAt: Date;
}
