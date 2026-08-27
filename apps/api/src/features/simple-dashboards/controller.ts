import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type {
  PostgresSimpleDashboardRepository,
  SimpleDashboardCardRecord,
  SimpleDashboardRecord,
  SimpleDashboardSectionRecord
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

function mapDashboard(row: SimpleDashboardRecord) {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
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
    const section = await this.repository.renameSection(parsedId.data, parsedSectionId.data, parsed.data.name);
    if (!section) return reply.code(404).send({ error: "Dashboard section not found" });
    return reply.send(mapSection(section));
  };

  deleteSection = async (request: FastifyRequest<{ Params: { id: string; sectionId: string } }>, reply: FastifyReply) => {
    const parsedId = uuid.safeParse(request.params.id);
    const parsedSectionId = uuid.safeParse(request.params.sectionId);
    if (!parsedId.success || !parsedSectionId.success) return reply.code(400).send({ error: "Invalid dashboard section" });
    const deleted = await this.repository.deleteSection(parsedId.data, parsedSectionId.data);
    if (!deleted) return reply.code(404).send({ error: "Dashboard section not found" });
    return reply.code(204).send();
  };

  reorderSections = async (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) => {
    const parsedId = uuid.safeParse(request.params.id);
    const parsed = reorderSectionsSchema.safeParse(request.body);
    if (!parsedId.success || !parsed.success || new Set(parsed.data.sectionIds).size !== parsed.data.sectionIds.length) return reply.code(400).send({ error: "Invalid section order" });
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
    const updated = await this.repository.reorderCards(parsedId.data, parsed.data.cardIds);
    if (!updated) return reply.code(409).send({ error: "Card order is stale" });
    return reply.send({ status: "updated" });
  };
}
