import type { FastifyInstance } from "fastify";
import type { DatabaseStorageController } from "./controller.js";

export async function registerDatabaseStorageRoutes(
  app: FastifyInstance,
  options: { controller: DatabaseStorageController }
): Promise<void> {
  app.get("/admin/database/storage", options.controller.report);
}
