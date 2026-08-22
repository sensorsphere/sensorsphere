import type {
  FastifyInstance
} from "fastify";

import type {
  Pool
} from "pg";

import {
  PostgresSensorRepository
} from "./repository.js";

import {
  SensorService
} from "./service.js";

import {
  SensorController
} from "./controller.js";

import {
  registerSensorRoutes
} from "./routes.js";

export interface SensorFeatureOptions {
  pool: Pool;
}

export async function registerSensorFeature(
  app: FastifyInstance,
  options: SensorFeatureOptions
): Promise<void> {

  const repository =
    new PostgresSensorRepository(
      options.pool
    );

  const service =
    new SensorService(
      repository
    );

  const controller =
    new SensorController(
      service
    );

  await app.register(
    registerSensorRoutes,
    {
      prefix: "/api/v1",
      controller
    }
  );
}
