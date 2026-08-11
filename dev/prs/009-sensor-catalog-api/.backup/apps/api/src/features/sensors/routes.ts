import type {
  FastifyInstance
} from "fastify";

import type {
  SensorController
} from "./controller.js";

export interface SensorRoutesOptions {
  controller: SensorController;
}

export async function registerSensorRoutes(
  app: FastifyInstance,
  options: SensorRoutesOptions
): Promise<void> {

  app.get(
    "/sensors",
    options.controller.listSensors
  );
}
