export type MetricQualityStatus =
  | "GOOD"
  | "WARNING"
  | "CRITICAL"
  | "UNKNOWN";

export type MetricQualityConfig =
  | {
      mode: "NONE";
    }
  | {
      mode: "HIGHER_IS_BETTER";
      warning: number;
      good: number;
    }
  | {
      mode: "LOWER_IS_BETTER";
      good: number;
      warning: number;
    }
  | {
      mode: "RANGE";
      criticalMin: number;
      warningMin: number;
      warningMax: number;
      criticalMax: number;
    };

export interface MetricQuality {
  status: MetricQualityStatus;
  config: MetricQualityConfig;
}

function finiteNumber(
  value: unknown
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  );
}

export function isMetricQualityConfig(
  value: unknown
): value is MetricQualityConfig {

  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const config =
    value as Record<string, unknown>;

  switch (config.mode) {
    case "NONE":
      return true;

    case "HIGHER_IS_BETTER":
      return (
        finiteNumber(config.warning) &&
        finiteNumber(config.good) &&
        config.warning < config.good
      );

    case "LOWER_IS_BETTER":
      return (
        finiteNumber(config.good) &&
        finiteNumber(config.warning) &&
        config.good < config.warning
      );

    case "RANGE":
      return (
        finiteNumber(config.criticalMin) &&
        finiteNumber(config.warningMin) &&
        finiteNumber(config.warningMax) &&
        finiteNumber(config.criticalMax) &&
        config.criticalMin < config.warningMin &&
        config.warningMin <= config.warningMax &&
        config.warningMax < config.criticalMax
      );

    default:
      return false;
  }
}

export function normalizeMetricQualityConfig(
  value: unknown
): MetricQualityConfig {

  return isMetricQualityConfig(value)
    ? value
    : { mode: "NONE" };
}

export function evaluateMetricQuality(
  value: unknown,
  configValue: unknown
): MetricQuality {

  const config =
    normalizeMetricQualityConfig(
      configValue
    );

  if (
    config.mode === "NONE" ||
    !finiteNumber(value)
  ) {
    return {
      status: "UNKNOWN",
      config
    };
  }

  switch (config.mode) {
    case "HIGHER_IS_BETTER":
      return {
        status:
          value >= config.good
            ? "GOOD"
            : value >= config.warning
              ? "WARNING"
              : "CRITICAL",
        config
      };

    case "LOWER_IS_BETTER":
      return {
        status:
          value <= config.good
            ? "GOOD"
            : value <= config.warning
              ? "WARNING"
              : "CRITICAL",
        config
      };

    case "RANGE":
      return {
        status:
          value < config.criticalMin ||
          value > config.criticalMax
            ? "CRITICAL"
            : value < config.warningMin ||
                value > config.warningMax
              ? "WARNING"
              : "GOOD",
        config
      };
  }
}
