import Fastify from "fastify";

import {
  mkdir,
  readFile,
  rename,
  writeFile
} from "node:fs/promises";

import {
  dirname
} from "node:path";

import {
  registerTelemetryFeature
} from "./features/telemetry/index.js";

import {
  registerSensorFeature
} from "./features/sensors/index.js";

import {
  registerAssetFeature
} from "./features/assets/index.js";

import {
  registerLocationFeature
} from "./features/locations/index.js";

import {
  registerAlertFeature
} from "./features/alerts/index.js";


import {
  loadApiConfig
} from "@sensorsphere/shared-config";

import {
  createPool
} from "./db.js";

const config =
  loadApiConfig();

const pool =
  createPool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    database: config.DB_NAME,
    user: config.DB_USER,
    password: config.DB_PASSWORD
  });

const app = Fastify({
  logger: {
    level: config.LOG_LEVEL ?? "info"
  }
});

const healthHandler = async () => {
  await pool.query("SELECT 1");

  return {
    status: "ok"
  };
};

app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

app.get("/sensors", async () => {
  const result = await pool.query(
    `
    SELECT sensor_uid, name, mac_address, location, updated_at
    FROM sensors
    ORDER BY sensor_uid
    `
  );

  return result.rows;
});

app.get("/api/measurements/latest", async () => {
  const result = await pool.query(
    `
    SELECT DISTINCT ON (sensor_uid)
      sensor_uid,
      time,
      temperature,
      humidity,
      battery,
      voltage,
      rssi
    FROM measurements
    ORDER BY sensor_uid, time DESC
    `
  );

  return result.rows;
});

const historyConfigPath =
  process.env.HISTORY_CONFIG_PATH
  ?? "/app/data/history-config.json";

app.get("/api/v1/history-config", async (_request, reply) => {
  try {
    const raw =
      await readFile(
        historyConfigPath,
        "utf8"
      );

    return JSON.parse(raw);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return reply.code(404).send({
        error: "history_config_not_found"
      });
    }

    throw error;
  }
});

app.put("/api/v1/history-config", async (request, reply) => {
  const body = request.body as {
    version?: unknown;
    activeTabId?: unknown;
    refreshIntervalMs?: unknown;
    tabs?: unknown;
  } | null;

  if (
    !body ||
    body.version !== 1 ||
    typeof body.activeTabId !== "string" ||
    typeof body.refreshIntervalMs !== "number" ||
    !Array.isArray(body.tabs)
  ) {
    return reply.code(400).send({
      error: "invalid_history_config"
    });
  }

  await mkdir(
    dirname(historyConfigPath),
    { recursive: true }
  );

  const temporaryPath =
    `${historyConfigPath}.tmp`;

  await writeFile(
    temporaryPath,
    `${JSON.stringify(body, null, 2)}\n`,
    "utf8"
  );

  await rename(
    temporaryPath,
    historyConfigPath
  );

  return reply.code(204).send();
});

app.get("/api/measurements/history", async (request, reply) => {
  const query = request.query as {
    sensor_uid?: string;
    from?: string;
    to?: string;
  };

  if (!query.sensor_uid) {
    return reply.code(400).send({
      error: "sensor_uid is required"
    });
  }

  const from =
    query.from ??
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const to =
    query.to ??
    new Date().toISOString();

  const result = await pool.query(
    `
    SELECT
      time,
      sensor_uid,
      temperature,
      humidity,
      battery,
      voltage,
      rssi
    FROM measurements
    WHERE sensor_uid = $1
      AND time >= $2
      AND time <= $3
    ORDER BY time ASC
    `,
    [
      query.sensor_uid,
      from,
      to
    ]
  );

  return result.rows;
});


const port = Number(config.PORT ?? 3000);

await registerLocationFeature(
  app,
  {
    pool
  }
);

await registerAssetFeature(
  app,
  {
    pool
  }
);

await registerAlertFeature(
  app,
  {
    pool
  }
);

await registerSensorFeature(
  app,
  {
    pool
  }
);

await registerTelemetryFeature(
  app,
  {
    pool
  }
);

await app.listen({
  host: "0.0.0.0",
  port
});

