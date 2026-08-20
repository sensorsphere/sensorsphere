import {
    createLogger
} from "@sensorsphere/shared-logger";

import {
  loadIngestionConfig
} from "@sensorsphere/shared-config";

import {
  SensorCache
} from "./cache.js";

import {
  MqttCollector
} from "./collectors/mqtt/mqtt-collector.js";

import {
  ESPHomeParser
} from "./parsers/esphome/esphome-parser.js";

import {
  ParserRegistry
} from "./parsers/parser-registry.js";

import {
  PostgresMeasurementRepository
} from "./repositories/postgres/postgres-measurement-repository.js";

import {
  startScheduler
} from "./scheduler.js";

const config =
  loadIngestionConfig();

const logger = createLogger({

        service:
            "ingestion-service"

    });

async function main():
Promise<void> {

  logger.info(
    "Starting SensorSphere ingestion service"
  );

  const repository =
    new PostgresMeasurementRepository({
      host: config.DB_HOST,
      port: config.DB_PORT,
      database: config.DB_NAME,
      user: config.DB_USER,
      password: config.DB_PASSWORD
    });

  await repository
    .testConnection();

  logger.info(
    "Database connection established"
  );

  const cache =
    new SensorCache();

  const parserRegistry =
    new ParserRegistry([
      new ESPHomeParser()
    ]);

  const collector =
    new MqttCollector(
      logger,
      config.MQTT_URL,
      config.MQTT_TOPIC
    );

  await collector.start(
    message => {

      const coverageMatch =
        message.topic.match(
          /^sensors\/ble_gateway\/([^/]+)\/sensor\/rssi_([^/]+)\/state$/
        );

      const gatewayMetadataMatch =
        message.topic.match(
          /^sensors\/ble_gateway\/([^/]+)\/sensor\/(board_id|mac_address|wifi_rssi)\/state$/
        );

      if (gatewayMetadataMatch) {
        const gatewayId =
          gatewayMetadataMatch[1];

        const metric =
          gatewayMetadataMatch[2] as
            "board_id" | "mac_address" | "wifi_rssi";

        const value =
          message.payload
            .toString()
            .trim();

        if (gatewayId && value) {
          void repository
            .saveGatewayCoverageMetadata(
              gatewayId,
              metric,
              value,
              message.receivedAt
            )
            .catch(error => {
              logger.error(
                {
                  error,
                  gatewayId,
                  metric
                },
                "Unable to persist gateway coverage metadata"
              );
            });
        }

        return;
      }

      if (coverageMatch) {
        const gatewayId =
          coverageMatch[1];

        const sensorUid =
          coverageMatch[2]
            .toLowerCase();

        const rssi =
          Number(
            message.payload
              .toString()
              .trim()
          );

        if (
          gatewayId &&
          sensorUid &&
          Number.isFinite(rssi)
        ) {
          void repository
            .saveGatewayCoverageRssi(
              gatewayId,
              sensorUid,
              rssi,
              message.receivedAt,
              message.topic
            )
            .catch(error => {
              logger.error(
                {
                  error,
                  gatewayId,
                  sensorUid
                },
                "Unable to persist gateway coverage RSSI"
              );
            });
        }

        return;
      }

      const measurements =
        parserRegistry.parse(
          message
        );

      if (
        measurements.length === 0
      ) {

        logger.debug(
          {
            topic:
              message.topic
          },
          "Incoming message ignored"
        );

        return;
      }

      for (
        const measurement
        of measurements
      ) {

        cache.update(
          measurement.sensorUid,
          measurement.metric,
          measurement.value,
          measurement.receivedAt
        );

        logger.debug(
          {
            sensorUid:
              measurement.sensorUid,

            metric:
              measurement.metric,

            value:
              measurement.value
          },
          "Sensor cache updated"
        );
      }
    }
  );

  startScheduler(
    cache,
    repository,
    logger
  );
}

main()
  .catch(error => {

    logger.fatal(
      { error },
      "Ingestion service startup failed"
    );

    process.exit(1);
  });