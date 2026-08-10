import { z } from "zod";

const apiConfigSchema = z.object({
  PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(3000),

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

export type ApiConfig =
  z.infer<typeof apiConfigSchema>;

export function loadApiConfig(
  env: NodeJS.ProcessEnv = process.env
): ApiConfig {
  return apiConfigSchema.parse(env);
}
