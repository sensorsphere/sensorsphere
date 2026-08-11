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

  app.post(
    "/locations",
    options.controller.createLocation
  );

  app.get(
    "/locations/tree",
    options.controller.listLocationTree
  );

  app.get(
    "/locations/:id",
    options.controller.getLocationById
  );

  app.patch(
    "/locations/:id/move",
    options.controller.moveLocation
  );
}
