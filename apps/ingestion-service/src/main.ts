import { readFile } from "node:fs/promises";

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

const configuredMetricRoutingMode =
  (process.env.METRIC_ROUTING_MODE ?? "dry_run")
    .trim()
    .toLowerCase();

const metricRoutingMode:
  "legacy" | "dry_run" | "active" =
    configuredMetricRoutingMode === "legacy" ||
    configuredMetricRoutingMode === "active" ||
    configuredMetricRoutingMode === "dry_run"
      ? configuredMetricRoutingMode
      : "dry_run";

const METRIC_ROUTING_DEDUP_WINDOW_MS = 5_000;
const PRIMARY_GATEWAY_FAILOVER_AFTER_MS = 2 * 60 * 1000;

interface DedupEntry {
  gatewayId: string;
  receivedAtMs: number;
}

const metricRoutingDedup =
  new Map<string, DedupEntry>();

type SensorMetadataMetric =
  | "manufacturer"
  | "model"
  | "firmware";

function parseSensorMetadataObjectId(
  objectId: string | null
): {
  metric: SensorMetadataMetric;
  sensorUid: string;
} | null {
  if (!objectId) {
    return null;
  }

  const prefixes: Array<{
    prefix: string;
    metric: SensorMetadataMetric;
  }> = [
    { prefix: "manufacturer_", metric: "manufacturer" },
    { prefix: "firmware_", metric: "firmware" },
    { prefix: "model_", metric: "model" }
  ];

  const normalized = objectId.toLowerCase();

  for (const entry of prefixes) {
    if (!normalized.startsWith(entry.prefix)) {
      continue;
    }

    const sensorUid = normalized.substring(entry.prefix.length);

    if (!sensorUid) {
      return null;
    }

    return {
      metric: entry.metric,
      sensorUid
    };
  }

  return null;
}

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

  try {
    const buildDate = (
      await readFile(
        "/app/apps/ingestion-service/build-date.txt",
        "utf8"
      )
    ).trim();

    if (buildDate) {
      await repository.reportComponentBuild(
        "ingestion-service",
        buildDate
      );
    }
  } catch (error) {
    logger.warn(
      { error },
      "Unable to report ingestion build information"
    );
  }

  const purgedGatewayTraffic =
    await repository.purgeGatewayTrafficEvents(48);

  logger.info(
    {
      purgedGatewayTraffic,
      retentionHours: 48
    },
    "Gateway traffic monitor initialized"
  );

  const gatewayTrafficRetentionTimer =
    setInterval(
      () => {
        void repository
          .purgeGatewayTrafficEvents(48)
          .catch(error => {
            logger.error(
              { error },
              "Unable to purge gateway traffic events"
            );
          });
      },
      60 * 60 * 1000
    );

  gatewayTrafficRetentionTimer.unref();

  await repository.setMetricRoutingMode(
    metricRoutingMode
  );

  if (metricRoutingMode !== "legacy") {
    const purged =
      await repository.purgeMetricRoutingEvents(48);

    logger.info(
      {
        metricRoutingMode,
        purgedRoutingEvents: purged,
        retentionHours: 48,
        dedupWindowMs: METRIC_ROUTING_DEDUP_WINDOW_MS
      },
      "Metric routing initialized"
    );
    const retentionTimer =
      setInterval(
        () => {
          void repository
            .purgeMetricRoutingEvents(48)
            .catch(error => {
              logger.error(
                { error },
                "Unable to purge metric routing events"
              );
            });
        },
        60 * 60 * 1000
      );

  }

  const cache =
    new SensorCache();

  const esphomeParser =
    new ESPHomeParser();

  const parserRegistry =
    new ParserRegistry([
      esphomeParser
    ]);

  const collector =
    new MqttCollector(
      logger,
      config.MQTT_URL,
      config.MQTT_TOPIC
    );

  await collector.start(
    async message => {

      const gatewayTopicMatch =
        message.topic.match(
          /^sensors\/ble_gateway\/([^/]+)\/sensor\/([^/]+)\/state$/
        );

      const trafficGatewayId =
        gatewayTopicMatch?.[1] ?? null;
      const trafficObjectId =
        gatewayTopicMatch?.[2] ?? null;

      const metadataMetrics =
        new Set([
          "friendly_name",
          "board_id",
          "mac_address",
          "wifi_rssi",
          "wifi_ssid",
          "build_date",
          "ip_address"
        ]);

      const sensorMetadata =
        parseSensorMetadataObjectId(
          trafficObjectId
        );

      const gatewayTrafficMeasurements =
        gatewayTopicMatch &&
        trafficObjectId &&
        !metadataMetrics.has(trafficObjectId) &&
        !sensorMetadata
          ? esphomeParser.parse(message)
          : [];

      const trafficMeasurement =
        gatewayTrafficMeasurements[0];

      const trafficMessageType:
        "METADATA" | "SENSOR" | "UNKNOWN" =
          trafficObjectId && metadataMetrics.has(trafficObjectId)
            ? "METADATA"
            : sensorMetadata || trafficMeasurement
              ? "SENSOR"
              : "UNKNOWN";

      if (gatewayTopicMatch) {
        void repository
          .saveGatewayTrafficEvent({
            occurredAt: message.receivedAt,
            gatewayId: trafficGatewayId,
            messageType: trafficMessageType,
            sensorUid:
              sensorMetadata?.sensorUid
              ?? trafficMeasurement?.sensorUid
              ?? null,
            metric:
              trafficMessageType === "METADATA"
                ? trafficObjectId
                : sensorMetadata?.metric
                  ?? trafficMeasurement?.metric
                  ?? null,
            payload: message.payload.toString(),
            sourceTopic: message.topic
          })
          .catch(error => {
            logger.error(
              {
                error,
                topic: message.topic
              },
              "Unable to persist gateway traffic event"
            );
          });


        const gatewayId =
          gatewayTopicMatch[1];

        const objectId =
          gatewayTopicMatch[2];

        if (
          gatewayId &&
          objectId &&
          metadataMetrics.has(objectId)
        ) {
          const metric = objectId as
            | "friendly_name"
            | "board_id"
            | "mac_address"
            | "wifi_rssi"
            | "wifi_ssid"
            | "build_date"
            | "ip_address";

          const value =
            message.payload
              .toString()
              .trim();

          if (value) {
            void repository
              .saveGatewayMetadata(
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
                  "Unable to persist functional gateway metadata"
                );
              });

            if (metric !== "friendly_name") {
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
          }

          return;
        }

        if (gatewayId) {
          void repository
            .saveGatewayActivity(
              gatewayId,
              message.receivedAt
            )
            .catch(error => {
              logger.error(
                { error, gatewayId },
                "Unable to persist functional gateway activity"
              );
            });
        }

        if (trafficMeasurement) {
          try {
            await repository.ensureSensorExists(
              trafficMeasurement.sensorUid
            );
          } catch (error) {
            logger.error(
              {
                error,
                gatewayId,
                sensorUid: trafficMeasurement.sensorUid
              },
              "Unable to auto-discover functional sensor"
            );
          }
        }

        if (sensorMetadata) {
          const value =
            message.payload
              .toString()
              .trim();

          if (value) {
            void repository
              .saveSensorMetadata(
                sensorMetadata.sensorUid,
                sensorMetadata.metric,
                value
              )
              .catch(error => {
                logger.error(
                  {
                    error,
                    gatewayId,
                    sensorUid: sensorMetadata.sensorUid,
                    metric: sensorMetadata.metric
                  },
                  "Unable to persist sensor metadata"
                );
              });
          }

          return;
        }

        const coverageMatch =
          objectId?.match(/^rssi_(.+)$/);

        if (
          gatewayId &&
          coverageMatch
        ) {
          const sensorUid =
            coverageMatch[1]
              .toLowerCase();

          const rssi =
            Number(
              message.payload
                .toString()
                .trim()
            );

          if (
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
        }

        if (metricRoutingMode === "legacy") {
          return;
        }

        const qualifiedMeasurements =
          gatewayTrafficMeasurements;

        for (const measurement of qualifiedMeasurements) {
          const assignment =
            await repository.getSensorRoutingAssignment(
              measurement.sensorUid
            );

          let decision:
            "ACCEPT" | "IGNORE" | "DEDUPLICATE" =
              "ACCEPT";
          let reason = "unassigned_first_candidate";
          let dedupKey: string | null = null;
          let dedupAgeMs: number | null = null;

          if (assignment.assignedGatewayId) {
            if (assignment.assignedGatewayId === gatewayId) {
              reason = "assigned_primary";
            } else if (assignment.backupGatewayId === gatewayId) {
              const primaryAgeMs =
                assignment.primaryGatewayLastSeenAt
                  ? measurement.receivedAt.getTime() -
                    assignment.primaryGatewayLastSeenAt.getTime()
                  : Number.POSITIVE_INFINITY;

              if (primaryAgeMs >= PRIMARY_GATEWAY_FAILOVER_AFTER_MS) {
                reason = "backup_failover";
              } else {
                decision = "IGNORE";
                reason = "primary_healthy";
              }
            } else {
              decision = "IGNORE";
              reason = "not_assigned_gateway";
            }
          } else {
            dedupKey =
              measurement.metric === "rssi"
                ? `${measurement.sensorUid}|${measurement.metric}`
                : `${measurement.sensorUid}|${measurement.metric}|${measurement.value}`;

            const currentTime =
              measurement.receivedAt.getTime();
            const previous =
              metricRoutingDedup.get(dedupKey);

            if (
              previous &&
              previous.gatewayId !== gatewayId &&
              currentTime - previous.receivedAtMs <
                METRIC_ROUTING_DEDUP_WINDOW_MS
            ) {
              decision = "DEDUPLICATE";
              reason = "duplicate_candidate";
              dedupAgeMs =
                currentTime - previous.receivedAtMs;
            } else {
              metricRoutingDedup.set(
                dedupKey,
                {
                  gatewayId,
                  receivedAtMs: currentTime
                }
              );
            }
          }

          await repository.saveMetricRoutingEvent({
            occurredAt: measurement.receivedAt,
            gatewayId,
            sensorUid: measurement.sensorUid,
            sensorName: assignment.sensorName,
            metric: measurement.metric,
            value: measurement.value,
            decision,
            reason,
            assignedGatewayId:
              assignment.assignedGatewayId,
            backupGatewayId:
              assignment.backupGatewayId,
            primaryGatewayLastSeenAt:
              assignment.primaryGatewayLastSeenAt,
            mode: metricRoutingMode,
            sourceTopic: measurement.sourceTopic,
            dedupKey,
            dedupAgeMs
          });

          logger.debug(
            {
              metricRoutingMode,
              gatewayId,
              sensorUid: measurement.sensorUid,
              metric: measurement.metric,
              value: measurement.value,
              decision,
              reason,
              assignedGatewayId:
                assignment.assignedGatewayId,
              backupGatewayId:
                assignment.backupGatewayId,
              primaryGatewayLastSeenAt:
                assignment.primaryGatewayLastSeenAt?.toISOString() ?? null,
              dedupAgeMs
            },
            "Metric routing decision"
          );

          if (
            metricRoutingMode === "active" &&
            decision === "ACCEPT"
          ) {
            cache.update(
              measurement.sensorUid,
              measurement.metric,
              measurement.value,
              measurement.receivedAt
            );
          }
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