import type {
  FastifyReply,
  FastifyRequest
} from "fastify";

import { z } from "zod";

import type {
  AlertService
} from "./service.js";

import {
  badRequest,
  notFound,
  ok
} from "../../shared/http/index.js";

const idSchema =
  z.string().uuid();

const severitySchema =
  z.enum([
    "INFO",
    "WARNING",
    "CRITICAL"
  ]);

const conditionSchema =
  z.enum([
    "ABOVE",
    "BELOW",
    "BETWEEN",
    "OUTSIDE",
    "OFFLINE",
    "NO_DATA"
  ]);

const createRuleSchema =
  z.object({
    name:
      z.string().trim().min(1).max(255),

    description:
      z.string().trim().max(2000)
        .nullable()
        .optional(),

    enabled:
      z.boolean().optional(),

    severity:
      severitySchema,

    conditionType:
      conditionSchema,

    assetId:
      z.string().uuid(),

    assetMetricId:
      z.string().uuid()
        .nullable()
        .optional(),

    thresholdMin:
      z.number().finite()
        .nullable()
        .optional(),

    thresholdMax:
      z.number().finite()
        .nullable()
        .optional(),

    durationSeconds:
      z.number().int().nonnegative()
        .optional(),

    cooldownSeconds:
      z.number().int().nonnegative()
        .optional(),

    metadata:
      z.record(
        z.string(),
        z.unknown()
      ).optional()
  })
  .strict()
  .superRefine(
    (value, context) => {

      if (
        (
          value.conditionType === "ABOVE" ||
          value.conditionType === "BELOW"
        ) &&
        value.thresholdMin == null
      ) {
        context.addIssue({
          code:
            z.ZodIssueCode.custom,
          message:
            "thresholdMin is required for ABOVE and BELOW"
        });
      }

      if (
        value.conditionType === "BETWEEN" ||
        value.conditionType === "OUTSIDE"
      ) {
        if (
          value.thresholdMin == null ||
          value.thresholdMax == null
        ) {
          context.addIssue({
            code:
              z.ZodIssueCode.custom,
            message:
              "thresholdMin and thresholdMax are required for BETWEEN and OUTSIDE"
          });
        } else if (
          value.thresholdMin >=
          value.thresholdMax
        ) {
          context.addIssue({
            code:
              z.ZodIssueCode.custom,
            message:
              "thresholdMin must be lower than thresholdMax"
          });
        }
      }

      if (
        (
          value.conditionType === "OFFLINE" ||
          value.conditionType === "NO_DATA"
        ) &&
        (
          value.thresholdMin != null ||
          value.thresholdMax != null
        )
      ) {
        context.addIssue({
          code:
            z.ZodIssueCode.custom,
          message:
            "OFFLINE and NO_DATA do not accept thresholds"
        });
      }

      if (
        value.conditionType !== "OFFLINE" &&
        value.conditionType !== "NO_DATA" &&
        !value.assetMetricId
      ) {
        context.addIssue({
          code:
            z.ZodIssueCode.custom,
          message:
            "assetMetricId is required for metric conditions"
        });
      }
    }
  );

const updateRuleSchema =
  z.object({
    name:
      z.string().trim().min(1).max(255)
        .optional(),

    description:
      z.string().trim().max(2000)
        .nullable()
        .optional(),

    enabled:
      z.boolean().optional(),

    severity:
      severitySchema.optional(),

    conditionType:
      conditionSchema.optional(),

    assetId:
      z.string().uuid()
        .nullable()
        .optional(),

    assetMetricId:
      z.string().uuid()
        .nullable()
        .optional(),

    thresholdMin:
      z.number().finite()
        .nullable()
        .optional(),

    thresholdMax:
      z.number().finite()
        .nullable()
        .optional(),

    durationSeconds:
      z.number().int().nonnegative()
        .optional(),

    cooldownSeconds:
      z.number().int().nonnegative()
        .optional(),

    metadata:
      z.record(
        z.string(),
        z.unknown()
      ).optional()
  })
  .strict()
  .refine(
    value =>
      Object.keys(value).length > 0,
    {
      message:
        "At least one field must be provided"
    }
  );

const alertHistoryQuerySchema =
  z.object({
    limit:
      z.coerce
        .number()
        .int()
        .min(1)
        .max(500)
        .default(100),

    status:
      z.enum([
        "ACTIVE",
        "ACKNOWLEDGED",
        "RESOLVED"
      ])
      .optional()
  })
  .strict();

const acknowledgeSchema =
  z.object({
    acknowledgedBy:
      z.string().trim().min(1).max(255)
        .nullable()
        .optional(),

    comment:
      z.string().trim().max(2000)
        .nullable()
        .optional()
  })
  .strict();

const resolveSchema =
  z.object({
    currentValue:
      z.number().finite()
        .nullable()
        .optional()
  })
  .strict();

export class AlertController {

  constructor(
    private readonly service:
      AlertService
  ) {}

  listRules =
    async (
      _request: FastifyRequest,
      reply: FastifyReply
    ): Promise<void> => {

      await ok(
        reply,
        await this.service.listRules()
      );
    };

