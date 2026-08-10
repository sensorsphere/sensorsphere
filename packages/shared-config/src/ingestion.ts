import { z } from "zod";

const ingestionConfigSchema = z.object({
  MQTT_URL: z
    .string()
    .url()
    .default("mqtt://mosquitto:1883"),

  MQTT_TOPIC: z
    .string()
    .min(1)
    .default("sensors/#"),

  DB_HOST: z
    .string()
    .min(1)
    .default("timescaledb"),

  DB_PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(5432),

  DB_NAME: z
    .string()
    .min(1)
    .default("iot"),

  DB_USER: z
    .string()
    .min(1)
    .default("iot_app"),

  DB_PASSWORD: z
    .string()
    .min(1),

  LOG_LEVEL: z
    .enum([
      "fatal",
      "error",
      "warn",
      "info",
      "debug",
      "trace",
      "silent"
    ])
    .default("info")
});

export type IngestionConfig =
  z.infer<typeof ingestionConfigSchema>;

export function loadIngestionConfig(
  env: NodeJS.ProcessEnv = process.env
): IngestionConfig {
  return ingestionConfigSchema.parse(env);
}
