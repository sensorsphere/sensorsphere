import type {
  FastifyInstance
} from "fastify";

import type {
  TelemetryController
} from "./controller.js";

export interface TelemetryRoutesOptions {
  controller: TelemetryController;
}

export async function registerTelemetryRoutes(
  app: FastifyInstance,
  options: TelemetryRoutesOptions
): Promise<void> {

  app.get(
    "/measurements/latest",
    options.controller.getLatest
  );

  app.get(
    "/measurements/history",
    options.controller.getHistory
  );
}
