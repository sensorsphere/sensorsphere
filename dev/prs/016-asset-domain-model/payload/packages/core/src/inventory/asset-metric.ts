export type MetricValueType =
  | "number"
  | "boolean"
  | "string";

export interface AssetMetric {
  readonly id: string;
  readonly assetId: string;
  readonly key: string;
  readonly displayName: string;
  readonly unit: string | null;
  readonly valueType: MetricValueType;
  readonly enabled: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
