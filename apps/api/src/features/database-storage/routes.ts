import type { FastifyInstance } from "fastify";
import type { DatabaseStorageController } from "./controller.js";
import type { DatabaseRetentionController } from "./retention-controller.js";

export async function registerDatabaseStorageRoutes(
  app: FastifyInstance,
  options: {
    controller: DatabaseStorageController;
    retentionController: DatabaseRetentionController;
  }
): Promise<void> {
  app.get("/admin/database/storage", options.controller.report);
  app.get(
    "/admin/database/storage/retention",
    options.retentionController.state
  );
  app.post(
    "/admin/database/storage/retention/preview",
    options.retentionController.preview
  );
  app.post(
    "/admin/database/storage/retention/apply",
    options.retentionController.apply
  );
  app.get(
    "/admin/database/storage/retention/audit",
    options.retentionController.audit
  );
}
