import type {
  MetricKey
} from "@sensorsphere/core";

import type {
  IncomingMessage
} from "../../domain/incoming-message.js";

import type {
  ParsedMeasurement
} from "../../domain/parsed-measurement.js";

import type {
  Parser
} from "../../domain/parser.js";

const mappings: Array<{
  prefix: string;
  metric: MetricKey;
}> = [
  {
    prefix: "battery_voltage_",
    metric: "voltage"
  },
  {
    prefix: "battery_level_",
    metric: "battery"
  },
  {
    prefix: "temperature_",
    metric: "temperature"
  },
  {
    prefix: "humidity_",
    metric: "humidity"
  },
  {
    prefix: "rssi_",
    metric: "rssi"
  }
];

export class ESPHomeParser implements Parser {

  readonly id = "esphome";

  canParse(
    message: IncomingMessage
  ): boolean {

    const parts =
      message.topic.split("/");

    return (
      parts.includes("sensor") &&
      parts.at(-1) === "state"
    );
  }

  parse(
    message: IncomingMessage
  ): ParsedMeasurement[] {

    const parts =
      message.topic.split("/");

    const sensorIndex =
      parts.indexOf("sensor");

    if (sensorIndex === -1) {
      return [];
    }

    const objectId =
      parts[sensorIndex + 1];

    if (!objectId) {
      return [];
    }

    const value =
      Number(
        message.payload
          .toString()
          .trim()
      );

    if (!Number.isFinite(value)) {
      return [];
    }

    const id =
      objectId.toLowerCase();

    for (const mapping of mappings) {

      if (
        !id.startsWith(
          mapping.prefix
        )
      ) {
        continue;
      }

      const sensorUid =
        id.substring(
          mapping.prefix.length
        );

      if (!sensorUid) {
        return [];
      }

      return [
        {
          sensorUid,
          metric: mapping.metric,
          value,

          source: message.source,
          sourceTopic: message.topic,
          receivedAt: message.receivedAt
        }
      ];
    }

    return [];
  }
}