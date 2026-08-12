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

  app.get(
    "/observations/latest",
    options.controller.getLatestObservations
  );

  app.get(
    "/observations/history",
    options.controller.getObservationHistory
  );

  app.get(
    "/observations/aggregate",
    options.controller.getObservationAggregates
  );
}
