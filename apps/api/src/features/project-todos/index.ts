import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { ProjectTodoController } from "./controller.js";
import { PostgresProjectTodoRepository } from "./repository.js";
import { registerProjectTodoRoutes } from "./routes.js";

export async function registerProjectTodoFeature(
  app: FastifyInstance,
  options: { pool: Pool }
): Promise<void> {
  const repository = new PostgresProjectTodoRepository(options.pool);
  const controller = new ProjectTodoController(repository);
  await app.register(registerProjectTodoRoutes, { prefix: "/api/v1", controller });
}
