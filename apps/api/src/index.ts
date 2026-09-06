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
  registerGatewayFeature
} from "./features/gateways/index.js";

import {
  registerMetricRoutingFeature
} from "./features/metric-routing/index.js";

import {
  registerProjectTodoFeature
} from "./features/project-todos/index.js";

import {
  registerSimpleDashboardFeature
} from "./features/simple-dashboards/index.js";

import {
  registerDeviceRegistryFeature
} from "./features/device-registry/index.js";

import {
  registerServiceRegistryFeature
} from "./features/service-registry/index.js";
import {
  registerMonitoringFeature
} from "./features/monitoring/index.js";


import {
  loadApiConfig
} from "@sensorsphere/shared-config";

import {
  createPool
} from "./db.js";

import {
  MODULE_CHANGELOG,
  MODULE_NAME,
  MODULE_VERSION
} from "./module_version.js";

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
    status: "ok",
    module: MODULE_NAME,
    version: MODULE_VERSION
  };
};

app.get("/health", healthHandler);
app.get("/api/health", healthHandler);


const instanceName =
  process.env.INSTANCE_NAME?.trim()
  || "SensorSphere";

const readBuildDate = async (
  path: string
): Promise<string | null> => {
  try {
    const value = (
      await readFile(path, "utf8")
    ).trim();

    return value || null;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
};

app.get("/api/v1/config", async () => {
  const [
    apiBuildDate,
    componentBuildResult
  ] = await Promise.all([
    readBuildDate(
      "/app/apps/api/build-date.txt"
    ),
    pool.query<{
      component: string;
      buildDate: Date;
    }>(
      `
      SELECT
        component,
        build_date AS "buildDate"
      FROM component_build_info
      WHERE component = 'ingestion-service'
      `
    )
  ]);

  const ingestionBuildDate =
    componentBuildResult.rows[0]?.buildDate
      ?.toISOString()
    ?? null;

  return {
    instanceName,
    builds: {
      api: apiBuildDate,
      ingestion: ingestionBuildDate
    }
  };
});


app.get("/api/v1/module-versions", async () => {
  const ingestionResult =
    await pool.query<{
      component: string;
      version: string | null;
      changelog: Record<string, unknown> | null;
    }>(
      `
      SELECT
        component,
        version,
        changelog
      FROM component_build_info
      WHERE component = 'ingestion-service'
      `
    );

  const ingestion =
    ingestionResult.rows[0];

  return [
    {
      module: MODULE_NAME,
      version: MODULE_VERSION,
      changelog: MODULE_CHANGELOG
    },
    {
      module: "ingestion-service",
      version: ingestion?.version ?? null,
      changelog: ingestion?.changelog ?? {}
    }
  ];
});

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

type GatewayDeviceObservationStatsRow = {
  gatewayId: string;
  deviceUid: string;
  sampleCount: number;
  avgRssi: number;
  minRssi: number;
  maxRssi: number;
  stddevRssi: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  rank: number;
  leadDb: number | null;
};

function parseObservationHours(
  hours: string | undefined
): number | null {
  const requestedHours = Number(hours ?? "24");

  return Number.isFinite(requestedHours) &&
    requestedHours > 0 &&
    requestedHours <= 24 * 30
    ? requestedHours
    : null;
}

async function getGatewayDeviceObservationStats(
  hours: number
): Promise<GatewayDeviceObservationStatsRow[]> {
  const result =
    await pool.query<GatewayDeviceObservationStatsRow>(
      `
      WITH stats AS (
        SELECT
          gateway_id,
          device_uid,
          COUNT(*)::integer AS sample_count,
          AVG(rssi)::double precision AS avg_rssi,
          MIN(rssi)::double precision AS min_rssi,
          MAX(rssi)::double precision AS max_rssi,
          COALESCE(STDDEV_SAMP(rssi), 0)::double precision AS stddev_rssi,
          MIN(time) AS first_seen_at,
          MAX(time) AS last_seen_at
        FROM gateway_device_ble_observations
        WHERE time >= NOW() - ($1 * INTERVAL '1 hour')
        GROUP BY gateway_id, device_uid
      ), ranked AS (
        SELECT
          stats.*,
          ROW_NUMBER() OVER (
            PARTITION BY device_uid
            ORDER BY avg_rssi DESC, sample_count DESC, gateway_id
          ) AS rank,
          LEAD(avg_rssi) OVER (
            PARTITION BY device_uid
            ORDER BY avg_rssi DESC, sample_count DESC, gateway_id
          ) AS second_avg_rssi
        FROM stats
      )
      SELECT
        gateway_id AS "gatewayId",
        device_uid AS "deviceUid",
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
      ORDER BY device_uid, rank, gateway_id
      `,
      [hours]
    );

  return result.rows;
}

app.get(
  "/api/v1/gateway-device-observations",
  async (request, reply) => {
    const query = request.query as {
      hours?: string;
    };
    const requestedHours =
      parseObservationHours(query.hours);

    if (requestedHours === null) {
      return reply.code(400).send({
        error: "invalid_hours"
      });
    }

    const rows =
      await getGatewayDeviceObservationStats(
        requestedHours
      );

    return {
      hours: requestedHours,
      generatedAt: new Date().toISOString(),
      rows
    };
  }
);

app.get("/api/v1/gateway-coverage", async (request, reply) => {
  const query = request.query as {
    hours?: string;
  };

  const requestedHours =
    parseObservationHours(query.hours);

  if (requestedHours === null) {
    return reply.code(400).send({
      error: "invalid_hours"
    });
  }

  const [observationRows, gatewayResult] =
    await Promise.all([
      getGatewayDeviceObservationStats(
        requestedHours
      ),

      pool.query(
        `
        WITH sample_stats AS (
          SELECT
            gateway_id,
            COUNT(*)::integer AS sample_count,
            COUNT(DISTINCT device_uid)::integer AS sensor_count,
            MAX(time) AS last_rssi_at
          FROM gateway_device_ble_observations
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
          host(gateway.ip_address::inet) AS "ipAddress",
          COALESCE(
            functional_gateway.location_id,
            gateway.location_id
          ) AS "locationId",
          location.name AS "locationName",
          COALESCE(
            stats.last_rssi_at,
            gateway.last_rssi_at
          ) AS "lastSeenAt",
          COALESCE(stats.sample_count, 0)::integer AS "sampleCount",
          COALESCE(stats.sensor_count, 0)::integer AS "sensorCount"
        FROM gateway_coverage_gateways gateway
        LEFT JOIN sample_stats stats
          ON stats.gateway_id = gateway.gateway_id
        LEFT JOIN gateways functional_gateway
          ON functional_gateway.gateway_id = gateway.gateway_id
        LEFT JOIN locations location
          ON location.id = COALESCE(
            functional_gateway.location_id,
            gateway.location_id
          )
        ORDER BY gateway.gateway_id
        `
      )
    ]);

  return {
    hours: requestedHours,
    generatedAt: new Date().toISOString(),
    gateways: gatewayResult.rows,
    rows: observationRows.map(row => ({
      gatewayId: row.gatewayId,
      sensorUid: row.deviceUid,
      sampleCount: row.sampleCount,
      avgRssi: row.avgRssi,
      minRssi: row.minRssi,
      maxRssi: row.maxRssi,
      stddevRssi: row.stddevRssi,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      rank: row.rank,
      leadDb: row.leadDb
    }))
  };
});

app.patch(
  "/api/v1/gateway-coverage/:gatewayId/location",
  async (request, reply) => {
    const params = request.params as {
      gatewayId: string;
    };

    const body = request.body as {
      locationId?: unknown;
    } | null;

    const gatewayId =
      params.gatewayId?.trim();

    if (!gatewayId) {
      return reply.code(400).send({
        error: "invalid_gateway_id"
      });
    }

    const rawLocationId =
      body?.locationId;

    if (
      rawLocationId !== null &&
      typeof rawLocationId !== "string"
    ) {
      return reply.code(400).send({
        error: "invalid_location_id"
      });
    }

    const locationId =
      typeof rawLocationId === "string"
        ? rawLocationId.trim()
        : null;

    if (
      typeof rawLocationId === "string" &&
      !locationId
    ) {
      return reply.code(400).send({
        error: "invalid_location_id"
      });
    }

    if (locationId) {
      const locationResult =
        await pool.query(
          `
          SELECT EXISTS (
            SELECT 1
            FROM locations
            WHERE id::text = $1
          ) AS exists
          `,
          [locationId]
        );

      if (!locationResult.rows[0]?.exists) {
        return reply.code(400).send({
          error: "location_not_found"
        });
      }
    }

    const result =
      await pool.query(
        `
        UPDATE gateway_coverage_gateways
        SET
          location_id = $2::uuid,
          updated_at = now()
        WHERE gateway_id = $1
        RETURNING gateway_id
        `,
        [
          gatewayId,
          locationId
        ]
      );

    if (result.rowCount === 0) {
      return reply.code(404).send({
        error: "gateway_not_found"
      });
    }

    return reply.code(200).send({
      status: "updated",
      gatewayId,
      locationId
    });
  }
);

app.delete("/api/v1/gateway-coverage", async (_request, reply) => {
  const result = await pool.query(
    `
    WITH deleted AS (
      DELETE FROM gateway_device_ble_observations
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
        DELETE FROM gateway_device_ble_observations
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
  "/api/v1/gateway-coverage/sensors/:sensorUid/samples",
  async (request, reply) => {
    const params = request.params as {
      sensorUid: string;
    };

    const sensorUid =
      params.sensorUid?.trim();

    if (!sensorUid) {
      return reply.code(400).send({
        error: "invalid_sensor_uid"
      });
    }

    const result = await pool.query(
      `
        WITH deleted AS (
          DELETE FROM gateway_device_ble_observations
          WHERE device_uid = $1
          RETURNING 1
        )
        SELECT COUNT(*)::integer AS deleted_samples
        FROM deleted
      `,
      [sensorUid]
    );

    return reply.code(200).send({
      status: "reset",
      sensorUid,
      deletedSamples:
        result.rows[0]?.deleted_samples ?? 0
    });
  }
);

app.delete(
  "/api/v1/gateway-coverage/sensors/:sensorUid",
  async (request, reply) => {
    const params = request.params as {
      sensorUid: string;
    };

    const sensorUid =
      params.sensorUid?.trim();

    if (!sensorUid) {
      return reply.code(400).send({
        error: "invalid_sensor_uid"
      });
    }

    const result = await pool.query(
      `
        WITH deleted AS (
          DELETE FROM gateway_device_ble_observations
          WHERE device_uid = $1
          RETURNING 1
        )
        SELECT COUNT(*)::integer AS deleted_samples
        FROM deleted
      `,
      [sensorUid]
    );

    return reply.code(200).send({
      status: "deleted",
      sensorUid,
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
        DELETE FROM gateway_device_ble_observations
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
        DELETE FROM gateway_device_ble_observations
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

app.get(
  "/api/v1/metric-display-settings",
  async () => {
    const result =
      await pool.query(
        `
        SELECT
          metric_key AS "metricKey",
          color,
          updated_at AS "updatedAt"
        FROM metric_display_settings
        ORDER BY metric_key
        `
      );

    return result.rows;
  }
);

app.put(
  "/api/v1/metric-display-settings/:metricKey",
  async (request, reply) => {
    const params =
      request.params as {
        metricKey?: string;
      };

    const body =
      request.body as {
        color?: unknown;
      } | null;

    const metricKey =
      params.metricKey
        ?.trim()
        .toLowerCase();

    if (
      !metricKey ||
      metricKey.length > 255
    ) {
      return reply.code(400).send({
        error: "invalid_metric_key"
      });
    }

    const color =
      typeof body?.color === "string"
        ? body.color.trim().toLowerCase()
        : "";

    if (
      !/^#[0-9a-f]{6}$/.test(color)
    ) {
      return reply.code(400).send({
        error: "invalid_metric_color"
      });
    }

    const result =
      await pool.query(
        `
        INSERT INTO metric_display_settings (
          metric_key,
          color,
          updated_at
        )
        VALUES ($1, $2, now())
        ON CONFLICT (metric_key)
        DO UPDATE SET
          color = EXCLUDED.color,
          updated_at = now()
        RETURNING
          metric_key AS "metricKey",
          color,
          updated_at AS "updatedAt"
        `,
        [
          metricKey,
          color
        ]
      );

    return reply.code(200).send(
      result.rows[0]
    );
  }
);

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
    activeViewId?: unknown;
    activeTabId?: unknown;
    refreshIntervalMs?: unknown;
    views?: unknown;
    tabs?: unknown;
  } | null;

  if (
    !body ||
    (
      body.version !== 1 &&
      body.version !== 2 &&
      body.version !== 3 &&
      body.version !== 4
    ) ||
    typeof body.refreshIntervalMs !== "number" ||
    (
      body.version === 4
        ? (typeof body.activeViewId !== "string" || !Array.isArray(body.views))
        : (typeof body.activeTabId !== "string" || !Array.isArray(body.tabs))
    )
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

await registerGatewayFeature(
  app,
  {
    pool
  }
);

await registerMetricRoutingFeature(
  app,
  {
    pool
  }
);

await registerProjectTodoFeature(
  app,
  {
    pool
  }
);

await registerSimpleDashboardFeature(
  app,
  {
    pool
  }
);

await registerDeviceRegistryFeature(
  app,
  {
    pool
  }
);

await registerServiceRegistryFeature(
  app,
  {
    pool
  }
);

await registerMonitoringFeature(
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

