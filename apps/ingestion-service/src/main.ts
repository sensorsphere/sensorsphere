import pino from "pino";

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

const logger =
  pino({
    level:
      process.env.LOG_LEVEL ??
      "info"
  });

async function main():
Promise<void> {

  logger.info(
    "Starting SensorSphere ingestion service"
  );

  const repository =
    new PostgresMeasurementRepository();

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
      logger
    );

  await collector.start(
    message => {

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