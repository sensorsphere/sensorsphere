import type {
  ActiveAlertDto,
  AlertEventDto,
  AlertRuleDto,
  AcknowledgeAlertInput,
  CreateAlertRuleInput,
  UpdateAlertRuleInput
} from "./dto.js";

import {
  evaluateAlertCondition
} from "./evaluator.js";

import {
  mapActiveAlertToDto,
  mapAlertEventToDto,
  mapAlertRuleToDto
} from "./mapper.js";

import type {
  AlertRepository,
  AlertRuleRecord
} from "./repository.js";

export interface AlertRuleEvaluationContext {
  currentValue:
    number | null;

  ageSeconds:
    number | null;
}

export interface AlertRuleEvaluationResult {
  status:
    | "opened"
    | "updated"
    | "resolved"
    | "unchanged";

  event:
    AlertEventDto | null;
}

function elapsedSeconds(
  from: Date,
  to: Date
): number {

  return Math.max(
    0,
    Math.floor(
      (
        to.getTime() -
        from.getTime()
      ) /
      1000
    )
  );
}

function latestDate(
  left: Date | null,
  right: Date | null
): Date | null {

  if (!left) {
    return right;
  }

  if (!right) {
    return left;
  }

  return left.getTime() >=
    right.getTime()
      ? left
      : right;
}

function resetsConditionTimer(
  input: UpdateAlertRuleInput
): boolean {

  return (
    input.enabled !== undefined ||
    input.conditionType !== undefined ||
    input.assetId !== undefined ||
    input.assetMetricId !== undefined ||
    input.thresholdMin !== undefined ||
    input.thresholdMax !== undefined ||
    input.durationSeconds !== undefined
  );
}

export class AlertService {

  constructor(
    private readonly repository:
      AlertRepository
  ) {}

  async listRules():
  Promise<AlertRuleDto[]> {

    const rules =
      await this.repository
        .findRules();

    return rules.map(
      mapAlertRuleToDto
    );
  }

  async getRule(
    id: string
  ): Promise<AlertRuleDto | null> {

    const rule =
      await this.repository
        .findRuleById(
          id
        );

    return rule
      ? mapAlertRuleToDto(
          rule
        )
      : null;
  }

  async createRule(
    input: CreateAlertRuleInput
  ): Promise<AlertRuleDto> {

    const created =
      await this.repository
        .createRule(
          input
        );

    return mapAlertRuleToDto(
      created
    );
  }

  async updateRule(
    id: string,
    input: UpdateAlertRuleInput
  ): Promise<AlertRuleDto | null> {

    const updated =
      await this.repository
        .updateRule(
          id,
          input
        );

    if (
      updated &&
      resetsConditionTimer(
        input
      )
    ) {
      await this.repository
        .clearConditionStarted(
          id
        );
    }

    return updated
      ? mapAlertRuleToDto(
          updated
        )
      : null;
  }

  async deleteRule(
    id: string
  ): Promise<boolean> {

    return this.repository
      .deleteRule(
        id
      );
  }

  async listActiveAlerts():
  Promise<ActiveAlertDto[]> {

    const events =
      await this.repository
        .findActiveEvents();

    return events.map(
      mapActiveAlertToDto
    );
  }

  async listAlertHistory(
    limit: number,
    status?:
      "ACTIVE"
      | "ACKNOWLEDGED"
      | "RESOLVED"
  ): Promise<AlertEventDto[]> {

    const events =
      await this.repository
        .findEvents(
          limit,
          status
        );

    return events.map(
      mapAlertEventToDto
    );
  }

  async acknowledgeAlert(
    id: string,
    input: AcknowledgeAlertInput
  ): Promise<AlertEventDto | null> {

    const event =
      await this.repository
        .acknowledgeEvent(
          id,
          input
        );

    return event
      ? mapAlertEventToDto(
          event
        )
      : null;
  }

  async resolveAlert(
    id: string,
    currentValue?: number | null
  ): Promise<AlertEventDto | null> {

    const current =
      await this.repository
        .findEventById(
          id
        );

    if (!current) {
      return null;
    }

    const event =
      await this.repository
        .resolveEvent(
          id,
          currentValue
        );

    if (!event) {
      return null;
    }

    await this.repository
      .markRuleResolved(
        current.rule_id,
        event.resolved_at
        ?? new Date()
      );

    return mapAlertEventToDto(
      event
    );
  }

