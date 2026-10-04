import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { DatabaseStorageRepository } from "./repository.js";
import { DatabaseStorageController } from "./controller.js";
import { registerDatabaseStorageRoutes } from "./routes.js";

export async function registerDatabaseStorageFeature(
  app: FastifyInstance,
  options: { pool: Pool }
): Promise<void> {
  const repository = new DatabaseStorageRepository(options.pool);
  const controller = new DatabaseStorageController(repository);
  await app.register(registerDatabaseStorageRoutes, {
    prefix: "/api/v1",
    controller
  });
}
