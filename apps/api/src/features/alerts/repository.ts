import type {
  Pool,
  PoolClient
} from "pg";

import type {
  AlertConditionType,
  AlertEventStatus,
  AlertSeverity,
  AcknowledgeAlertInput,
  CreateAlertEventInput,
  CreateAlertRuleInput,
  UpdateAlertRuleInput
} from "./dto.js";

export interface AlertRuleRecord {
  id: string;

  name: string;
  description: string | null;

  enabled: boolean;

  severity: AlertSeverity;
  condition_type: AlertConditionType;

  asset_id: string | null;
  asset_metric_id: string | null;

  threshold_min: number | null;
  threshold_max: number | null;

  duration_seconds: number;
  cooldown_seconds: number;

  metadata:
    Record<string, unknown>;

  created_at: Date;
  updated_at: Date;
}

export interface AlertRuleStateRecord {
  rule_id: string;

  condition_started_at:
    Date | null;

  last_triggered_at:
    Date | null;

  last_resolved_at:
    Date | null;

  created_at: Date;
  updated_at: Date;
}

export interface AlertEventRecord {
  id: string;

  rule_id: string;
  asset_id: string;
  asset_metric_id: string | null;

  status: AlertEventStatus;
  severity: AlertSeverity;

  opened_at: Date;
  acknowledged_at: Date | null;
  resolved_at: Date | null;

  current_value: number | null;
  trigger_value: number | null;

  message: string;

  metadata:
    Record<string, unknown>;

  created_at: Date;
  updated_at: Date;
}

export interface ActiveAlertRecord
extends AlertEventRecord {
  rule_name: string;
  condition_type: AlertConditionType;

  asset_external_id: string;
  asset_display_name: string;

  metric_key: string | null;
  metric_display_name: string | null;
  unit: string | null;
}

export interface AlertRepository {

  findRules():
    Promise<AlertRuleRecord[]>;

  findEnabledRules():
    Promise<AlertRuleRecord[]>;

  findRuleById(
    id: string
  ): Promise<AlertRuleRecord | null>;

  createRule(
    input: CreateAlertRuleInput
  ): Promise<AlertRuleRecord>;

  updateRule(
    id: string,
    input: UpdateAlertRuleInput
  ): Promise<AlertRuleRecord | null>;

  deleteRule(
    id: string
  ): Promise<boolean>;

  findRuleState(
    ruleId: string
  ): Promise<AlertRuleStateRecord | null>;

  setConditionStarted(
    ruleId: string,
    startedAt: Date
  ): Promise<AlertRuleStateRecord>;

  clearConditionStarted(
    ruleId: string
  ): Promise<void>;

  markRuleTriggered(
    ruleId: string,
    triggeredAt: Date
  ): Promise<void>;

  markRuleResolved(
    ruleId: string,
    resolvedAt: Date
  ): Promise<void>;

  findActiveEvents():
    Promise<ActiveAlertRecord[]>;

  findEvents(
    limit: number,
    status?: AlertEventStatus
  ): Promise<AlertEventRecord[]>;

  findEventById(
    id: string
  ): Promise<AlertEventRecord | null>;

  findOpenEventForRule(
    ruleId: string,
    assetId: string
  ): Promise<AlertEventRecord | null>;

  createEvent(
    input: CreateAlertEventInput
  ): Promise<AlertEventRecord>;

  updateEventValue(
    id: string,
    currentValue: number | null
  ): Promise<AlertEventRecord | null>;

  acknowledgeEvent(
    id: string,
    input: AcknowledgeAlertInput
  ): Promise<AlertEventRecord | null>;

  resolveEvent(
    id: string,
    currentValue?: number | null
  ): Promise<AlertEventRecord | null>;
}

const ALERT_RULE_COLUMNS = `
  id,
  name,
  description,
  enabled,
  severity,
  condition_type,
  asset_id,
  asset_metric_id,
  threshold_min,
  threshold_max,
  duration_seconds,
  cooldown_seconds,
  metadata,
  created_at,
  updated_at
`;

const ALERT_RULE_STATE_COLUMNS = `
  rule_id,
  condition_started_at,
  last_triggered_at,
  last_resolved_at,
  created_at,
  updated_at
`;

const ALERT_EVENT_COLUMNS = `
  id,
  rule_id,
  asset_id,
  asset_metric_id,
  status,
  severity,
  opened_at,
  acknowledged_at,
  resolved_at,
  current_value,
  trigger_value,
  message,
  metadata,
  created_at,
  updated_at
`;

