import type { FastifyInstance } from "fastify";
import type { GatewayController } from "./controller.js";

export interface GatewayRoutesOptions {
  controller: GatewayController;
}

export async function registerGatewayRoutes(
  app: FastifyInstance,
  options: GatewayRoutesOptions
): Promise<void> {
  app.get("/gateway-types", options.controller.listGatewayTypes);
  app.post("/gateway-types", options.controller.createGatewayType);
  app.patch("/gateway-types/:id", options.controller.updateGatewayType);
  app.delete("/gateway-types/:id", options.controller.deleteGatewayType);
  app.get("/gateways", options.controller.listGateways);
  app.get("/gateways/:id", options.controller.getGateway);
  app.post("/gateways", options.controller.createGateway);
  app.patch("/gateways/:id", options.controller.updateGateway);
  app.delete("/gateways/:id", options.controller.deleteGateway);
}
