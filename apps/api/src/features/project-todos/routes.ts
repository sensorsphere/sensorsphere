import type { FastifyInstance } from "fastify";
import type { ProjectTodoController } from "./controller.js";

export async function registerProjectTodoRoutes(
  app: FastifyInstance,
  options: { controller: ProjectTodoController }
): Promise<void> {
  app.get("/project-todos", options.controller.list);
  app.post("/project-todos/sections", options.controller.createSection);
  app.patch("/project-todos/sections/:id", options.controller.updateSection);
  app.delete("/project-todos/sections/:id", options.controller.deleteSection);
  app.post("/project-todos/tasks", options.controller.createTask);
  app.patch("/project-todos/tasks/:id", options.controller.updateTask);
  app.delete("/project-todos/tasks/:id", options.controller.deleteTask);
  app.get("/project-todos/export", options.controller.exportMarkdown);
  app.post("/project-todos/import", options.controller.importMarkdown);
}
