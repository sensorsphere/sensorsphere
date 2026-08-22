import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import type { MetricRoutingDecision } from "./dto.js";
import type { MetricRoutingRepository } from "./repository.js";

const decisionSchema = z.enum(["ACCEPT", "IGNORE", "DEDUPLICATE", "ERROR"]);

export class MetricRoutingController {
  constructor(private readonly repository: MetricRoutingRepository) {}

  status = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    reply.send(await this.repository.getStatus());
  };

  events = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const query = request.query as Record<string, string | undefined>;
    const hours = Number(query.hours ?? "1");
    const limit = Number(query.limit ?? "500");
    const parsedDecision = query.decision ? decisionSchema.safeParse(query.decision) : null;

    if (!Number.isFinite(hours) || hours <= 0 || hours > 48 || !Number.isInteger(limit) || limit < 1 || limit > 2000) {
      reply.code(400).send({ error: "invalid_metric_routing_query" });
      return;
    }
    if (parsedDecision && !parsedDecision.success) {
      reply.code(400).send({ error: "invalid_metric_routing_decision" });
      return;
    }

    reply.send(await this.repository.findEvents({
      hours,
      limit,
      decision: parsedDecision?.data as MetricRoutingDecision | undefined,
      sensorUid: query.sensorUid?.trim() || undefined,
      gatewayId: query.gatewayId?.trim() || undefined,
      metric: query.metric?.trim() || undefined
    }));
  };

  summary = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const query = request.query as { hours?: string };
    const hours = Number(query.hours ?? "1");
    if (!Number.isFinite(hours) || hours <= 0 || hours > 48) {
      reply.code(400).send({ error: "invalid_hours" });
      return;
    }
    reply.send(await this.repository.getSummary(hours));
  };

  clear = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    reply.send({ status: "cleared", deletedEvents: await this.repository.clear() });
  };
}
