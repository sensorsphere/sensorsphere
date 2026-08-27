import type { FastifyInstance } from "fastify";
import type { SimpleDashboardController } from "./controller.js";

export async function registerSimpleDashboardRoutes(
  app: FastifyInstance,
  options: { controller: SimpleDashboardController }
): Promise<void> {
  app.get("/simple-dashboards", options.controller.list);
  app.post("/simple-dashboards", options.controller.createDashboard);
  app.patch("/simple-dashboards/:id", options.controller.renameDashboard);
  app.put("/simple-dashboards/order", options.controller.reorderDashboards);
  app.delete("/simple-dashboards/:id", options.controller.deleteDashboard);
  app.post("/simple-dashboards/:id/sections", options.controller.createSection);
  app.patch("/simple-dashboards/:id/sections/:sectionId", options.controller.renameSection);
  app.delete("/simple-dashboards/:id/sections/:sectionId", options.controller.deleteSection);
  app.put("/simple-dashboards/:id/sections/order", options.controller.reorderSections);
  app.post("/simple-dashboards/:id/cards", options.controller.createCard);
  app.patch("/simple-dashboards/:id/cards/:cardId", options.controller.updateCard);
  app.delete("/simple-dashboards/:id/cards/:cardId", options.controller.deleteCard);
  app.put("/simple-dashboards/:id/cards/order", options.controller.reorderCards);
}
