import type {
  FastifyInstance
} from "fastify";

import type {
  Pool
} from "pg";

import {
  PostgresLocationRepository
} from "./repository.js";

import {
  LocationService
} from "./service.js";

import {
  LocationController
} from "./controller.js";

import {
  registerLocationRoutes
} from "./routes.js";

export interface LocationFeatureOptions {
  pool: Pool;
}

export async function registerLocationFeature(
  app: FastifyInstance,
  options: LocationFeatureOptions
): Promise<void> {

  const repository =
    new PostgresLocationRepository(
      options.pool
    );

  const service =
    new LocationService(
      repository
    );

  const controller =
    new LocationController(
      service
    );

  await app.register(
    registerLocationRoutes,
    {
      prefix: "/api/v1",
      controller
    }
  );
}
