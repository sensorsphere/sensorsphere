export const DEFAULT_METRIC_COLORS: Record<string, string> = {
  temperature: "#40c057",
  humidity: "#228be6",
  rssi: "#ff8787",
  battery_level: "#fab005",
  battery_voltage: "#845ef7",
  battery: "#fab005",
  voltage: "#845ef7",
  pressure: "#15aabf",
  co2: "#fd7e14"
};

const FALLBACK_METRIC_COLORS = [
  "#12b886",
  "#4c6ef5",
  "#be4bdb",
  "#e64980",
  "#f76707",
  "#0ca678",
  "#1c7ed6",
  "#7048e8"
];

export function defaultMetricColor(metricKey: string): string {
  const normalized = metricKey.trim().toLowerCase();
  const configured = DEFAULT_METRIC_COLORS[normalized];
  if (configured) return configured;

  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash * 31 + normalized.charCodeAt(index)) >>> 0;
  }
  return FALLBACK_METRIC_COLORS[hash % FALLBACK_METRIC_COLORS.length]!;
}
