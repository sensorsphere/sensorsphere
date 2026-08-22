import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { MetricRoutingRepository } from "./repository.js";
import { MetricRoutingController } from "./controller.js";
import { registerMetricRoutingRoutes } from "./routes.js";

export async function registerMetricRoutingFeature(
  app: FastifyInstance,
  options: { pool: Pool }
): Promise<void> {
  const repository = new MetricRoutingRepository(options.pool);
  const controller = new MetricRoutingController(repository);
  await app.register(registerMetricRoutingRoutes, {
    prefix: "/api/v1",
    controller
  });
}
