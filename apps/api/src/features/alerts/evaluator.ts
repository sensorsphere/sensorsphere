import type {
  AlertConditionType
} from "./dto.js";

export interface AlertEvaluationInput {
  conditionType:
    AlertConditionType;

  thresholdMin:
    number | null;

  thresholdMax:
    number | null;

  currentValue:
    number | null;

  ageSeconds:
    number | null;

  durationSeconds:
    number;
}

export interface AlertEvaluationResult {
  triggered: boolean;

  currentValue:
    number | null;

  triggerValue:
    number | null;

  reason: string;
}

function requireCurrentValue(
  value: number | null
): number {

  if (value === null) {
    throw new Error(
      "Alert condition requires a numeric current value"
    );
  }

  return value;
}

function requireThreshold(
  value: number | null,
  name: string
): number {

  if (value === null) {
    throw new Error(
      `Alert condition requires ${name}`
    );
  }

  return value;
}

export function evaluateAlertCondition(
  input: AlertEvaluationInput
): AlertEvaluationResult {

  const {
    conditionType,
    thresholdMin,
    thresholdMax,
    currentValue,
    ageSeconds,
    durationSeconds
  } = input;

  switch (conditionType) {

    case "ABOVE": {

      const value =
        requireCurrentValue(
          currentValue
        );

      const threshold =
        requireThreshold(
          thresholdMin,
          "thresholdMin"
        );

      return {
        triggered:
          value > threshold,

        currentValue:
          value,

        triggerValue:
          threshold,

        reason:
          `${value} is above ${threshold}`
      };
    }

    case "BELOW": {

      const value =
        requireCurrentValue(
          currentValue
        );

      const threshold =
        requireThreshold(
          thresholdMin,
          "thresholdMin"
        );

      return {
        triggered:
          value < threshold,

        currentValue:
          value,

        triggerValue:
          threshold,

        reason:
          `${value} is below ${threshold}`
      };
    }

    case "BETWEEN": {

      const value =
        requireCurrentValue(
          currentValue
        );

      const min =
        requireThreshold(
          thresholdMin,
          "thresholdMin"
        );

      const max =
        requireThreshold(
          thresholdMax,
          "thresholdMax"
        );

      return {
        triggered:
          value >= min &&
          value <= max,

        currentValue:
          value,

        triggerValue:
          null,

        reason:
          `${value} is between ${min} and ${max}`
      };
    }

    case "OUTSIDE": {

      const value =
        requireCurrentValue(
          currentValue
        );

      const min =
        requireThreshold(
          thresholdMin,
          "thresholdMin"
        );

      const max =
        requireThreshold(
          thresholdMax,
          "thresholdMax"
        );

      return {
        triggered:
          value < min ||
          value > max,

        currentValue:
          value,

        triggerValue:
          null,

        reason:
          `${value} is outside ${min} to ${max}`
      };
    }

    case "OFFLINE":
    case "NO_DATA": {

      const age =
        ageSeconds;

      const triggered =
        age === null ||
        age >= durationSeconds;

      return {
        triggered,

        currentValue:
          null,

        triggerValue:
          durationSeconds,

        reason:
          age === null
            ? "No data has ever been received"
            : `No data received for ${age} seconds`
      };
    }
  }
}
