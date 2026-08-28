import {
  Pool,
  type PoolClient
} from "pg";

import type {
  SensorSnapshot
} from "@sensorsphere/core";

import type {
  MeasurementRepository
} from "../../domain/measurement-repository.js";

export interface PostgresRepositoryConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export class PostgresMeasurementRepository
implements MeasurementRepository {

  private readonly pool: Pool;

  constructor(
    config: PostgresRepositoryConfig
  ) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password
    });
  }

  async testConnection():
  Promise<void> {

    await this.pool.query(
      "SELECT 1"
    );
  }

  async reportComponentBuild(
    component: string,
    buildDate: string
  ): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO component_build_info (
        component, build_date, started_at, updated_at
      )
      VALUES ($1, $2::timestamptz, NOW(), NOW())
      ON CONFLICT (component) DO UPDATE
      SET
        build_date = EXCLUDED.build_date,
        started_at = NOW(),
        updated_at = NOW()
      `,
      [component, buildDate]
    );
  }



  async saveGatewayTrafficEvent(input: {
    occurredAt: Date;
    gatewayId: string | null;
    messageType: "METADATA" | "SENSOR" | "UNKNOWN";
    processing:
      | "GATEWAY_METADATA"
      | "SENSOR_METADATA"
      | "METRIC_ROUTING"
      | "COVERAGE_ROUTING"
      | "UNRECOGNIZED";
    sensorUid: string | null;
    metric: string | null;
    payload: string;
    sourceTopic: string;
  }): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO gateway_traffic_events (
        occurred_at, gateway_id, message_type, processing, sensor_uid, metric, payload, source_topic
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        input.occurredAt,
        input.gatewayId,
        input.messageType,
        input.processing,
        input.sensorUid,
        input.metric,
        input.payload,
        input.sourceTopic
      ]
    );
  }

  async purgeGatewayTrafficEvents(
    retentionHours = 48
  ): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM gateway_traffic_events
       WHERE occurred_at < NOW() - ($1 * INTERVAL '1 hour')`,
      [retentionHours]
    );
    return result.rowCount ?? 0;
  }

  async setMetricRoutingMode(
    mode: "legacy" | "dry_run" | "active"
  ): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO metric_routing_status (singleton, mode, updated_at)
      VALUES (TRUE, $1, NOW())
      ON CONFLICT (singleton) DO UPDATE
      SET mode = EXCLUDED.mode, updated_at = NOW()
      `,
      [mode]
    );
  }

  async isSensorBlacklisted(
    sensorUid: string
  ): Promise<boolean> {
    const result = await this.pool.query<{ blacklisted: boolean }>(
      `
      SELECT blacklisted
      FROM sensors
      WHERE LOWER(sensor_uid) = LOWER($1)
      LIMIT 1
      `,
      [sensorUid]
    );

    return result.rows[0]?.blacklisted ?? false;
  }

  async getSensorRoutingAssignment(
    sensorUid: string
  ): Promise<{
    sensorName: string | null;
    assignedGatewayId: string | null;
    backupGatewayId: string | null;
    primaryGatewayLastSeenAt: Date | null;
  }> {
    const result = await this.pool.query<{
      sensor_name: string | null;
      assigned_gateway_id: string | null;
      backup_gateway_id: string | null;
      primary_gateway_last_seen_at: Date | null;
    }>(
      `
      SELECT
        s.name AS sensor_name,
        g.gateway_id AS assigned_gateway_id,
        bg.gateway_id AS backup_gateway_id,
        g.last_seen_at AS primary_gateway_last_seen_at
      FROM sensors s
      LEFT JOIN gateways g ON g.id = s.gateway_id
      LEFT JOIN sensor_gateway_assignments sga
        ON sga.sensor_id = s.id
       AND sga.priority = 2
       AND sga.enabled = TRUE
      LEFT JOIN gateways bg ON bg.id = sga.gateway_id
      WHERE LOWER(s.sensor_uid) = LOWER($1)
      LIMIT 1
      `,
      [sensorUid]
    );

    return {
      sensorName: result.rows[0]?.sensor_name ?? null,
      assignedGatewayId: result.rows[0]?.assigned_gateway_id ?? null,
      backupGatewayId: result.rows[0]?.backup_gateway_id ?? null,
      primaryGatewayLastSeenAt: result.rows[0]?.primary_gateway_last_seen_at ?? null
    };
  }

  async saveMetricRoutingEvent(input: {
    occurredAt: Date;
    gatewayId: string;
    sensorUid: string;
    sensorName: string | null;
    metric: string;
    value: number;
    decision: "ACCEPT" | "IGNORE" | "DEDUPLICATE" | "ERROR";
    reason: string;
    assignedGatewayId: string | null;
    backupGatewayId: string | null;
    primaryGatewayLastSeenAt: Date | null;
    mode: "dry_run" | "active";
    sourceTopic: string;
    dedupKey?: string | null;
    dedupAgeMs?: number | null;
  }): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO metric_routing_events (
        occurred_at, gateway_id, sensor_uid, sensor_name, metric, value,
        decision, reason, assigned_gateway_id, backup_gateway_id,
        primary_gateway_last_seen_at, mode, source_topic, dedup_key, dedup_age_ms
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `,
      [
        input.occurredAt, input.gatewayId, input.sensorUid, input.sensorName,
        input.metric, input.value, input.decision, input.reason,
        input.assignedGatewayId, input.backupGatewayId,
        input.primaryGatewayLastSeenAt, input.mode, input.sourceTopic,
        input.dedupKey ?? null, input.dedupAgeMs ?? null
      ]
    );
  }

  async purgeMetricRoutingEvents(
    retentionHours = 48
  ): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM metric_routing_events
       WHERE occurred_at < NOW() - ($1 * INTERVAL '1 hour')`,
      [retentionHours]
    );
    return result.rowCount ?? 0;
  }

  async ensureGatewayExists(
    gatewayId: string
  ): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO gateways (
        gateway_id,
        name,
        name_manually_set,
        gateway_type_id,
        type
      )
      SELECT
        $1,
        $1,
        FALSE,
        gt.id,
        'ble_gateway'
      FROM gateway_types gt
      WHERE gt.key = 'ble_gateway'
      ON CONFLICT (gateway_id) DO NOTHING
      `,
      [gatewayId]
    );
  }

  async saveGatewayMetadata(
    gatewayId: string,
    metric:
      | "friendly_name"
      | "board_id"
      | "mac_address"
      | "wifi_rssi"
      | "wifi_ssid"
      | "build_date"
      | "ip_address",
    value: string,
    receivedAt: Date
  ): Promise<void> {
    const wifiRssi =
      metric === "wifi_rssi"
        ? Number(value)
        : null;

    if (
      metric === "wifi_rssi" &&
      !Number.isFinite(wifiRssi)
    ) {
      return;
    }

    await this.pool.query(
      `
      INSERT INTO gateways (
        gateway_id,
        name,
        name_manually_set,
        gateway_type_id,
        type,
        board_id,
        mac_address,
        wifi_rssi,
        wifi_rssi_seen_at,
        wifi_ssid,
        build_date,
        ip_address,
        last_seen_at
      )
      SELECT
        $1,
        CASE
          WHEN $2::text = 'friendly_name' THEN $3::text
          ELSE $1::text
        END,
        FALSE,
        gt.id,
        'ble_gateway',
        CASE WHEN $2::text = 'board_id' THEN $3::text ELSE NULL::text END,
        CASE WHEN $2::text = 'mac_address' THEN $3::text ELSE NULL::text END,
        CASE WHEN $2::text = 'wifi_rssi' THEN $4::double precision ELSE NULL::double precision END,
        CASE WHEN $2::text = 'wifi_rssi' THEN $5::timestamptz ELSE NULL::timestamptz END,
        CASE WHEN $2::text = 'wifi_ssid' THEN $3::text ELSE NULL::text END,
        CASE WHEN $2::text = 'build_date' THEN $3::text ELSE NULL::text END,
        CASE WHEN $2::text = 'ip_address' THEN $3::inet ELSE NULL::inet END,
        $5
      FROM gateway_types gt
      WHERE gt.key = 'ble_gateway'
      ON CONFLICT (gateway_id) DO UPDATE
      SET
        name = CASE
          WHEN $2::text = 'friendly_name'
               AND NOT gateways.name_manually_set
            THEN $3::text
          ELSE gateways.name
        END,
        board_id = CASE
          WHEN $2::text = 'board_id' THEN $3::text
          ELSE gateways.board_id
        END,
        mac_address = CASE
          WHEN $2::text = 'mac_address' THEN $3::text
          ELSE gateways.mac_address
        END,
        wifi_rssi = CASE
          WHEN $2::text = 'wifi_rssi' THEN $4::double precision
          ELSE gateways.wifi_rssi
        END,
        wifi_rssi_seen_at = CASE
          WHEN $2::text = 'wifi_rssi' THEN $5::timestamptz
          ELSE gateways.wifi_rssi_seen_at
        END,
        wifi_ssid = CASE
          WHEN $2::text = 'wifi_ssid' THEN $3::text
          ELSE gateways.wifi_ssid
        END,
        build_date = CASE
          WHEN $2::text = 'build_date' THEN $3::text
          ELSE gateways.build_date
        END,
        ip_address = CASE
          WHEN $2::text = 'ip_address' THEN $3::inet
          ELSE gateways.ip_address
        END,
        last_seen_at = GREATEST(
          gateways.last_seen_at,
          EXCLUDED.last_seen_at
        ),
        updated_at = NOW()
      `,
      [
        gatewayId,
        metric,
        value,
        wifiRssi,
        receivedAt
      ]
    );
  }

  async ensureSensorExists(
    sensorUid: string
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `
        INSERT INTO sensors (sensor_uid)
        VALUES ($1)
        ON CONFLICT (sensor_uid) DO NOTHING
        `,
        [sensorUid]
      );

      await client.query(
        `
        INSERT INTO assets (
          id, external_id, manufacturer, model, firmware_version,
          asset_type, protocol, enabled, gateway_id, room_id, source_sensor_uid
        )
        SELECT
          sensor.uuid,
          sensor.sensor_uid,
          sensor.manufacturer,
          sensor.model,
          sensor.firmware_version,
          'sensor',
          'mqtt',
          sensor.enabled,
          sensor.gateway_id,
          sensor.room_id,
          sensor.sensor_uid
        FROM sensors sensor
        WHERE LOWER(sensor.sensor_uid) = LOWER($1)
          AND sensor.blacklisted = FALSE
        ON CONFLICT (source_sensor_uid) DO UPDATE
        SET
          manufacturer = COALESCE(EXCLUDED.manufacturer, assets.manufacturer),
          model = COALESCE(EXCLUDED.model, assets.model),
          firmware_version = COALESCE(EXCLUDED.firmware_version, assets.firmware_version),
          enabled = EXCLUDED.enabled,
          updated_at = NOW()
        `,
        [sensorUid]
      );

      await client.query(
        `
        INSERT INTO asset_metrics (
          id, asset_id, metric_key, display_name, unit, value_type, enabled
        )
        SELECT
          gen_random_uuid(),
          asset.id,
          metric.metric_key,
          metric.display_name,
          metric.unit,
          'number',
          TRUE
        FROM assets asset
        CROSS JOIN (
          VALUES
            ('temperature', 'Temperature', '°C'),
            ('humidity', 'Humidity', '%'),
            ('battery', 'Battery', '%'),
            ('voltage', 'Voltage', 'V'),
            ('rssi', 'RSSI', 'dBm')
        ) AS metric(metric_key, display_name, unit)
        WHERE LOWER(asset.source_sensor_uid) = LOWER($1)
        ON CONFLICT (asset_id, metric_key) DO NOTHING
        `,
        [sensorUid]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async saveSensorActivity(
    sensorUid: string,
    receivedAt: Date
  ): Promise<void> {
    await this.pool.query(
      `
      UPDATE sensors
      SET last_seen_at = GREATEST(last_seen_at, $2::timestamptz)
      WHERE LOWER(sensor_uid) = LOWER($1)
        AND blacklisted = FALSE
      `,
      [sensorUid, receivedAt]
    );
  }

  async saveSensorMetadata(
    sensorUid: string,
    metric: "manufacturer" | "model" | "firmware",
    value: string
  ): Promise<void> {
    if (metric === "manufacturer" && value.trim()) {
      await this.pool.query(
        `INSERT INTO manufacturers (name) VALUES ($1) ON CONFLICT DO NOTHING`,
        [value.trim()]
      );
    }

    await this.pool.query(
      `
      INSERT INTO sensors (
        sensor_uid,
        manufacturer,
        model,
        firmware_version
      )
      VALUES (
        $1,
        CASE WHEN $2::text = 'manufacturer' THEN $3::text ELSE NULL::text END,
        CASE WHEN $2::text = 'model' THEN $3::text ELSE NULL::text END,
        CASE WHEN $2::text = 'firmware' THEN $3::text ELSE NULL::text END
      )
      ON CONFLICT (sensor_uid) DO UPDATE
      SET
        manufacturer = CASE
          WHEN $2::text = 'manufacturer' THEN $3::text
          ELSE sensors.manufacturer
        END,
        model = CASE
          WHEN $2::text = 'model' THEN $3::text
          ELSE sensors.model
        END,
        firmware_version = CASE
          WHEN $2::text = 'firmware' THEN $3::text
          ELSE sensors.firmware_version
        END,
        updated_at = CASE
          WHEN ($2::text = 'manufacturer' AND sensors.manufacturer IS DISTINCT FROM $3::text)
            OR ($2::text = 'model' AND sensors.model IS DISTINCT FROM $3::text)
            OR ($2::text = 'firmware' AND sensors.firmware_version IS DISTINCT FROM $3::text)
            THEN NOW()
          ELSE sensors.updated_at
        END
      WHERE sensors.blacklisted = FALSE
      `,
      [sensorUid, metric, value]
    );

    await this.pool.query(
      `
      UPDATE assets
      SET
        manufacturer = CASE WHEN $2::text = 'manufacturer' THEN $3::text ELSE manufacturer END,
        model = CASE WHEN $2::text = 'model' THEN $3::text ELSE model END,
        firmware_version = CASE WHEN $2::text = 'firmware' THEN $3::text ELSE firmware_version END,
        updated_at = NOW()
      WHERE LOWER(source_sensor_uid) = LOWER($1)
      `,
      [sensorUid, metric, value]
    );
  }

  async saveGatewayDeviceBleObservation(
    gatewayId: string,
    sensorUid: string,
    rssi: number,
    receivedAt: Date,
    sourceTopic: string
  ): Promise<void> {

    const client =
      await this.pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `
        INSERT INTO gateway_coverage_gateways (
          gateway_id,
          last_rssi_at
        )
        VALUES ($1, $2)
        ON CONFLICT (gateway_id) DO UPDATE
        SET
          last_rssi_at = GREATEST(
            gateway_coverage_gateways.last_rssi_at,
            EXCLUDED.last_rssi_at
          ),
          updated_at = now()
        `,
        [
          gatewayId,
          receivedAt
        ]
      );

      await client.query(
        `
        INSERT INTO gateway_device_ble_observations (
          time,
          gateway_id,
          device_uid,
          rssi,
          source_topic
        )
        VALUES ($1, $2, $3, $4, $5)
        `,
        [
          receivedAt,
          gatewayId,
          sensorUid,
          rssi,
          sourceTopic
        ]
      );

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async saveGatewayCoverageMetadata(
    gatewayId: string,
    metric: "board_id" | "mac_address" | "wifi_rssi" | "wifi_ssid" | "build_date" | "ip_address",
    value: string,
    receivedAt: Date
  ): Promise<void> {
    const wifiRssi =
      metric === "wifi_rssi"
        ? Number(value)
        : null;

    if (
      metric === "wifi_rssi" &&
      !Number.isFinite(wifiRssi)
    ) {
      return;
    }

    await this.pool.query(
      `
      INSERT INTO gateway_coverage_gateways (
        gateway_id,
        board_id,
        mac_address,
        wifi_rssi,
        wifi_rssi_seen_at,
        wifi_ssid,
        build_date,
        ip_address
      )
      VALUES (
        $1,
        CASE WHEN $2::text = 'board_id' THEN $3::text ELSE NULL::text END,
        CASE WHEN $2::text = 'mac_address' THEN $3::text ELSE NULL::text END,
        CASE WHEN $2::text = 'wifi_rssi' THEN $4::double precision ELSE NULL::double precision END,
        CASE WHEN $2::text = 'wifi_rssi' THEN $5::timestamptz ELSE NULL::timestamptz END,
        CASE WHEN $2::text = 'wifi_ssid' THEN $3::text ELSE NULL::text END,
        CASE WHEN $2::text = 'build_date' THEN $3::text ELSE NULL::text END,
        CASE WHEN $2::text = 'ip_address' THEN $3::text ELSE NULL::text END
      )
      ON CONFLICT (gateway_id) DO UPDATE
      SET
        board_id = CASE
          WHEN $2::text = 'board_id' THEN $3::text
          ELSE gateway_coverage_gateways.board_id
        END,
        mac_address = CASE
          WHEN $2::text = 'mac_address' THEN $3::text
          ELSE gateway_coverage_gateways.mac_address
        END,
        wifi_rssi = CASE
          WHEN $2::text = 'wifi_rssi' THEN $4::double precision
          ELSE gateway_coverage_gateways.wifi_rssi
        END,
        wifi_rssi_seen_at = CASE
          WHEN $2::text = 'wifi_rssi' THEN $5::timestamptz
          ELSE gateway_coverage_gateways.wifi_rssi_seen_at
        END,
        wifi_ssid = CASE
          WHEN $2::text = 'wifi_ssid' THEN $3::text
          ELSE gateway_coverage_gateways.wifi_ssid
        END,
        build_date = CASE
          WHEN $2::text = 'build_date' THEN $3::text
          ELSE gateway_coverage_gateways.build_date
        END,
        ip_address = CASE
          WHEN $2::text = 'ip_address' THEN $3::text
          ELSE gateway_coverage_gateways.ip_address
        END,
        updated_at = now()
      `,
      [
        gatewayId,
        metric,
        value,
        wifiRssi,
        receivedAt
      ]
    );
  }

  async saveSnapshotBatch(
    snapshots: SensorSnapshot[]
  ): Promise<void> {

    if (snapshots.length === 0) {
      return;
    }

    const blacklistedResult = await this.pool.query<{ sensor_uid: string }>(
      `
      SELECT LOWER(sensor_uid) AS sensor_uid
      FROM sensors
      WHERE blacklisted = TRUE
        AND LOWER(sensor_uid) = ANY($1::text[])
      `,
      [snapshots.map(snapshot => snapshot.sensorUid.toLowerCase())]
    );

    const blacklistedSensorUids = new Set(
      blacklistedResult.rows.map(row => row.sensor_uid)
    );

    const activeSnapshots = snapshots.filter(
      snapshot => !blacklistedSensorUids.has(snapshot.sensorUid.toLowerCase())
    );

    if (activeSnapshots.length === 0) {
      return;
    }

    const client: PoolClient =
      await this.pool.connect();

    try {

      await client.query(
        "BEGIN"
      );

      for (
        const snapshot
        of activeSnapshots
      ) {

        await client.query(
          `
          INSERT INTO sensors(sensor_uid)
          VALUES ($1)

          ON CONFLICT (sensor_uid)

          DO UPDATE
          SET updated_at = NOW()
          WHERE sensors.blacklisted = FALSE
          `,
          [
            snapshot.sensorUid
          ]
        );

        await client.query(
          `
          INSERT INTO assets (
            id,
            external_id,
            asset_type,
            protocol,
            enabled,
            source_sensor_uid
          )
          SELECT
            gen_random_uuid(),
            $1,
            'sensor',
            'mqtt',
            TRUE,
            $1
          WHERE NOT EXISTS (
            SELECT 1
            FROM assets
            WHERE source_sensor_uid = $1
          )
            AND EXISTS (
              SELECT 1
              FROM sensors
              WHERE sensor_uid = $1
                AND blacklisted = FALSE
            )
          `,
          [
            snapshot.sensorUid
          ]
        );

        await client.query(
          `
          WITH metric_templates AS (
            SELECT DISTINCT ON (
              metric_key
            )
              metric_key,
              display_name,
              unit,
              value_type,
              enabled
            FROM asset_metrics
            WHERE metric_key IN (
              'temperature',
              'humidity',
              'battery',
              'voltage',
              'rssi'
            )
            ORDER BY
              metric_key,
              created_at ASC
          )
          INSERT INTO asset_metrics (
            id,
            asset_id,
            metric_key,
            display_name,
            unit,
            value_type,
            enabled
          )
          SELECT
            gen_random_uuid(),
            asset.id,
            template.metric_key,
            template.display_name,
            template.unit,
            template.value_type,
            template.enabled
          FROM assets asset
          CROSS JOIN metric_templates template
          WHERE asset.source_sensor_uid = $1
            AND NOT EXISTS (
              SELECT 1
              FROM asset_metrics existing
              WHERE existing.asset_id =
                    asset.id
                AND existing.metric_key =
                    template.metric_key
            )
          `,
          [
            snapshot.sensorUid
          ]
        );
      }

      const values: unknown[] =
        [];

      const placeholders:
        string[] = [];

      activeSnapshots.forEach(
        (snapshot, index) => {

          const offset =
            index * 7;

          placeholders.push(
            `(
              $${offset + 1},
              $${offset + 2},
              $${offset + 3},
              $${offset + 4},
              $${offset + 5},
              $${offset + 6},
              $${offset + 7}
            )`
          );

          values.push(
            snapshot.timestamp,
            snapshot.sensorUid,
            snapshot.metrics.temperature ?? null,
            snapshot.metrics.humidity ?? null,
            snapshot.metrics.battery ?? null,
            snapshot.metrics.voltage ?? null,
            snapshot.metrics.rssi ?? null
          );
        }
      );

      await client.query(
        `
        INSERT INTO measurements
        (
          time,
          sensor_uid,
          temperature,
          humidity,
          battery,
          voltage,
          rssi
        )

        VALUES

        ${placeholders.join(",")}
        `,
        values
      );

      const observationValues:
        unknown[] = [];

      const observationPlaceholders:
        string[] = [];

      const metricKeys = [
        "temperature",
        "humidity",
        "battery",
        "voltage",
        "rssi"
      ] as const;

      for (const snapshot of activeSnapshots) {

        for (const metricKey of metricKeys) {

          const value =
            snapshot.metrics[metricKey];

          if (value === undefined) {
            continue;
          }

          const offset =
            observationValues.length;

          observationPlaceholders.push(
            `(
              $${offset + 1}::timestamptz,
              $${offset + 2}::text,
              $${offset + 3}::text,
              $${offset + 4}::double precision
            )`
          );

          observationValues.push(
            snapshot.timestamp,
            snapshot.sensorUid,
            metricKey,
            value
          );
        }
      }

      if (
        observationPlaceholders.length > 0
      ) {

        await client.query(
          `
          INSERT INTO observations
          (
            time,
            asset_metric_id,
            value_double,
            source,
            source_ref
          )
          SELECT
            incoming.time,
            metric.id,
            incoming.value,
            'ingestion-service',
            incoming.sensor_uid
          FROM (
            VALUES
              ${observationPlaceholders.join(",")}
          ) AS incoming(
            time,
            sensor_uid,
            metric_key,
            value
          )
          JOIN assets asset
            ON asset.source_sensor_uid =
               incoming.sensor_uid
          JOIN asset_metrics metric
            ON metric.asset_id = asset.id
           AND metric.metric_key =
               incoming.metric_key
           AND metric.enabled = TRUE
          `,
          observationValues
        );
      }

      await client.query(
        "COMMIT"
      );

    } catch (error) {

      await client.query(
        "ROLLBACK"
      );

      throw error;

    } finally {

      client.release();
    }
  }
}