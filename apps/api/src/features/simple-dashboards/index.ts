import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { SimpleDashboardController } from "./controller.js";
import { PostgresSimpleDashboardRepository } from "./repository.js";
import { registerSimpleDashboardRoutes } from "./routes.js";

export async function registerSimpleDashboardFeature(
  app: FastifyInstance,
  options: { pool: Pool }
): Promise<void> {
  const repository = new PostgresSimpleDashboardRepository(options.pool);
  const controller = new SimpleDashboardController(repository);
  await app.register(registerSimpleDashboardRoutes, {
    prefix: "/api/v1",
    controller
  });
}