  getRule =
    async (
      request: FastifyRequest<{
        Params: {
          id: string;
        };
      }>,
      reply: FastifyReply
    ): Promise<void> => {

      const parsed =
        idSchema.safeParse(
          request.params.id
        );

      if (!parsed.success) {
        await badRequest(
          reply,
          "Invalid alert rule id"
        );
        return;
      }

      const rule =
        await this.service.getRule(
          parsed.data
        );

      if (!rule) {
        await notFound(
          reply,
          "Alert rule not found"
        );
        return;
      }

      await ok(
        reply,
        rule
      );
    };

  createRule =
    async (
      request: FastifyRequest<{
        Body: unknown;
      }>,
      reply: FastifyReply
    ): Promise<void> => {

      const parsed =
        createRuleSchema.safeParse(
          request.body
        );

      if (!parsed.success) {
        await badRequest(
          reply,
          parsed.error.issues[0]?.message
            ?? "Invalid alert rule payload"
        );
        return;
      }

      const rule =
        await this.service.createRule(
          parsed.data
        );

      await reply
        .code(201)
        .send(rule);
    };

  updateRule =
    async (
      request: FastifyRequest<{
        Params: {
          id: string;
        };
        Body: unknown;
      }>,
      reply: FastifyReply
    ): Promise<void> => {

      const parsedId =
        idSchema.safeParse(
          request.params.id
        );

      if (!parsedId.success) {
        await badRequest(
          reply,
          "Invalid alert rule id"
        );
        return;
      }

      const parsedBody =
        updateRuleSchema.safeParse(
          request.body
        );

      if (!parsedBody.success) {
        await badRequest(
          reply,
          parsedBody.error.issues[0]?.message
            ?? "Invalid alert rule payload"
        );
        return;
      }

      const rule =
        await this.service.updateRule(
          parsedId.data,
          parsedBody.data
        );

      if (!rule) {
        await notFound(
          reply,
          "Alert rule not found"
        );
        return;
      }

      await ok(
        reply,
        rule
      );
    };

  deleteRule =
    async (
      request: FastifyRequest<{
        Params: {
          id: string;
        };
      }>,
      reply: FastifyReply
    ): Promise<void> => {

      const parsed =
        idSchema.safeParse(
          request.params.id
        );

      if (!parsed.success) {
        await badRequest(
          reply,
          "Invalid alert rule id"
        );
        return;
      }

      const deleted =
        await this.service.deleteRule(
          parsed.data
        );

      if (!deleted) {
        await notFound(
          reply,
          "Alert rule not found"
        );
        return;
      }

      await reply
        .code(204)
        .send();
    };

  listActiveAlerts =
    async (
      _request: FastifyRequest,
      reply: FastifyReply
    ): Promise<void> => {

      await ok(
        reply,
        await this.service
          .listActiveAlerts()
      );
    };

  listAlertHistory =
    async (
      request:
        FastifyRequest<{
          Querystring: unknown;
        }>,
      reply: FastifyReply
    ): Promise<void> => {

      const parsedQuery =
        alertHistoryQuerySchema.safeParse(
          request.query
        );

      if (!parsedQuery.success) {
        await badRequest(
          reply,
          parsedQuery.error
            .issues[0]?.message
            ?? "Invalid alert history query"
        );

        return;
      }

      const events =
        await this.service
          .listAlertHistory(
            parsedQuery.data.limit,
            parsedQuery.data.status
          );

      await ok(
        reply,
        events
      );
    };

  acknowledgeAlert =
    async (
      request: FastifyRequest<{
        Params: {
          id: string;
        };
        Body: unknown;
      }>,
      reply: FastifyReply
    ): Promise<void> => {

      const parsedId =
        idSchema.safeParse(
          request.params.id
        );

      if (!parsedId.success) {
        await badRequest(
          reply,
          "Invalid alert id"
        );
        return;
      }

      const parsedBody =
        acknowledgeSchema.safeParse(
          request.body
        );

      if (!parsedBody.success) {
        await badRequest(
          reply,
          parsedBody.error.issues[0]?.message
            ?? "Invalid acknowledgement payload"
        );
        return;
      }

      const event =
        await this.service
          .acknowledgeAlert(
            parsedId.data,
            parsedBody.data
          );

      if (!event) {
        await notFound(
          reply,
          "Active alert not found"
        );
        return;
      }

      await ok(
        reply,
        event
      );
    };

  resolveAlert =
    async (
      request: FastifyRequest<{
        Params: {
          id: string;
        };
        Body: unknown;
      }>,
      reply: FastifyReply
    ): Promise<void> => {

      const parsedId =
        idSchema.safeParse(
          request.params.id
        );

      if (!parsedId.success) {
        await badRequest(
          reply,
          "Invalid alert id"
        );
        return;
      }

      const parsedBody =
        resolveSchema.safeParse(
          request.body
        );

      if (!parsedBody.success) {
        await badRequest(
          reply,
          parsedBody.error.issues[0]?.message
            ?? "Invalid resolve payload"
        );
        return;
      }

      const event =
        await this.service.resolveAlert(
          parsedId.data,
          parsedBody.data.currentValue
        );

      if (!event) {
        await notFound(
          reply,
          "Active alert not found"
        );
        return;
      }

      await ok(
        reply,
        event
      );
    };
}
