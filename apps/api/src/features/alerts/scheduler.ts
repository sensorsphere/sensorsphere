import type {
  FastifyBaseLogger
} from "fastify";

import type {
  Pool
} from "pg";

import type {
  AlertService
} from "./service.js";

import type {
  AlertRepository,
  AlertRuleRecord
} from "./repository.js";

export interface AlertSchedulerOptions {
  pool: Pool;

  repository:
    AlertRepository;

  service:
    AlertService;

  logger:
    FastifyBaseLogger;

  intervalMs?: number;
}

interface LatestMetricRecord {
  value_double: number | null;
  time: Date | null;
}

interface LatestAssetRecord {
  last_seen_at: Date | null;
}

async function loadMetricContext(
  pool: Pool,
  rule: AlertRuleRecord
): Promise<{
  currentValue: number | null;
  ageSeconds: number | null;
}> {

  if (!rule.asset_metric_id) {
    return {
      currentValue:
        null,
      ageSeconds:
        null
    };
  }

  const result =
    await pool.query<LatestMetricRecord>(
      `
      SELECT
        o.value_double,
        o.time
      FROM observations o
      WHERE o.asset_metric_id = $1
      ORDER BY o.time DESC
      LIMIT 1
      `,
      [
        rule.asset_metric_id
      ]
    );

  const latest =
    result.rows[0];

  if (
    !latest ||
    !latest.time
  ) {
    return {
      currentValue:
        null,
      ageSeconds:
        null
    };
  }

  return {
    currentValue:
      latest.value_double,

    ageSeconds:
      Math.max(
        0,
        Math.floor(
          (
            Date.now() -
            latest.time.getTime()
          ) /
          1000
        )
      )
  };
}

async function loadAssetContext(
  pool: Pool,
  rule: AlertRuleRecord
): Promise<{
  currentValue: number | null;
  ageSeconds: number | null;
}> {

  if (!rule.asset_id) {
    return {
      currentValue:
        null,
      ageSeconds:
        null
    };
  }

  const result =
    await pool.query<LatestAssetRecord>(
      `
      SELECT
        latest.time
          AS last_seen_at
      FROM assets a

      LEFT JOIN LATERAL (
        SELECT
          m.time
        FROM measurements m
        WHERE m.sensor_uid =
          a.source_sensor_uid
        ORDER BY m.time DESC
        LIMIT 1
      ) latest
        ON TRUE

      WHERE a.id = $1
      LIMIT 1
      `,
      [
        rule.asset_id
      ]
    );

  const latest =
    result.rows[0];

  if (
    !latest ||
    !latest.last_seen_at
  ) {
    return {
      currentValue:
        null,
      ageSeconds:
        null
    };
  }

  return {
    currentValue:
      null,

    ageSeconds:
      Math.max(
        0,
        Math.floor(
          (
            Date.now() -
            latest.last_seen_at
              .getTime()
          ) /
          1000
        )
      )
  };
}

async function evaluateRule(
  options: AlertSchedulerOptions,
  rule: AlertRuleRecord
): Promise<void> {

  const context =
    rule.condition_type ===
      "OFFLINE" ||
    rule.condition_type ===
      "NO_DATA"
      ? await loadAssetContext(
          options.pool,
          rule
        )
      : await loadMetricContext(
          options.pool,
          rule
        );

  const result =
    await options.service
      .evaluateRule(
        rule,
        context
      );

  if (
    result.status !==
    "unchanged"
  ) {
    options.logger.info(
      {
        ruleId:
          rule.id,

        ruleName:
          rule.name,

        assetId:
          rule.asset_id,

        status:
          result.status,

        eventId:
          result.event?.id
          ?? null
      },
      "Alert rule evaluated"
    );
  }
}

export function startAlertScheduler(
  options: AlertSchedulerOptions
): () => void {

  const intervalMs =
    options.intervalMs
    ?? 60_000;

  let running =
    false;

  const run =
    async (): Promise<void> => {

      if (running) {
        options.logger.warn(
          "Alert scheduler cycle skipped because previous cycle is still running"
        );

        return;
      }

      running =
        true;

      try {

        const rules =
          await options.repository
            .findEnabledRules();

        for (
          const rule
          of rules
        ) {

          try {

            await evaluateRule(
              options,
              rule
            );

          } catch (error) {

            options.logger.error(
              {
                error,
                ruleId:
                  rule.id,
                ruleName:
                  rule.name
              },
              "Alert rule evaluation failed"
            );
          }
        }

      } catch (error) {

        options.logger.error(
          {
            error
          },
          "Alert scheduler cycle failed"
        );

      } finally {

        running =
          false;
      }
    };

  void run();

  const timer =
    setInterval(
      () => {
        void run();
      },
      intervalMs
    );

  options.logger.info(
    {
      intervalMs
    },
    "Alert scheduler started"
  );

  return () => {
    clearInterval(
      timer
    );
  };
}
