import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import type { MetricRoutingRepository } from "./repository.js";

const decisionSchema = z.enum(["ACCEPT", "IGNORE", "DEDUPLICATE", "ERROR"]);
const trafficTypeSchema = z.enum(["METADATA", "SENSOR", "UNKNOWN"]);

export class MetricRoutingController {
  constructor(private readonly repository: MetricRoutingRepository) {}

  status = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    reply.send(await this.repository.getStatus());
  };

  events = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const query = request.query as Record<string, string | undefined>;
    const hours = Number(query.hours ?? "1");
    const limit = Number(query.limit ?? "500");
    const decisions = query.decision?.split(",").map(value => value.trim()).filter(Boolean) ?? [];
    const beforeOccurredAt = query.beforeOccurredAt?.trim() || undefined;
    const beforeId = query.beforeId === undefined ? undefined : Number(query.beforeId);

    if (!Number.isFinite(hours) || hours <= 0 || hours > 48 || !Number.isInteger(limit) || limit < 1 || limit > 2000) {
      reply.code(400).send({ error: "invalid_metric_routing_query" });
      return;
    }
    if (decisions.some(value => !decisionSchema.safeParse(value).success)) {
      reply.code(400).send({ error: "invalid_metric_routing_decision" });
      return;
    }
    if ((beforeOccurredAt && (!Number.isInteger(beforeId) || (beforeId ?? 0) < 1)) ||
        (!beforeOccurredAt && beforeId !== undefined) ||
        (beforeOccurredAt && Number.isNaN(Date.parse(beforeOccurredAt)))) {
      reply.code(400).send({ error: "invalid_metric_routing_cursor" });
      return;
    }

    reply.send(await this.repository.findEvents({
      hours,
      limit,
      decision: decisions.length ? decisions.join(",") : undefined,
      sensorUid: query.sensorUid?.trim() || undefined,
      gatewayId: query.gatewayId?.trim() || undefined,
      location: query.location?.trim() || undefined,
      metric: query.metric?.trim() || undefined,
      assignedGatewayId: query.assignedGatewayId?.trim() || undefined,
      reason: query.reason?.trim() || undefined,
      beforeOccurredAt,
      beforeId
    }));
  };

  gatewayTrafficEvents = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const query = request.query as Record<string, string | undefined>;
    const hours = Number(query.hours ?? "1");
    const limit = Number(query.limit ?? "500");
    const messageTypes = query.messageType?.split(",").map(value => value.trim()).filter(Boolean) ?? [];
    const beforeOccurredAt = query.beforeOccurredAt?.trim() || undefined;
    const beforeId = query.beforeId === undefined ? undefined : Number(query.beforeId);

    if (!Number.isFinite(hours) || hours <= 0 || hours > 48 || !Number.isInteger(limit) || limit < 1 || limit > 2000) {
      reply.code(400).send({ error: "invalid_gateway_traffic_query" });
      return;
    }
    if (messageTypes.some(value => !trafficTypeSchema.safeParse(value).success)) {
      reply.code(400).send({ error: "invalid_gateway_traffic_type" });
      return;
    }
    if ((beforeOccurredAt && (!Number.isInteger(beforeId) || (beforeId ?? 0) < 1)) ||
        (!beforeOccurredAt && beforeId !== undefined) ||
        (beforeOccurredAt && Number.isNaN(Date.parse(beforeOccurredAt)))) {
      reply.code(400).send({ error: "invalid_gateway_traffic_cursor" });
      return;
    }

    reply.send(await this.repository.findGatewayTrafficEvents({
      hours,
      limit,
      messageType: messageTypes.length ? messageTypes.join(",") : undefined,
      gatewayId: query.gatewayId?.trim() || undefined,
      sensorUid: query.sensorUid?.trim() || undefined,
      metric: query.metric?.trim() || undefined,
      topic: query.topic?.trim() || undefined,
      payload: query.payload?.trim() || undefined,
      beforeOccurredAt,
      beforeId
    }));
  };

  gatewayTrafficSummary = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const query = request.query as { hours?: string };
    const hours = Number(query.hours ?? "1");
    if (!Number.isFinite(hours) || hours <= 0 || hours > 48) {
      reply.code(400).send({ error: "invalid_hours" });
      return;
    }
    reply.send(await this.repository.getGatewayTrafficSummary(hours));
  };

  clearGatewayTraffic = async (_request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    reply.send({ status: "cleared", deletedEvents: await this.repository.clearGatewayTraffic() });
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
