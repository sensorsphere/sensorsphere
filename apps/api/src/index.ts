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


const instanceName =
  process.env.INSTANCE_NAME?.trim()
  || "SensorSphere";

app.get("/api/v1/config", async () => ({
  instanceName
}));

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

app.get("/api/v1/gateway-coverage", async (request, reply) => {
  const query = request.query as {
    hours?: string;
  };

  const requestedHours =
    Number(query.hours ?? "24");

  if (
    !Number.isFinite(requestedHours) ||
    requestedHours <= 0 ||
    requestedHours > 24 * 30
  ) {
    return reply.code(400).send({
      error: "invalid_hours"
    });
  }

  const [result, gatewayResult] =
    await Promise.all([
      pool.query(
        `
        WITH stats AS (
          SELECT
            gateway_id,
            sensor_uid,
            COUNT(*)::integer AS sample_count,
            AVG(rssi)::double precision AS avg_rssi,
            MIN(rssi)::double precision AS min_rssi,
            MAX(rssi)::double precision AS max_rssi,
            COALESCE(STDDEV_SAMP(rssi), 0)::double precision AS stddev_rssi,
            MIN(time) AS first_seen_at,
            MAX(time) AS last_seen_at
          FROM gateway_sensor_rssi_samples
          WHERE time >= NOW() - ($1 * INTERVAL '1 hour')
          GROUP BY gateway_id, sensor_uid
        ), ranked AS (
          SELECT
            stats.*,
            ROW_NUMBER() OVER (
              PARTITION BY sensor_uid
              ORDER BY avg_rssi DESC, sample_count DESC, gateway_id
            ) AS rank,
            LEAD(avg_rssi) OVER (
              PARTITION BY sensor_uid
              ORDER BY avg_rssi DESC, sample_count DESC, gateway_id
            ) AS second_avg_rssi
          FROM stats
        )
        SELECT
          gateway_id AS "gatewayId",
          sensor_uid AS "sensorUid",
          sample_count AS "sampleCount",
          avg_rssi AS "avgRssi",
          min_rssi AS "minRssi",
          max_rssi AS "maxRssi",
          stddev_rssi AS "stddevRssi",
          first_seen_at AS "firstSeenAt",
          last_seen_at AS "lastSeenAt",
          rank,
          CASE
            WHEN rank = 1 AND second_avg_rssi IS NOT NULL
              THEN avg_rssi - second_avg_rssi
            ELSE NULL
          END AS "leadDb"
        FROM ranked
        ORDER BY sensor_uid, rank, gateway_id
        `,
        [requestedHours]
      ),

      pool.query(
        `
        WITH sample_stats AS (
          SELECT
            gateway_id,
            COUNT(*)::integer AS sample_count,
            COUNT(DISTINCT sensor_uid)::integer AS sensor_count,
            MAX(time) AS last_rssi_at
          FROM gateway_sensor_rssi_samples
          GROUP BY gateway_id
        )
        SELECT
          gateway.gateway_id AS "gatewayId",
          gateway.board_id AS "boardId",
          gateway.mac_address AS "macAddress",
          gateway.wifi_rssi AS "wifiRssi",
          gateway.wifi_rssi_seen_at AS "wifiRssiSeenAt",
          gateway.wifi_ssid AS "wifiSsid",
          gateway.build_date AS "buildDate",
          gateway.ip_address AS "ipAddress",
          COALESCE(
            stats.last_rssi_at,
            gateway.last_rssi_at
          ) AS "lastSeenAt",
          COALESCE(stats.sample_count, 0)::integer AS "sampleCount",
          COALESCE(stats.sensor_count, 0)::integer AS "sensorCount"
        FROM gateway_coverage_gateways gateway
        LEFT JOIN sample_stats stats
          ON stats.gateway_id = gateway.gateway_id
        ORDER BY gateway.gateway_id
        `
      )
    ]);

  return {
    hours: requestedHours,
    generatedAt: new Date().toISOString(),
    gateways: gatewayResult.rows,
    rows: result.rows
  };
});

