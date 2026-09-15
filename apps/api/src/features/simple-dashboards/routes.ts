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
  app.post("/simple-dashboards/:id/detach", options.controller.detachDashboard);
  app.post("/simple-dashboards/:id/convert-to-template", options.controller.convertDashboardToTemplate);
  app.post("/simple-dashboards/:id/sections", options.controller.createSection);
  app.patch("/simple-dashboards/:id/sections/:sectionId", options.controller.renameSection);
  app.delete("/simple-dashboards/:id/sections/:sectionId", options.controller.deleteSection);
  app.put("/simple-dashboards/:id/sections/order", options.controller.reorderSections);
  app.post("/simple-dashboards/:id/cards", options.controller.createCard);
  app.post("/simple-dashboards/:id/entity-cards", options.controller.createEntityCard);
  app.delete("/simple-dashboards/:id/entity-cards/:cardId", options.controller.deleteEntityCard);
  app.patch("/simple-dashboards/:id/cards/:cardId", options.controller.updateCard);
  app.delete("/simple-dashboards/:id/cards/:cardId", options.controller.deleteCard);
  app.put("/simple-dashboards/:id/cards/order", options.controller.reorderCards);

  app.get("/simple-dashboard-templates", options.controller.listTemplates);
  app.post("/simple-dashboard-templates", options.controller.createTemplate);
  app.patch("/simple-dashboard-templates/:id", options.controller.renameTemplate);
  app.delete("/simple-dashboard-templates/:id", options.controller.deleteTemplate);
  app.post("/simple-dashboard-templates/:id/sections", options.controller.createTemplateSection);
  app.put("/simple-dashboard-templates/:id/sections/order", options.controller.reorderTemplateSections);
  app.patch("/simple-dashboard-templates/:id/sections/:sectionId", options.controller.renameTemplateSection);
  app.delete("/simple-dashboard-templates/:id/sections/:sectionId", options.controller.deleteTemplateSection);
  app.post("/simple-dashboard-templates/:id/cards", options.controller.createTemplateCard);
  app.put("/simple-dashboard-templates/:id/cards/order", options.controller.reorderTemplateCards);
  app.delete("/simple-dashboard-templates/:id/cards/:cardId", options.controller.deleteTemplateCard);
  app.post("/simple-dashboard-templates/:id/instances", options.controller.instantiateTemplate);
}
