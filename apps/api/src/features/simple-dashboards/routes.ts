import type { FastifyInstance } from "fastify";
import type { SimpleDashboardController } from "./controller.js";

export async function registerSimpleDashboardRoutes(
  app: FastifyInstance,
  options: { controller: SimpleDashboardController }
): Promise<void> {
  app.get("/simple-dashboards", options.controller.list);
  app.post("/simple-dashboards", options.controller.createDashboard);
  app.patch("/simple-dashboards/:id", options.controller.renameDashboard);
  app.delete("/simple-dashboards/:id", options.controller.deleteDashboard);
  app.post("/simple-dashboards/:id/cards", options.controller.createCard);
  app.delete("/simple-dashboards/:id/cards/:cardId", options.controller.deleteCard);
  app.put("/simple-dashboards/:id/cards/order", options.controller.reorderCards);
}
