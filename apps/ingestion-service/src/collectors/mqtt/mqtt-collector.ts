import mqtt, {
  type MqttClient
} from "mqtt";

import type {
  Logger
} from "pino";

import type {
  Collector,
  MessageHandler
} from "../../domain/collector.js";

export class MqttCollector
implements Collector {

  readonly id = "mqtt";

  private client?: MqttClient;

  constructor(
    private readonly logger: Logger
  ) {}

  async start(
    handler: MessageHandler
  ): Promise<void> {

    const url =
      process.env.MQTT_URL ??
      "mqtt://mosquitto:1883";

    const topic =
      process.env.MQTT_TOPIC ??
      "sensors/#";

    this.client =
      mqtt.connect(
        url,
        {
          reconnectPeriod: 5000,
          connectTimeout: 10000
        }
      );

    this.client.on(
      "connect",
      () => {

        this.logger.info(
          { url },
          "MQTT collector connected"
        );

        this.client?.subscribe(
          topic,
          error => {

            if (error) {
              this.logger.error(
                { error },
                "MQTT subscription failed"
              );

              return;
            }

            this.logger.info(
              { topic },
              "MQTT subscription active"
            );
          }
        );
      }
    );

    this.client.on(
      "message",
      (mqttTopic, payload) => {

        void handler({
          source: "mqtt",
          topic: mqttTopic,
          payload,
          receivedAt: new Date()
        });
      }
    );

    this.client.on(
      "error",
      error => {

        this.logger.error(
          { error },
          "MQTT collector error"
        );
      }
    );
  }

  async stop(): Promise<void> {

    if (!this.client) {
      return;
    }

    await new Promise<void>(
      resolve => {
        this.client?.end(
          false,
          {},
          () => resolve()
        );
      }
    );
  }
}