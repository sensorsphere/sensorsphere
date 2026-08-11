import type {
  FastifyInstance
} from "fastify";

import type {
  LocationController
} from "./controller.js";

export interface LocationRoutesOptions {
  controller: LocationController;
}

export async function registerLocationRoutes(
  app: FastifyInstance,
  options: LocationRoutesOptions
): Promise<void> {

  app.get(
    "/locations",
    options.controller.listLocations
  );

  app.get(
    "/locations/tree",
    options.controller.listLocationTree
  );
}
