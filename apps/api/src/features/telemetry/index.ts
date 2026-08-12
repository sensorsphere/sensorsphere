import type {
  FastifyInstance
} from "fastify";

import type {
  Pool
} from "pg";

import {
  PostgresTelemetryRepository
} from "./repository.js";

import {
  PostgresObservationRepository
} from "./observation-repository.js";

import {
  TelemetryService
} from "./service.js";

import {
  TelemetryController
} from "./controller.js";

import {
  registerTelemetryRoutes
} from "./routes.js";

export interface TelemetryFeatureOptions {
  pool: Pool;
}

export async function registerTelemetryFeature(
  app: FastifyInstance,
  options: TelemetryFeatureOptions
): Promise<void> {

  const repository =
    new PostgresTelemetryRepository(
      options.pool
    );

  const observationRepository =
    new PostgresObservationRepository(
      options.pool
    );

  const service =
    new TelemetryService(
      repository,
      observationRepository
    );

  const controller =
    new TelemetryController(
      service
    );

  await app.register(
    registerTelemetryRoutes,
    {
      prefix: "/api/v1",
      controller
    }
  );
}
