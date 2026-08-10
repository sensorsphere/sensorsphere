import {
  describe,
  expect,
  it
} from "vitest";

import {
  ESPHomeParser
} from "./esphome-parser.js";

const parser =
  new ESPHomeParser();

describe(
  "ESPHomeParser",
  () => {

    it(
      "parses temperature",
      () => {

        const result =
          parser.parse({
            source: "mqtt",

            topic:
              "sensors/ble_gateway/sensor/temperature_d0_ca_52/state",

            payload:
              Buffer.from("26.4"),

            receivedAt:
              new Date()
          });

        expect(result).toHaveLength(1);

        expect(
          result[0]
        ).toMatchObject({
          sensorUid:
            "d0_ca_52",

          metric:
            "temperature",

          value:
            26.4
        });
      }
    );

    it(
      "parses battery voltage",
      () => {

        const result =
          parser.parse({
            source: "mqtt",

            topic:
              "sensors/ble_gateway/sensor/battery_voltage_c8_ac_73/state",

            payload:
              Buffer.from("2.930"),

            receivedAt:
              new Date()
          });

        expect(
          result[0]
        ).toMatchObject({
          sensorUid:
            "c8_ac_73",

          metric:
            "voltage",

          value:
            2.93
        });
      }
    );

    it(
      "ignores invalid metrics",
      () => {

        const result =
          parser.parse({
            source: "mqtt",

            topic:
              "sensors/ble_gateway/sensor/unknown_d0_ca_52/state",

            payload:
              Buffer.from("12"),

            receivedAt:
              new Date()
          });

        expect(
          result
        ).toEqual([]);
      }
    );
  }
);