export class PostgresAlertRepository
implements AlertRepository {

  constructor(
    private readonly pool: Pool
  ) {}

  async findRules():
  Promise<AlertRuleRecord[]> {

    const result =
      await this.pool
        .query<AlertRuleRecord>(
          `
          SELECT
            ${ALERT_RULE_COLUMNS}
          FROM alert_rules
          ORDER BY
            enabled DESC,
            severity DESC,
            name ASC
          `
        );

    return result.rows;
  }

  async findEnabledRules():
  Promise<AlertRuleRecord[]> {

    const result =
      await this.pool
        .query<AlertRuleRecord>(
          `
          SELECT
            ${ALERT_RULE_COLUMNS}
          FROM alert_rules
          WHERE enabled = TRUE
          ORDER BY
            severity DESC,
            name ASC
          `
        );

    return result.rows;
  }

  async findRuleById(
    id: string
  ): Promise<AlertRuleRecord | null> {

    const result =
      await this.pool
        .query<AlertRuleRecord>(
          `
          SELECT
            ${ALERT_RULE_COLUMNS}
          FROM alert_rules
          WHERE id = $1
          LIMIT 1
          `,
          [id]
        );

    return result.rows[0] ?? null;
  }

  async createRule(
    input: CreateAlertRuleInput
  ): Promise<AlertRuleRecord> {

    const result =
      await this.pool
        .query<AlertRuleRecord>(
          `
          INSERT INTO alert_rules
          (
            name,
            description,
            enabled,
            severity,
            condition_type,
            asset_id,
            asset_metric_id,
            threshold_min,
            threshold_max,
            duration_seconds,
            cooldown_seconds,
            metadata
          )
          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10,
            $11,
            $12::jsonb
          )
          RETURNING
            ${ALERT_RULE_COLUMNS}
          `,
          [
            input.name,
            input.description
              ?? null,
            input.enabled
              ?? true,
            input.severity,
            input.conditionType,
            input.assetId
              ?? null,
            input.assetMetricId
              ?? null,
            input.thresholdMin
              ?? null,
            input.thresholdMax
              ?? null,
            input.durationSeconds
              ?? 0,
            input.cooldownSeconds
              ?? 0,
            JSON.stringify(
              input.metadata
              ?? {}
            )
          ]
        );

    const created =
      result.rows[0];

    if (!created) {
      throw new Error(
        "Alert rule creation returned no row"
      );
    }

    return created;
  }

  async updateRule(
    id: string,
    input: UpdateAlertRuleInput
  ): Promise<AlertRuleRecord | null> {

    const current =
      await this.findRuleById(
        id
      );

    if (!current) {
      return null;
    }

    const result =
      await this.pool
        .query<AlertRuleRecord>(
          `
          UPDATE alert_rules
          SET
            name = $2,
            description = $3,
            enabled = $4,
            severity = $5,
            condition_type = $6,
            asset_id = $7,
            asset_metric_id = $8,
            threshold_min = $9,
            threshold_max = $10,
            duration_seconds = $11,
            cooldown_seconds = $12,
            metadata = $13::jsonb,
            updated_at = NOW()
          WHERE id = $1
          RETURNING
            ${ALERT_RULE_COLUMNS}
          `,
          [
            id,
            input.name
              ?? current.name,
            input.description
              === undefined
                ? current.description
                : input.description,
            input.enabled
              ?? current.enabled,
            input.severity
              ?? current.severity,
            input.conditionType
              ?? current.condition_type,
            input.assetId
              === undefined
                ? current.asset_id
                : input.assetId,
            input.assetMetricId
              === undefined
                ? current.asset_metric_id
                : input.assetMetricId,
            input.thresholdMin
              === undefined
                ? current.threshold_min
                : input.thresholdMin,
            input.thresholdMax
              === undefined
                ? current.threshold_max
                : input.thresholdMax,
            input.durationSeconds
              ?? current.duration_seconds,
            input.cooldownSeconds
              ?? current.cooldown_seconds,
            JSON.stringify(
              input.metadata
              ?? current.metadata
            )
          ]
        );

    return result.rows[0] ?? null;
  }

  async deleteRule(
    id: string
  ): Promise<boolean> {

    const result =
      await this.pool.query(
        `
        DELETE FROM alert_rules
        WHERE id = $1
        `,
        [id]
      );

    return (
      result.rowCount
      ?? 0
    ) > 0;
  }

  async findRuleState(
    ruleId: string
  ): Promise<AlertRuleStateRecord | null> {

    const result =
      await this.pool
        .query<AlertRuleStateRecord>(
          `
          SELECT
            ${ALERT_RULE_STATE_COLUMNS}
          FROM alert_rule_state
          WHERE rule_id = $1
          LIMIT 1
          `,
          [
            ruleId
          ]
        );

    return result.rows[0]
      ?? null;
  }

  async setConditionStarted(
    ruleId: string,
    startedAt: Date
  ): Promise<AlertRuleStateRecord> {

    const result =
      await this.pool
        .query<AlertRuleStateRecord>(
          `
          INSERT INTO alert_rule_state
          (
            rule_id,
            condition_started_at
          )
          VALUES
          (
            $1,
            $2
          )
          ON CONFLICT (
            rule_id
          )
          DO UPDATE
          SET
            condition_started_at =
              COALESCE(
                alert_rule_state
                  .condition_started_at,
                EXCLUDED
                  .condition_started_at
              ),
            updated_at =
              NOW()
          RETURNING
            ${ALERT_RULE_STATE_COLUMNS}
          `,
          [
            ruleId,
            startedAt
          ]
        );

    const state =
      result.rows[0];

    if (!state) {
      throw new Error(
        "Alert rule state update returned no row"
      );
    }

    return state;
  }

  async clearConditionStarted(
    ruleId: string
  ): Promise<void> {

    await this.pool.query(
      `
      INSERT INTO alert_rule_state
      (
        rule_id,
        condition_started_at
      )
      VALUES
      (
        $1,
        NULL
      )
      ON CONFLICT (
        rule_id
      )
      DO UPDATE
      SET
        condition_started_at =
          NULL,
        updated_at =
          NOW()
      `,
      [
        ruleId
      ]
    );
  }

  async markRuleTriggered(
    ruleId: string,
    triggeredAt: Date
  ): Promise<void> {

    await this.pool.query(
      `
      INSERT INTO alert_rule_state
      (
        rule_id,
        condition_started_at,
        last_triggered_at
      )
      VALUES
      (
        $1,
        $2,
        $2
      )
      ON CONFLICT (
        rule_id
      )
      DO UPDATE
      SET
        condition_started_at =
          COALESCE(
            alert_rule_state
              .condition_started_at,
            EXCLUDED
              .condition_started_at
          ),
        last_triggered_at =
          EXCLUDED
            .last_triggered_at,
        updated_at =
          NOW()
      `,
      [
        ruleId,
        triggeredAt
      ]
    );
  }

  async markRuleResolved(
    ruleId: string,
    resolvedAt: Date
  ): Promise<void> {

    await this.pool.query(
      `
      INSERT INTO alert_rule_state
      (
        rule_id,
        condition_started_at,
        last_resolved_at
      )
      VALUES
      (
        $1,
        NULL,
        $2
      )
      ON CONFLICT (
        rule_id
      )
      DO UPDATE
      SET
        condition_started_at =
          NULL,
        last_resolved_at =
          EXCLUDED
            .last_resolved_at,
        updated_at =
          NOW()
      `,
      [
        ruleId,
        resolvedAt
      ]
    );
  }

  async findActiveEvents():
  Promise<ActiveAlertRecord[]> {

    const result =
      await this.pool
        .query<ActiveAlertRecord>(
          `
          SELECT
            id,
            rule_id,
            asset_id,
            asset_metric_id,
            status,
            severity,
            opened_at,
            acknowledged_at,
            NULL::timestamptz
              AS resolved_at,
            current_value,
            trigger_value,
            message,
            metadata,
            opened_at
              AS created_at,
            opened_at
              AS updated_at,
            rule_name,
            condition_type,
            asset_external_id,
            asset_display_name,
            metric_key,
            metric_display_name,
            unit
          FROM active_alerts
          ORDER BY
            CASE severity
              WHEN 'CRITICAL'
                THEN 0
              WHEN 'WARNING'
                THEN 1
              ELSE 2
            END,
            opened_at ASC
          `
        );

    return result.rows;
  }

  async findEvents(
    limit: number,
    status?: AlertEventStatus
  ): Promise<AlertEventRecord[]> {

    const result =
      await this.pool
        .query<AlertEventRecord>(
          `
          SELECT
            ${ALERT_EVENT_COLUMNS}
          FROM alert_events
          WHERE (
            $1::text IS NULL
            OR status = $1
          )
          ORDER BY opened_at DESC
          LIMIT $2
          `,
          [
            status
              ?? null,
            limit
          ]
        );

    return result.rows;
  }

  async findEventById(
    id: string
  ): Promise<AlertEventRecord | null> {

    const result =
      await this.pool
        .query<AlertEventRecord>(
          `
          SELECT
            ${ALERT_EVENT_COLUMNS}
          FROM alert_events
          WHERE id = $1
          LIMIT 1
          `,
          [id]
        );

    return result.rows[0] ?? null;
  }

  async findOpenEventForRule(
    ruleId: string,
    assetId: string
  ): Promise<AlertEventRecord | null> {

    const result =
      await this.pool
        .query<AlertEventRecord>(
          `
          SELECT
            ${ALERT_EVENT_COLUMNS}
          FROM alert_events
          WHERE rule_id = $1
            AND asset_id = $2
            AND status IN (
              'ACTIVE',
              'ACKNOWLEDGED'
            )
          ORDER BY opened_at DESC
          LIMIT 1
          `,
          [
            ruleId,
            assetId
          ]
        );

    return result.rows[0] ?? null;
  }

  async createEvent(
    input: CreateAlertEventInput
  ): Promise<AlertEventRecord> {

    const result =
      await this.pool
        .query<AlertEventRecord>(
          `
          INSERT INTO alert_events
          (
            rule_id,
            asset_id,
            asset_metric_id,
            status,
            severity,
            current_value,
            trigger_value,
            message,
            metadata
          )
          VALUES
          (
            $1,
            $2,
            $3,
            'ACTIVE',
            $4,
            $5,
            $6,
            $7,
            $8::jsonb
          )
          RETURNING
            ${ALERT_EVENT_COLUMNS}
          `,
          [
            input.ruleId,
            input.assetId,
            input.assetMetricId
              ?? null,
            input.severity,
            input.currentValue
              ?? null,
            input.triggerValue
              ?? null,
            input.message,
            JSON.stringify(
              input.metadata
              ?? {}
            )
          ]
        );

    const created =
      result.rows[0];

    if (!created) {
      throw new Error(
        "Alert event creation returned no row"
      );
    }

    return created;
  }

  async updateEventValue(
    id: string,
    currentValue: number | null
  ): Promise<AlertEventRecord | null> {

    const result =
      await this.pool
        .query<AlertEventRecord>(
          `
          UPDATE alert_events
          SET
            current_value = $2,
            updated_at = NOW()
          WHERE id = $1
            AND status IN (
              'ACTIVE',
              'ACKNOWLEDGED'
            )
          RETURNING
            ${ALERT_EVENT_COLUMNS}
          `,
          [
            id,
            currentValue
          ]
        );

    return result.rows[0] ?? null;
  }

  async acknowledgeEvent(
    id: string,
    input: AcknowledgeAlertInput
  ): Promise<AlertEventRecord | null> {

    const client: PoolClient =
      await this.pool.connect();

    try {

      await client.query(
        "BEGIN"
      );

      const result =
        await client
          .query<AlertEventRecord>(
            `
            UPDATE alert_events
            SET
              status =
                'ACKNOWLEDGED',
              acknowledged_at =
                COALESCE(
                  acknowledged_at,
                  NOW()
                ),
              updated_at = NOW()
            WHERE id = $1
              AND status = 'ACTIVE'
            RETURNING
              ${ALERT_EVENT_COLUMNS}
            `,
            [id]
          );

      const updated =
        result.rows[0];

      if (!updated) {
        await client.query(
          "ROLLBACK"
        );

        return null;
      }

      await client.query(
        `
        INSERT INTO alert_acknowledgements
        (
          alert_event_id,
          acknowledged_by,
          comment
        )
        VALUES
        (
          $1,
          $2,
          $3
        )
        `,
        [
          id,
          input.acknowledgedBy
            ?? null,
          input.comment
            ?? null
        ]
      );

      await client.query(
        "COMMIT"
      );

      return updated;

    } catch (error) {

      await client.query(
        "ROLLBACK"
      );

      throw error;

    } finally {

      client.release();
    }
  }

  async resolveEvent(
    id: string,
    currentValue?: number | null
  ): Promise<AlertEventRecord | null> {

    const result =
      await this.pool
        .query<AlertEventRecord>(
          `
          UPDATE alert_events
          SET
            status = 'RESOLVED',
            resolved_at =
              COALESCE(
                resolved_at,
                NOW()
              ),
            current_value =
              COALESCE(
                $2,
                current_value
              ),
            updated_at = NOW()
          WHERE id = $1
            AND status IN (
              'ACTIVE',
              'ACKNOWLEDGED'
            )
          RETURNING
            ${ALERT_EVENT_COLUMNS}
          `,
          [
            id,
            currentValue
              ?? null
          ]
        );

    return result.rows[0] ?? null;
  }
}
