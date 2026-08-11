import type {
  FastifyReply,
  FastifyRequest
} from "fastify";

import type {
  TelemetryService
} from "./service.js";

import {
  ok,
  badRequest
} from "../../shared/http/index.js";

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
