import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { DatabaseStorageRepository } from "./repository.js";
import { DatabaseStorageController } from "./controller.js";
import { registerDatabaseStorageRoutes } from "./routes.js";
import { databaseStorageSettings } from "./settings.js";

const COLLECTOR_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const INITIAL_COLLECTION_DELAY_MS = 10 * 1000;

export async function registerDatabaseStorageFeature(
  app: FastifyInstance,
  options: { pool: Pool }
): Promise<void> {
  const repository = new DatabaseStorageRepository(options.pool);
  const controller = new DatabaseStorageController(repository);
  const settings = databaseStorageSettings();

  await app.register(registerDatabaseStorageRoutes, {
    prefix: "/api/v1",
    controller
  });

  const collect = async (): Promise<void> => {
    try {
      const result = await repository.captureSnapshotIfDue(
        settings.snapshotIntervalHours,
        settings.snapshotRetentionDays
      );
      if (result.captured) {
        app.log.info(
          {
            deletedExpiredSnapshots: result.deletedExpired,
            snapshotIntervalHours: settings.snapshotIntervalHours,
            snapshotRetentionDays: settings.snapshotRetentionDays
          },
          "Database storage snapshot captured"
        );
      }
    } catch (error) {
      app.log.warn(
        { error },
        "Unable to capture database storage snapshot"
      );
    }
  };

  const initialTimer = setTimeout(() => {
    void collect();
  }, INITIAL_COLLECTION_DELAY_MS);
  initialTimer.unref();

  const collectorTimer = setInterval(() => {
    void collect();
  }, COLLECTOR_CHECK_INTERVAL_MS);
  collectorTimer.unref();

  app.addHook("onClose", async () => {
    clearTimeout(initialTimer);
    clearInterval(collectorTimer);
  });
}
