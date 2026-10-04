import type { FastifyReply, FastifyRequest } from "fastify";
import { requireAdmin } from "../auth/index.js";
import type {
  DatabaseStorageRepository,
  StorageRelation
} from "./repository.js";
import {
  calculateStorageAnalytics,
  storageBudgetFromEnv
} from "./analytics.js";
import { databaseStorageSettings } from "./settings.js";

type Recommendation = {
  level: "INFO" | "REVIEW" | "WARNING";
  code: string;
  relation: string | null;
  message: string;
};

function recommendations(relations: StorageRelation[]): Recommendation[] {
  const result: Recommendation[] = [];

  for (const relation of relations) {
    if (
      relation.kind === "hypertable" &&
      relation.totalBytes >= 100 * 1024 * 1024 &&
      relation.compressionEnabled === false
    ) {
      result.push({
        level: "REVIEW",
        code: "compression-disabled",
        relation: relation.name,
        message: `${relation.name} uses significant storage with Timescale compression disabled.`
      });
    }

    if (
      relation.dataBytes > 0 &&
      relation.indexBytes > relation.dataBytes &&
      relation.indexBytes >= 100 * 1024 * 1024
    ) {
      result.push({
        level: "REVIEW",
        code: "indexes-larger-than-data",
        relation: relation.name,
        message: `${relation.name} indexes are larger than its table data.`
      });
    }

    if (
      relation.deadRows !== null &&
      relation.liveRows !== null &&
      relation.deadRows >= 100_000 &&
      relation.deadRows / Math.max(relation.liveRows + relation.deadRows, 1) >= 0.1
    ) {
      result.push({
        level: "INFO",
        code: "dead-tuples",
        relation: relation.name,
        message: `${relation.name} currently has a notable dead-tuple ratio; allocated size may reflect a PostgreSQL high-water mark.`
      });
    }

    if (
      relation.kind === "hypertable" &&
      relation.retention === null &&
      relation.totalBytes >= 100 * 1024 * 1024
    ) {
      result.push({
        level: "REVIEW",
        code: "retention-undefined",
        relation: relation.name,
        message: `${relation.name} has no detected Timescale retention policy.`
      });
    }
  }

  return result;
}

export class DatabaseStorageController {
  constructor(private readonly repository: DatabaseStorageRepository) {}

  report = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    requireAdmin(request);

    const generatedAt = new Date().toISOString();
    const settings = databaseStorageSettings();
    const [summary, policies, chunks, indexes, continuousAggregates, history] =
      await Promise.all([
        this.repository.getSummary(),
        this.repository.getPolicies(),
        this.repository.getChunks(),
        this.repository.getIndexes(),
        this.repository.getContinuousAggregates(),
        this.repository.getHistory(settings.snapshotRetentionDays)
      ]);

    const relations = await this.repository.getRelations(policies);
    const analytics = calculateStorageAnalytics(
      summary.databaseBytes,
      generatedAt,
      history,
      storageBudgetFromEnv(summary.databaseBytes)
    );
    const reportRecommendations = recommendations(relations);

    if (analytics.budget.configurationError) {
      reportRecommendations.unshift({
        level: "WARNING",
        code: "storage-budget-invalid",
        relation: null,
        message: analytics.budget.configurationError
      });
    }

    if (
      analytics.projection.bytes30d !== null &&
      analytics.budget.warningBytes !== null &&
      analytics.projection.bytes30d >= analytics.budget.warningBytes &&
      analytics.budget.status === "OK"
    ) {
      reportRecommendations.unshift({
        level: "WARNING",
        code: "projected-budget-warning",
        relation: null,
        message: "Current measured growth projects the database above the warning storage budget within 30 days."
      });
    }

    reply.send({
      generatedAt,
      readOnly: true,
      snapshot: settings,
      summary: {
        ...summary,
        relationCount: relations.length,
        hypertableCount: relations.filter(item => item.kind === "hypertable").length,
        chunkCount: chunks.length
      },
      analytics,
      history,
      relations,
      chunks,
      indexes,
      policies,
      continuousAggregates,
      recommendations: reportRecommendations
    });
  };
}