  async evaluateRule(
    rule: AlertRuleRecord,
    context: AlertRuleEvaluationContext
  ): Promise<AlertRuleEvaluationResult> {

    if (!rule.enabled) {

      await this.repository
        .clearConditionStarted(
          rule.id
        );

      return {
        status:
          "unchanged",
        event:
          null
      };
    }

    if (!rule.asset_id) {
      throw new Error(
        `Alert rule ${rule.id} has no asset_id`
      );
    }

    const now =
      new Date();

    const evaluation =
      evaluateAlertCondition({
        conditionType:
          rule.condition_type,

        thresholdMin:
          rule.threshold_min,

        thresholdMax:
          rule.threshold_max,

        currentValue:
          context.currentValue,

        ageSeconds:
          context.ageSeconds,

        durationSeconds:
          rule.duration_seconds
      });

    const openEvent =
      await this.repository
        .findOpenEventForRule(
          rule.id,
          rule.asset_id
        );

    if (!evaluation.triggered) {

      await this.repository
        .clearConditionStarted(
          rule.id
        );

      if (!openEvent) {
        return {
          status:
            "unchanged",
          event:
            null
        };
      }

      const resolved =
        await this.repository
          .resolveEvent(
            openEvent.id,
            evaluation.currentValue
          );

      if (!resolved) {
        return {
          status:
            "unchanged",
          event:
            null
        };
      }

      await this.repository
        .markRuleResolved(
          rule.id,
          resolved.resolved_at
          ?? now
        );

      return {
        status:
          "resolved",

        event:
          mapAlertEventToDto(
            resolved
          )
      };
    }

    if (openEvent) {

      const updated =
        await this.repository
          .updateEventValue(
            openEvent.id,
            evaluation.currentValue
          );

      return {
        status:
          updated
            ? "updated"
            : "unchanged",

        event:
          updated
            ? mapAlertEventToDto(
                updated
              )
            : null
      };
    }

    let state =
      await this.repository
        .findRuleState(
          rule.id
        );

    const availabilityCondition =
      rule.condition_type ===
        "OFFLINE" ||
      rule.condition_type ===
        "NO_DATA";

    const needsConditionTimer =
      !availabilityCondition ||
      context.ageSeconds ===
        null;

    if (needsConditionTimer) {

      if (
        !state?.condition_started_at
      ) {

        state =
          await this.repository
            .setConditionStarted(
              rule.id,
              now
            );

        if (
          rule.duration_seconds >
          0
        ) {
          return {
            status:
              "unchanged",
            event:
              null
          };
        }
      }

      const startedAt =
        state.condition_started_at
        ?? now;

      if (
        elapsedSeconds(
          startedAt,
          now
        ) <
        rule.duration_seconds
      ) {
        return {
          status:
            "unchanged",
          event:
            null
        };
      }
    }

    const cooldownReference =
      latestDate(
        state?.last_resolved_at
        ?? null,
        state?.last_triggered_at
        ?? null
      );

    if (
      cooldownReference &&
      rule.cooldown_seconds >
        0 &&
      elapsedSeconds(
        cooldownReference,
        now
      ) <
      rule.cooldown_seconds
    ) {
      return {
        status:
          "unchanged",
        event:
          null
      };
    }

    const created =
      await this.repository
        .createEvent({
          ruleId:
            rule.id,

          assetId:
            rule.asset_id,

          assetMetricId:
            rule.asset_metric_id,

          severity:
            rule.severity,

          currentValue:
            evaluation.currentValue,

          triggerValue:
            evaluation.triggerValue,

          message:
            `${rule.name}: ${evaluation.reason}`,

          metadata: {
            conditionType:
              rule.condition_type,

            durationSeconds:
              rule.duration_seconds,

            cooldownSeconds:
              rule.cooldown_seconds
          }
        });

    await this.repository
      .markRuleTriggered(
        rule.id,
        created.opened_at
        ?? now
      );

    return {
      status:
        "opened",

      event:
        mapAlertEventToDto(
          created
        )
    };
  }
}
