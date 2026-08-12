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

    const event =
      await this.repository
        .resolveEvent(
          id,
          currentValue
        );

    return event
      ? mapAlertEventToDto(
          event
        )
      : null;
  }

  async evaluateRule(
    rule: AlertRuleRecord,
    context: AlertRuleEvaluationContext
  ): Promise<AlertRuleEvaluationResult> {

    if (!rule.enabled) {
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

    if (
      evaluation.triggered &&
      !openEvent
    ) {

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
                rule.condition_type
            }
          });

      return {
        status:
          "opened",

        event:
          mapAlertEventToDto(
            created
          )
      };
    }

    if (
      evaluation.triggered &&
      openEvent
    ) {

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

    if (
      !evaluation.triggered &&
      openEvent
    ) {

      const resolved =
        await this.repository
          .resolveEvent(
            openEvent.id,
            evaluation.currentValue
          );

      return {
        status:
          resolved
            ? "resolved"
            : "unchanged",

        event:
          resolved
            ? mapAlertEventToDto(
                resolved
              )
            : null
      };
    }

    return {
      status:
        "unchanged",

      event:
        null
    };
  }
}
