import type {
  FastifyInstance
} from "fastify";

import type {
  Pool
} from "pg";

import {
  PostgresAssetRepository
} from "./repository.js";

import {
  AssetService
} from "./service.js";

import {
  AssetController
} from "./controller.js";

import {
  registerAssetRoutes
} from "./routes.js";

export interface AssetFeatureOptions {
  pool: Pool;
}

export async function registerAssetFeature(
  app: FastifyInstance,
  options: AssetFeatureOptions
): Promise<void> {

  const repository =
    new PostgresAssetRepository(
      options.pool
    );

  const service =
    new AssetService(
      repository
    );

  const controller =
    new AssetController(
      service
    );

  await app.register(
    registerAssetRoutes,
    {
      prefix: "/api/v1",
      controller
    }
  );
}
