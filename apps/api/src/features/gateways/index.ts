import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";

import { PostgresGatewayRepository } from "./repository.js";
import { GatewayService } from "./service.js";
import { GatewayController } from "./controller.js";
import { registerGatewayRoutes } from "./routes.js";

export interface GatewayFeatureOptions {
  pool: Pool;
}

export async function registerGatewayFeature(
  app: FastifyInstance,
  options: GatewayFeatureOptions
): Promise<void> {
  const repository =
    new PostgresGatewayRepository(options.pool);
  const service =
    new GatewayService(repository);
  const controller =
    new GatewayController(service);

  await app.register(
    registerGatewayRoutes,
    {
      prefix: "/api/v1",
      controller
    }
  );
}
