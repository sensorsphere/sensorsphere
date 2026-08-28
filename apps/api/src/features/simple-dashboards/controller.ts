import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type {
  PostgresSimpleDashboardRepository,
  SimpleDashboardCardRecord,
  SimpleDashboardRecord,
  SimpleDashboardSectionRecord,
  SimpleDashboardTemplateCardRecord,
  SimpleDashboardTemplateRecord,
  SimpleDashboardTemplateSectionRecord
} from "./repository.js";

const uuid = z.string().uuid();
const createDashboardSchema = z.object({
  name: z.string().trim().min(1).max(120)
}).strict();
const renameDashboardSchema = createDashboardSchema;
const createCardSchema = z.object({
  assetMetricId: uuid,
  sectionId: uuid.nullable().optional()
}).strict();
const reorderCardsSchema = z.object({
  cardIds: z.array(uuid).max(500)
}).strict();
const reorderDashboardsSchema = z.object({ dashboardIds: z.array(uuid).max(100) }).strict();
const sectionSchema = z.object({ name: z.string().trim().min(1).max(120) }).strict();
const reorderSectionsSchema = z.object({ sectionIds: z.array(uuid).max(100) }).strict();
const templateCardSchema = z.object({ assetId: uuid, sectionId: uuid }).strict();
const instantiateTemplateSchema = z.object({ metricKeys: z.array(z.string().trim().min(1).max(120)).min(1).max(50) }).strict();

