import type {
  FastifyReply,
  FastifyRequest
} from "fastify";

import type {
  TelemetryService
} from "./service.js";

import { z } from "zod";

import {
  ok,
  badRequest
} from "../../shared/http/index.js";

const latestObservationQuerySchema =
  z.object({
    assetId:
      z.string().uuid().optional()
  })
  .strict();

const observationHistoryQuerySchema =
  z.object({
    metricId:
      z.string().uuid(),
    from:
      z.string().datetime().optional(),
    to:
      z.string().datetime().optional()
  })
  .strict();

const observationAggregateQuerySchema =
  z.object({
    metricId:
      z.string().uuid(),
    from:
      z.string().datetime().optional(),
    to:
      z.string().datetime().optional(),
    bucket:
      z.enum([
        "1 minute",
        "5 minutes",
        "15 minutes",
        "1 hour",
        "6 hours",
        "1 day"
      ])
      .default("1 hour")
  })
  .strict();

interface HistoryQueryString {
  sensor_uid?: string;
  from?: string;
  to?: string;
}

export class TelemetryController {

  constructor(
    private readonly service:
      TelemetryService
  ) {}

  getLatest =
    async (
      _request: FastifyRequest,
      reply: FastifyReply
    ): Promise<void> => {

      const measurements =
        await this.service
          .getLatest();

      await ok(
          reply,
          measurements
      );
    };


  getLatestObservations =
    async (
      request:
        FastifyRequest<{
          Querystring: unknown;
        }>,
      reply: FastifyReply
    ): Promise<void> => {

      const parsedQuery =
        latestObservationQuerySchema.safeParse(
          request.query
        );

      if (!parsedQuery.success) {
        await badRequest(
          reply,
          parsedQuery.error.issues[0]?.message
            ?? "Invalid telemetry query"
        );
        return;
      }

      const observations =
        await this.service
          .getLatestObservations(
            parsedQuery.data.assetId
          );

      await ok(
        reply,
        observations
      );
    };


  getObservationHistory =
    async (
      request:
        FastifyRequest<{
          Querystring: unknown;
        }>,
      reply: FastifyReply
    ): Promise<void> => {

      const parsedQuery =
        observationHistoryQuerySchema.safeParse(
          request.query
        );

      if (!parsedQuery.success) {
        await badRequest(
          reply,
          parsedQuery.error.issues[0]?.message
            ?? "Invalid telemetry query"
        );
        return;
      }

      const toDate =
        parsedQuery.data.to
          ? new Date(parsedQuery.data.to)
          : new Date();

      const fromDate =
        parsedQuery.data.from
          ? new Date(parsedQuery.data.from)
          : new Date(
              toDate.getTime() -
              24 * 60 * 60 * 1000
            );

      if (fromDate > toDate) {
        await badRequest(
          reply,
          "from must be before to"
        );
        return;
      }

      const observations =
        await this.service
          .getObservationHistory(
            parsedQuery.data.metricId,
            fromDate,
            toDate
          );

      await ok(
        reply,
        observations
      );
    };


  getObservationAggregates =
    async (
      request:
        FastifyRequest<{
          Querystring: unknown;
        }>,
      reply: FastifyReply
    ): Promise<void> => {

      const parsedQuery =
        observationAggregateQuerySchema.safeParse(
          request.query
        );

      if (!parsedQuery.success) {
        await badRequest(
          reply,
          parsedQuery.error.issues[0]?.message
            ?? "Invalid telemetry aggregation query"
        );
        return;
      }

      const toDate =
        parsedQuery.data.to
          ? new Date(parsedQuery.data.to)
          : new Date();

      const fromDate =
        parsedQuery.data.from
          ? new Date(parsedQuery.data.from)
          : new Date(
              toDate.getTime() -
              24 * 60 * 60 * 1000
            );

      if (fromDate > toDate) {
        await badRequest(
          reply,
          "from must be before to"
        );
        return;
      }

      const aggregates =
        await this.service
          .getObservationAggregates(
            parsedQuery.data.metricId,
            fromDate,
            toDate,
            parsedQuery.data.bucket
          );

      await ok(
        reply,
        aggregates
      );
    };

  getHistory =
    async (
      request:
        FastifyRequest<{
          Querystring:
            HistoryQueryString;
        }>,
      reply: FastifyReply
    ): Promise<void> => {

      const {
        sensor_uid,
        from,
        to
      } = request.query;

      if (!sensor_uid) {
        await badRequest(
            reply,
            "sensor_uid is required"
        );

        return;
      }

      const toDate =
        to
          ? new Date(to)
          : new Date();

      const fromDate =
        from
          ? new Date(from)
          : new Date(
              toDate.getTime() -
              24 * 60 * 60 * 1000
            );

      if (
        Number.isNaN(
          fromDate.getTime()
        ) ||
        Number.isNaN(
          toDate.getTime()
        )
      ) {
        await reply
          await badRequest(
            reply,
            "Invalid date format"
          );

        return;
      }

      if (fromDate > toDate) {
        await badRequest(
            reply,
              "from must be before to"
          );

        return;
      }

      const measurements =
        await this.service
          .getHistory(
            sensor_uid,
            fromDate,
            toDate
          );

      await ok(
        reply,
        measurements
      );
    };
}
