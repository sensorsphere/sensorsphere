import type {
  FastifyInstance
} from "fastify";

import type {
  Pool
} from "pg";

import {
  PostgresAlertRepository
} from "./repository.js";

import {
  AlertService
} from "./service.js";

import {
  AlertController
} from "./controller.js";

import {
  registerAlertRoutes
} from "./routes.js";

import {
  startAlertScheduler
} from "./scheduler.js";

export interface AlertFeatureOptions {
  pool: Pool;
}

export async function registerAlertFeature(
  app: FastifyInstance,
  options: AlertFeatureOptions
): Promise<void> {

  const repository =
    new PostgresAlertRepository(
      options.pool
    );

  const service =
    new AlertService(
      repository
    );

  const controller =
    new AlertController(
      service
    );

  await app.register(
    registerAlertRoutes,
    {
      prefix:
        "/api/v1",
      controller
    }
  );

  const stopScheduler =
    startAlertScheduler({
      pool:
        options.pool,

      repository,

      service,

      logger:
        app.log
    });

  app.addHook(
    "onClose",
    async () => {
      stopScheduler();
    }
  );
}
