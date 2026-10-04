import type { FastifyReply, FastifyRequest } from "fastify";
import { requireAdmin } from "../auth/index.js";
import type {
  DatabaseStorageRepository,
  StorageChunk,
  StoragePolicy,
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

function recommendations(
  relations: StorageRelation[],
  policies: StoragePolicy[],
  chunks: StorageChunk[]
): Recommendation[] {
  const result: Recommendation[] = [];
  const validatedCompressionCandidates = new Set([
    "observations",
    "gateway_device_ble_observations",
    "measurements"
  ]);
  const compressionPolicyRelations = new Set(
    policies
      .filter(policy => policy.kind === "compression" && policy.relationName)
      .map(policy => policy.relationName!)
  );
  const chunkCounts = new Map<
    string,
    { total: number; compressed: number }
  >();

  for (const chunk of chunks) {
    const current = chunkCounts.get(chunk.hypertableName) ?? {
      total: 0,
      compressed: 0
    };
    current.total += 1;
    if (chunk.compressed) current.compressed += 1;
    chunkCounts.set(chunk.hypertableName, current);
  }

  for (const relation of relations) {
    if (
      relation.kind === "hypertable" &&
      relation.totalBytes >= 100 * 1024 * 1024 &&
      relation.compressionEnabled === false
    ) {
      result.push({
        level: "REVIEW",
        code: validatedCompressionCandidates.has(relation.name)
          ? "compression-validated-candidate"
          : "compression-disabled",
        relation: relation.name,
        message: validatedCompressionCandidates.has(relation.name)
          ? `${relation.name} is a validated DB-2 compression candidate; representative DEV chunks were reduced by about 97% while tested history queries showed no regression.`
          : `${relation.name} uses significant storage with Timescale compression disabled.`
      });
    }

    if (
      relation.kind === "hypertable" &&
      relation.compressionEnabled === true &&
      validatedCompressionCandidates.has(relation.name)
    ) {
      const counts = chunkCounts.get(relation.name) ?? {
        total: relation.chunks ?? 0,
        compressed: 0
      };

      if (!compressionPolicyRelations.has(relation.name)) {
        result.push({
          level: "REVIEW",
          code: "compression-policy-missing",
          relation: relation.name,
          message: `${relation.name} has compression enabled but no recurring compression policy was detected.`
        });
      } else {
        result.push({
          level: "INFO",
          code: "compression-policy-active",
          relation: relation.name,
          message: `${relation.name} compression policy is active with a 7-day threshold; ${counts.compressed}/${counts.total} chunks are currently compressed.`
        });
      }
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

    if (
      relation.kind === "table" &&
      (relation.name === "gateway_traffic_events" ||
        relation.name === "metric_routing_events") &&
      relation.totalBytes >= 100 * 1024 * 1024
    ) {
      result.push({
        level: "REVIEW",
        code: "event-row-delete-retention",
        relation: relation.name,
        message: `${relation.name} still uses row-by-row 48-hour retention. The DB-2 one-hour hypertable prototype reclaimed expired physical storage immediately with chunk drop and no dead-tuple accumulation.`
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
    const [
      summary,
      policies,
      chunks,
      indexes,
      indexStats,
      continuousAggregates,
      history
    ] = await Promise.all([
      this.repository.getSummary(),
      this.repository.getPolicies(),
      this.repository.getChunks(),
      this.repository.getIndexes(),
      this.repository.getIndexStatsWindow(),
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
    const reportRecommendations = recommendations(
      relations,
      policies,
      chunks
    );

    if (!indexStats.mature) {
      reportRecommendations.push({
        level: "INFO",
        code: "index-observation-window-short",
        relation: null,
        message: `Index usage counters cover only ${indexStats.ageDays.toFixed(1)} days; DB-2 requires at least ${indexStats.minimumObservationDays} days before an index can be classified as low observed usage.`
      });
    }

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
      indexStats,
      policies,
      continuousAggregates,
      recommendations: reportRecommendations
    });
  };
}
