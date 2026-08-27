export type AssetType = string;

export interface Asset {
  readonly id: string;
  readonly externalId: string;
  readonly name: string | null;
  readonly description: string | null;
  readonly manufacturer: string | null;
  readonly model: string | null;
  readonly firmwareVersion: string | null;
  readonly assetType: AssetType;
  readonly protocol: string | null;
  readonly enabled: boolean;
  readonly tags: readonly string[];
  readonly gatewayId: string | null;
  readonly roomId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
