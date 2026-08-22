import type { FastifyInstance } from "fastify";
import type { MetricRoutingController } from "./controller.js";

export async function registerMetricRoutingRoutes(
  app: FastifyInstance,
  options: { controller: MetricRoutingController }
): Promise<void> {
  app.get("/metric-routing/status", options.controller.status);
  app.get("/metric-routing/events", options.controller.events);
  app.get("/metric-routing/summary", options.controller.summary);
  app.delete("/metric-routing/events", options.controller.clear);
}