function mapDashboard(row: SimpleDashboardRecord) {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    templateId: row.template_id,
    templateMetricKey: row.template_metric_key,
    templateName: row.template_name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function mapSection(row: SimpleDashboardSectionRecord) {
  return {
    id: row.id,
    dashboardId: row.dashboard_id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function mapCard(row: SimpleDashboardCardRecord) {
  return {
    id: row.id,
    dashboardId: row.dashboard_id,
    sectionId: row.section_id,
    assetMetricId: row.asset_metric_id,
    sortOrder: row.sort_order,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

function mapTemplate(row: SimpleDashboardTemplateRecord) {
  return { id: row.id, name: row.name, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}

function mapTemplateSection(row: SimpleDashboardTemplateSectionRecord) {
  return { id: row.id, templateId: row.template_id, name: row.name, sortOrder: row.sort_order, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}

function mapTemplateCard(row: SimpleDashboardTemplateCardRecord) {
  return { id: row.id, templateId: row.template_id, sectionId: row.section_id, assetId: row.asset_id, sortOrder: row.sort_order, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}

export class SimpleDashboardController {
  constructor(private readonly repository: PostgresSimpleDashboardRepository) {}

  list = async (_request: FastifyRequest, reply: FastifyReply) => {
    const [dashboards, sections, cards] = await Promise.all([
      this.repository.listDashboards(),
      this.repository.listSections(),
      this.repository.listCards()
    ]);
    return reply.send({
      dashboards: dashboards.map(mapDashboard),
      sections: sections.map(mapSection),
      cards: cards.map(mapCard)
    });
  };

  createDashboard = async (
    request: FastifyRequest<{ Body: unknown }>,
    reply: FastifyReply
  ) => {
    const parsed = createDashboardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid dashboard" });
    }
    try {
      const dashboard = await this.repository.createDashboard(parsed.data.name);
      return reply.code(201).send(mapDashboard(dashboard));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") {
        return reply.code(409).send({ error: "Dashboard name already exists" });
      }
      throw error;
    }
  };

  renameDashboard = async (
    request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
    reply: FastifyReply
  ) => {
    const parsedId = uuid.safeParse(request.params.id);
    const parsed = renameDashboardSchema.safeParse(request.body);
    if (!parsedId.success || !parsed.success) {
      return reply.code(400).send({ error: "Invalid dashboard" });
    }
    try {
      const dashboard = await this.repository.renameDashboard(parsedId.data, parsed.data.name);
      if (!dashboard) return reply.code(404).send({ error: "Dashboard not found" });
      return reply.send(mapDashboard(dashboard));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") {
        return reply.code(409).send({ error: "Dashboard name already exists" });
      }
      throw error;
    }
  };

  reorderDashboards = async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
    const parsed = reorderDashboardsSchema.safeParse(request.body);
    if (!parsed.success || new Set(parsed.data.dashboardIds).size !== parsed.data.dashboardIds.length) {
      return reply.code(400).send({ error: "Invalid dashboard order" });
    }
    const updated = await this.repository.reorderDashboards(parsed.data.dashboardIds);
    if (!updated) return reply.code(409).send({ error: "Dashboard order is stale" });
    return reply.send({ status: "updated" });
  };

  createSection = async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) => {
    const parsedId = uuid.safeParse(request.params.id);
    const parsed = sectionSchema.safeParse(request.body);
    if (!parsedId.success || !parsed.success) return reply.code(400).send({ error: "Invalid dashboard section" });
    if (!(await this.repository.dashboardExists(parsedId.data))) return reply.code(404).send({ error: "Dashboard not found" });
    if (!(await this.repository.dashboardIsEditable(parsedId.data))) return reply.code(409).send({ error: "Template instances are read-only" });
    try {
      const section = await this.repository.createSection(parsedId.data, parsed.data.name);
      return reply.code(201).send(mapSection(section));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") return reply.code(409).send({ error: "Section name already exists" });
      throw error;
    }
  };

  renameSection = async (request: FastifyRequest<{ Params: { id: string; sectionId: string }; Body: unknown }>, reply: FastifyReply) => {
    const parsedId = uuid.safeParse(request.params.id);
    const parsedSectionId = uuid.safeParse(request.params.sectionId);
    const parsed = sectionSchema.safeParse(request.body);
    if (!parsedId.success || !parsedSectionId.success || !parsed.success) return reply.code(400).send({ error: "Invalid dashboard section" });
    if (!(await this.repository.dashboardIsEditable(parsedId.data))) return reply.code(409).send({ error: "Template instances are read-only" });
    const section = await this.repository.renameSection(parsedId.data, parsedSectionId.data, parsed.data.name);
    if (!section) return reply.code(404).send({ error: "Dashboard section not found" });
    return reply.send(mapSection(section));
  };

  deleteSection = async (request: FastifyRequest<{ Params: { id: string; sectionId: string } }>, reply: FastifyReply) => {
    const parsedId = uuid.safeParse(request.params.id);
    const parsedSectionId = uuid.safeParse(request.params.sectionId);
    if (!parsedId.success || !parsedSectionId.success) return reply.code(400).send({ error: "Invalid dashboard section" });
    if (!(await this.repository.dashboardIsEditable(parsedId.data))) return reply.code(409).send({ error: "Template instances are read-only" });
    const deleted = await this.repository.deleteSection(parsedId.data, parsedSectionId.data);
    if (!deleted) return reply.code(404).send({ error: "Dashboard section not found" });
    return reply.code(204).send();
  };

  reorderSections = async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) => {
    const parsedId = uuid.safeParse(request.params.id);
    const parsed = reorderSectionsSchema.safeParse(request.body);
    if (!parsedId.success || !parsed.success || new Set(parsed.data.sectionIds).size !== parsed.data.sectionIds.length) return reply.code(400).send({ error: "Invalid section order" });
    if (!(await this.repository.dashboardIsEditable(parsedId.data))) return reply.code(409).send({ error: "Template instances are read-only" });
    const updated = await this.repository.reorderSections(parsedId.data, parsed.data.sectionIds);
    if (!updated) return reply.code(409).send({ error: "Section order is stale" });
    return reply.send({ status: "updated" });
  };

  deleteDashboard = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const parsedId = uuid.safeParse(request.params.id);
    if (!parsedId.success) return reply.code(400).send({ error: "Invalid dashboard" });
    const deleted = await this.repository.deleteDashboard(parsedId.data);
    if (!deleted) return reply.code(404).send({ error: "Dashboard not found" });
    return reply.code(204).send();
  };

  createCard = async (
    request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
    reply: FastifyReply
  ) => {
    const parsedId = uuid.safeParse(request.params.id);
    const parsed = createCardSchema.safeParse(request.body);
    if (!parsedId.success || !parsed.success) {
      return reply.code(400).send({ error: "Invalid dashboard card" });
    }
    const [dashboardExists, metricExists] = await Promise.all([
      this.repository.dashboardExists(parsedId.data),
      this.repository.metricExists(parsed.data.assetMetricId)
    ]);
    if (!dashboardExists) return reply.code(404).send({ error: "Dashboard not found" });
    if (!(await this.repository.dashboardIsEditable(parsedId.data))) return reply.code(409).send({ error: "Template instances are read-only" });
    if (!metricExists) return reply.code(400).send({ error: "Asset metric not found" });

    try {
      const card = await this.repository.createCard(parsedId.data, parsed.data.assetMetricId, parsed.data.sectionId ?? null);
      return reply.code(201).send(mapCard(card));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") {
        return reply.code(409).send({ error: "Metric already exists on this dashboard" });
      }
      throw error;
    }
  };

  updateCard = async (
    request: FastifyRequest<{ Params: { id: string; cardId: string }; Body: unknown }>,
    reply: FastifyReply
  ) => {
    const parsedId = uuid.safeParse(request.params.id);
    const parsedCardId = uuid.safeParse(request.params.cardId);
    const parsed = createCardSchema.safeParse(request.body);
    if (!parsedId.success || !parsedCardId.success || !parsed.success) {
      return reply.code(400).send({ error: "Invalid dashboard card" });
    }
    if (!(await this.repository.dashboardIsEditable(parsedId.data))) return reply.code(409).send({ error: "Template instances are read-only" });
    if (!(await this.repository.metricExists(parsed.data.assetMetricId))) {
      return reply.code(400).send({ error: "Asset metric not found" });
    }
    try {
      const card = await this.repository.updateCard(
        parsedId.data,
        parsedCardId.data,
        parsed.data.assetMetricId,
        parsed.data.sectionId ?? null
      );
      if (!card) return reply.code(404).send({ error: "Dashboard card not found" });
      return reply.send(mapCard(card));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") {
        return reply.code(409).send({ error: "Metric already exists on this dashboard" });
      }
      throw error;
    }
  };

  deleteCard = async (
    request: FastifyRequest<{ Params: { id: string; cardId: string } }>,
    reply: FastifyReply
  ) => {
    const parsedId = uuid.safeParse(request.params.id);
    const parsedCardId = uuid.safeParse(request.params.cardId);
    if (!parsedId.success || !parsedCardId.success) {
      return reply.code(400).send({ error: "Invalid dashboard card" });
    }
    if (!(await this.repository.dashboardIsEditable(parsedId.data))) return reply.code(409).send({ error: "Template instances are read-only" });
    const deleted = await this.repository.deleteCard(parsedId.data, parsedCardId.data);
    if (!deleted) return reply.code(404).send({ error: "Dashboard card not found" });
    return reply.code(204).send();
  };

  reorderCards = async (
    request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
    reply: FastifyReply
  ) => {
    const parsedId = uuid.safeParse(request.params.id);
    const parsed = reorderCardsSchema.safeParse(request.body);
    if (!parsedId.success || !parsed.success) {
      return reply.code(400).send({ error: "Invalid card order" });
    }
    if (new Set(parsed.data.cardIds).size !== parsed.data.cardIds.length) {
      return reply.code(400).send({ error: "Duplicate card ids" });
    }
    if (!(await this.repository.dashboardIsEditable(parsedId.data))) return reply.code(409).send({ error: "Template instances are read-only" });
    const updated = await this.repository.reorderCards(parsedId.data, parsed.data.cardIds);
    if (!updated) return reply.code(409).send({ error: "Card order is stale" });
    return reply.send({ status: "updated" });
  };

  listTemplates = async (_request: FastifyRequest, reply: FastifyReply) => {
    const [templates, sections, cards] = await Promise.all([
      this.repository.listTemplates(),
      this.repository.listTemplateSections(),
      this.repository.listTemplateCards()
    ]);
    return reply.send({
      templates: templates.map(mapTemplate),
      sections: sections.map(mapTemplateSection),
      cards: cards.map(mapTemplateCard)
    });
  };

  createTemplate = async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
    const parsed = createDashboardSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid template" });
    try {
      return reply.code(201).send(mapTemplate(await this.repository.createTemplate(parsed.data.name)));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") return reply.code(409).send({ error: "Template name already exists" });
      throw error;
    }
  };

  renameTemplate = async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) => {
    const parsedId = uuid.safeParse(request.params.id);
    const parsed = createDashboardSchema.safeParse(request.body);
    if (!parsedId.success || !parsed.success) return reply.code(400).send({ error: "Invalid template" });
    const template = await this.repository.renameTemplate(parsedId.data, parsed.data.name);
    if (!template) return reply.code(404).send({ error: "Template not found" });
    return reply.send(mapTemplate(template));
  };

  deleteTemplate = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsedId = uuid.safeParse(request.params.id);
    if (!parsedId.success) return reply.code(400).send({ error: "Invalid template" });
    try {
      const deleted = await this.repository.deleteTemplate(parsedId.data);
      if (!deleted) return reply.code(404).send({ error: "Template not found" });
      return reply.code(204).send();
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23503") return reply.code(409).send({ error: "Template still has dashboard instances" });
      throw error;
    }
  };

  createTemplateSection = async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) => {
    const parsedId = uuid.safeParse(request.params.id);
    const parsed = sectionSchema.safeParse(request.body);
    if (!parsedId.success || !parsed.success) return reply.code(400).send({ error: "Invalid template section" });
    if (!(await this.repository.templateExists(parsedId.data))) return reply.code(404).send({ error: "Template not found" });
    return reply.code(201).send(mapTemplateSection(await this.repository.createTemplateSection(parsedId.data, parsed.data.name)));
  };

  renameTemplateSection = async (request: FastifyRequest<{ Params: { id: string; sectionId: string }; Body: unknown }>, reply: FastifyReply) => {
    const parsedId = uuid.safeParse(request.params.id);
    const parsedSectionId = uuid.safeParse(request.params.sectionId);
    const parsed = sectionSchema.safeParse(request.body);
    if (!parsedId.success || !parsedSectionId.success || !parsed.success) return reply.code(400).send({ error: "Invalid template section" });
    const section = await this.repository.renameTemplateSection(parsedId.data, parsedSectionId.data, parsed.data.name);
    if (!section) return reply.code(404).send({ error: "Template section not found" });
    return reply.send(mapTemplateSection(section));
  };

  deleteTemplateSection = async (request: FastifyRequest<{ Params: { id: string; sectionId: string } }>, reply: FastifyReply) => {
    const parsedId = uuid.safeParse(request.params.id);
    const parsedSectionId = uuid.safeParse(request.params.sectionId);
    if (!parsedId.success || !parsedSectionId.success) return reply.code(400).send({ error: "Invalid template section" });
    const deleted = await this.repository.deleteTemplateSection(parsedId.data, parsedSectionId.data);
    if (!deleted) return reply.code(404).send({ error: "Template section not found" });
    return reply.code(204).send();
  };

  reorderTemplateSections = async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) => {
    const parsedId = uuid.safeParse(request.params.id);
    const parsed = reorderSectionsSchema.safeParse(request.body);
    if (!parsedId.success || !parsed.success || new Set(parsed.data.sectionIds).size !== parsed.data.sectionIds.length) return reply.code(400).send({ error: "Invalid template section order" });
    const updated = await this.repository.reorderTemplateSections(parsedId.data, parsed.data.sectionIds);
    if (!updated) return reply.code(409).send({ error: "Template section order is stale" });
    return reply.send({ status: "updated" });
  };

  reorderTemplateCards = async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) => {
    const parsedId = uuid.safeParse(request.params.id);
    const parsed = reorderCardsSchema.safeParse(request.body);
    if (!parsedId.success || !parsed.success || new Set(parsed.data.cardIds).size !== parsed.data.cardIds.length) return reply.code(400).send({ error: "Invalid template Asset order" });
    const updated = await this.repository.reorderTemplateCards(parsedId.data, parsed.data.cardIds);
    if (!updated) return reply.code(409).send({ error: "Template Asset order is stale" });
    return reply.send({ status: "updated" });
  };


  createTemplateCard = async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) => {
    const parsedId = uuid.safeParse(request.params.id);
    const parsed = templateCardSchema.safeParse(request.body);
    if (!parsedId.success || !parsed.success) return reply.code(400).send({ error: "Invalid template asset" });
    if (!(await this.repository.assetExists(parsed.data.assetId))) return reply.code(400).send({ error: "Asset not found" });
    try {
      return reply.code(201).send(mapTemplateCard(await this.repository.createTemplateCard(parsedId.data, parsed.data.sectionId, parsed.data.assetId)));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") return reply.code(409).send({ error: "Asset already exists in this template" });
      throw error;
    }
  };

  deleteTemplateCard = async (request: FastifyRequest<{ Params: { id: string; cardId: string } }>, reply: FastifyReply) => {
    const parsedId = uuid.safeParse(request.params.id);
    const parsedCardId = uuid.safeParse(request.params.cardId);
    if (!parsedId.success || !parsedCardId.success) return reply.code(400).send({ error: "Invalid template asset" });
    const deleted = await this.repository.deleteTemplateCard(parsedId.data, parsedCardId.data);
    if (!deleted) return reply.code(404).send({ error: "Template asset not found" });
    return reply.code(204).send();
  };

  instantiateTemplate = async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) => {
    const parsedId = uuid.safeParse(request.params.id);
    const parsed = instantiateTemplateSchema.safeParse(request.body);
    if (!parsedId.success || !parsed.success) return reply.code(400).send({ error: "Invalid template instance" });
    const metricKeys = [...new Set(parsed.data.metricKeys)];
    const dashboards = await this.repository.createTemplateInstances(parsedId.data, metricKeys);
    if (dashboards.length === 0) return reply.code(404).send({ error: "Template not found" });
    return reply.code(201).send(dashboards.map(mapDashboard));
  };

  detachDashboard = async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const parsedId = uuid.safeParse(request.params.id);
    if (!parsedId.success) return reply.code(400).send({ error: "Invalid dashboard" });
    const dashboard = await this.repository.detachDashboard(parsedId.data);
    if (!dashboard) return reply.code(409).send({ error: "Dashboard is not a template instance" });
    return reply.send(mapDashboard(dashboard));
  };

}
