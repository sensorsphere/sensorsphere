import type { FastifyReply, FastifyRequest } from "fastify";
import { requireAdmin } from "../auth/index.js";
import type {
  DatabaseStorageRepository,
  StorageRelation
} from "./repository.js";

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

    const [summary, policies, chunks, indexes, continuousAggregates] =
      await Promise.all([
        this.repository.getSummary(),
        this.repository.getPolicies(),
        this.repository.getChunks(),
        this.repository.getIndexes(),
        this.repository.getContinuousAggregates()
      ]);

    const relations = await this.repository.getRelations(policies);

    reply.send({
      generatedAt: new Date().toISOString(),
      readOnly: true,
      summary: {
        ...summary,
        relationCount: relations.length,
        hypertableCount: relations.filter(item => item.kind === "hypertable").length,
        chunkCount: chunks.length
      },
      relations,
      chunks,
      indexes,
      policies,
      continuousAggregates,
      recommendations: recommendations(relations)
    });
  };
}
