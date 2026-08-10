export const METRIC_KEYS = [
  "temperature",
  "humidity",
  "battery",
  "voltage",
  "rssi"
] as const;

export type MetricKey =
  typeof METRIC_KEYS[number];

export type Metrics =
  Readonly<
    Partial<
      Record<MetricKey, number>
    >
  >;

export function isMetricKey(
  value: string
): value is MetricKey {
  return METRIC_KEYS.includes(
    value as MetricKey
  );
}