app.delete("/api/v1/gateway-coverage", async (_request, reply) => {
  const result = await pool.query(
    `
    WITH deleted AS (
      DELETE FROM gateway_sensor_rssi_samples
      RETURNING 1
    ), reset_gateways AS (
      UPDATE gateway_coverage_gateways
      SET
        last_rssi_at = NULL,
        updated_at = now()
      RETURNING 1
    )
    SELECT COUNT(*)::integer AS count
    FROM deleted
    `
  );

  return reply.code(200).send({
    status: "reset",
    deletedSamples: result.rows[0]?.count ?? 0
  });
});

app.delete(
  "/api/v1/gateway-coverage/:gatewayId/samples",
  async (request, reply) => {
    const params = request.params as {
      gatewayId: string;
    };

    const gatewayId =
      params.gatewayId?.trim();

    if (!gatewayId) {
      return reply.code(400).send({
        error: "invalid_gateway_id"
      });
    }

    const result = await pool.query(
      `
      WITH deleted AS (
        DELETE FROM gateway_sensor_rssi_samples
        WHERE gateway_id = $1
        RETURNING 1
      ), reset_gateway AS (
        UPDATE gateway_coverage_gateways
        SET
          last_rssi_at = NULL,
          updated_at = now()
        WHERE gateway_id = $1
        RETURNING gateway_id
      )
      SELECT
        (SELECT COUNT(*)::integer FROM deleted) AS deleted_samples,
        EXISTS(SELECT 1 FROM reset_gateway) AS gateway_exists
      `,
      [gatewayId]
    );

    if (!result.rows[0]?.gateway_exists) {
      return reply.code(404).send({
        error: "gateway_not_found"
      });
    }

    return reply.code(200).send({
      status: "reset",
      gatewayId,
      deletedSamples:
        result.rows[0]?.deleted_samples ?? 0
    });
  }
);

app.delete(
  "/api/v1/gateway-coverage/gateways",
  async (_request, reply) => {
    const result = await pool.query(
      `
      WITH deleted_samples AS (
        DELETE FROM gateway_sensor_rssi_samples
        RETURNING 1
      ), deleted_gateways AS (
        DELETE FROM gateway_coverage_gateways
        RETURNING gateway_id
      )
      SELECT
        (SELECT COUNT(*)::integer FROM deleted_samples) AS deleted_samples,
        (SELECT COUNT(*)::integer FROM deleted_gateways) AS deleted_gateways
      `
    );

    return reply.code(200).send({
      status: "deleted",
      deletedGateways:
        result.rows[0]?.deleted_gateways ?? 0,
      deletedSamples:
        result.rows[0]?.deleted_samples ?? 0
    });
  }
);

app.delete(
  "/api/v1/gateway-coverage/:gatewayId",
  async (request, reply) => {
    const params = request.params as {
      gatewayId: string;
    };

    const gatewayId =
      params.gatewayId?.trim();

    if (!gatewayId) {
      return reply.code(400).send({
        error: "invalid_gateway_id"
      });
    }

    const result = await pool.query(
      `
      WITH deleted_samples AS (
        DELETE FROM gateway_sensor_rssi_samples
        WHERE gateway_id = $1
        RETURNING 1
      ), deleted_gateway AS (
        DELETE FROM gateway_coverage_gateways
        WHERE gateway_id = $1
        RETURNING gateway_id
      )
      SELECT
        (SELECT COUNT(*)::integer FROM deleted_samples) AS deleted_samples,
        EXISTS(SELECT 1 FROM deleted_gateway) AS deleted_gateway
      `,
      [gatewayId]
    );

    if (!result.rows[0]?.deleted_gateway) {
      return reply.code(404).send({
        error: "gateway_not_found"
      });
    }

    return reply.code(200).send({
      status: "deleted",
      gatewayId,
      deletedSamples:
        result.rows[0]?.deleted_samples ?? 0
    });
  }
);

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

