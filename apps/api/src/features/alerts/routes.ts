import type {
  FastifyInstance
} from "fastify";

import type {
  AlertController
} from "./controller.js";

export interface AlertRoutesOptions {
  controller: AlertController;
}

export async function registerAlertRoutes(
  app: FastifyInstance,
  options: AlertRoutesOptions
): Promise<void> {

  app.get(
    "/alert-rules",
    options.controller.listRules
  );

  app.get(
    "/alert-rules/:id",
    options.controller.getRule
  );

  app.post(
    "/alert-rules",
    options.controller.createRule
  );

  app.patch(
    "/alert-rules/:id",
    options.controller.updateRule
  );

  app.delete(
    "/alert-rules/:id",
    options.controller.deleteRule
  );

  app.get(
    "/alerts/active",
    options.controller.listActiveAlerts
  );

  app.get(
    "/alerts/history",
    options.controller.listAlertHistory
  );

  app.post(
    "/alerts/:id/ack",
    options.controller.acknowledgeAlert
  );

  app.post(
    "/alerts/:id/resolve",
    options.controller.resolveAlert
  );
}
