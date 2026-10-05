import type { FastifyReply, FastifyRequest } from "fastify";

import { requireAdmin } from "../auth/index.js";
import {
  RETENTION_DEFINITIONS,
  readBackupSafetyStatus,
  retentionDefinition,
  retentionError,
  retentionManagementSettings,
  retentionRisk,
  validateRetentionSeconds,
  type RetentionPolicyKey
} from "./retention.js";
import {
  DatabaseRetentionRepository,
  type ManagedRetentionPolicy,
  type RetentionActor
} from "./retention-repository.js";

const REQUIRED_CONFIRMATION = "APPLY RETENTION";

function requestActor(request: FastifyRequest): RetentionActor {
  const session = (
    request as FastifyRequest & {
      sensorSphereUser?: { id?: string; role?: string };
    }
  ).sensorSphereUser;
  const devRole = request.headers["x-sensorsphere-dev-role"];

  return {
    userId:
      typeof session?.id === "string"
        ? session.id
        : null,
    role:
      typeof session?.role === "string"
        ? session.role
        : devRole === "admin" || devRole === "user"
          ? devRole
          : "admin"
  };
}

function validateBodyKeys(
  body: Record<string, unknown>,
  allowed: string[]
): void {
  const unexpected = Object.keys(body).filter(
    key => !allowed.includes(key)
  );
  if (unexpected.length > 0) {
    throw retentionError(
      400,
      "Unsupported request fields: " + unexpected.join(", ")
    );
  }
}

function currentPolicy(
  policies: ManagedRetentionPolicy[],
  key: RetentionPolicyKey
): ManagedRetentionPolicy {
  const policy = policies.find(candidate => candidate.key === key);
  if (!policy) {
    throw retentionError(404, "Retention policy configuration not found");
  }
  return policy;
}

function sameNullableNumber(
  left: number | null,
  right: unknown
): boolean {
  if (left === null) return right === null;
  return typeof right === "number" && right === left;
}

export class DatabaseRetentionController {
  constructor(
    private readonly repository: DatabaseRetentionRepository
  ) {}

  state = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    requireAdmin(request);
    const settings = retentionManagementSettings();
    const [policies, backupSafety] = await Promise.all([
      this.repository.getManagedPolicies(),
      readBackupSafetyStatus(
        settings.backupStatePath,
        settings.backupMaxAgeHours,
        true
      )
    ]);

    reply.send({
      generatedAt: new Date().toISOString(),
      requiredConfirmation: REQUIRED_CONFIRMATION,
      backupSafety: {
        ...backupSafety,
        required: false,
        requiredFor: "DESTRUCTIVE"
      },
      policies: RETENTION_DEFINITIONS.map(definition => {
        const policy = currentPolicy(policies, definition.key);
        return {
          ...definition,
          ...policy
        };
      })
    });
  };

  preview = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    requireAdmin(request);
    const body =
      request.body && typeof request.body === "object"
        ? request.body as Record<string, unknown>
        : {};

    validateBodyKeys(body, ["policyKey", "retentionSeconds"]);

    const definition = retentionDefinition(body.policyKey);
    const requestedSeconds = validateRetentionSeconds(
      definition,
      body.retentionSeconds
    );
    const policies = await this.repository.getManagedPolicies();
    const policy = currentPolicy(policies, definition.key);
    const risk = retentionRisk(policy.actualSeconds, requestedSeconds);
    const impact = await this.repository.previewImpact(
      definition,
      policy.actualSeconds,
      requestedSeconds,
      risk
    );
    const settings = retentionManagementSettings();
    const backupSafety = await readBackupSafetyStatus(
      settings.backupStatePath,
      settings.backupMaxAgeHours,
      risk === "DESTRUCTIVE"
    );

    const changed = policy.actualSeconds !== requestedSeconds;
    const warnings = [...definition.notes];

    if (!policy.inSync) {
      warnings.push(
        "Configured retention and effective runtime policy differ; apply will reconcile them."
      );
    }

    if (
      definition.key === "observations" &&
      risk === "DESTRUCTIVE"
    ) {
      warnings.push(
        "DB-4 history routing is not complete; shortening raw observations can reduce the historical range available to current API queries."
      );
    }

    if (
      definition.mechanism === "application" &&
      risk === "DESTRUCTIVE"
    ) {
      warnings.push(
        "Expired rows will be deleted by the ingestion service on its next hourly retention pass; PostgreSQL relation files normally do not shrink immediately."
      );
    }

    reply.send({
      generatedAt: new Date().toISOString(),
      policy: {
        ...definition,
        ...policy
      },
      requestedSeconds,
      risk,
      changed,
      impact,
      backupSafety,
      warnings,
      requiredConfirmation: changed ? REQUIRED_CONFIRMATION : null,
      canApply:
        changed &&
        (risk !== "DESTRUCTIVE" || backupSafety.ok)
    });
  };

  apply = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    requireAdmin(request);
    const body =
      request.body && typeof request.body === "object"
        ? request.body as Record<string, unknown>
        : {};

    validateBodyKeys(body, [
      "policyKey",
      "retentionSeconds",
      "expectedCurrentSeconds",
      "confirmation"
    ]);

    const definition = retentionDefinition(body.policyKey);
    const requestedSeconds = validateRetentionSeconds(
      definition,
      body.retentionSeconds
    );
    const policies = await this.repository.getManagedPolicies();
    const policy = currentPolicy(policies, definition.key);

    if (
      !sameNullableNumber(
        policy.actualSeconds,
        body.expectedCurrentSeconds
      )
    ) {
      throw retentionError(
        409,
        "Retention policy changed since preview; refresh and preview again"
      );
    }

    if (policy.actualSeconds === requestedSeconds) {
      throw retentionError(409, "Retention policy is already at the requested value");
    }

    if (body.confirmation !== REQUIRED_CONFIRMATION) {
      throw retentionError(
        400,
        "Confirmation text must exactly match " + REQUIRED_CONFIRMATION
      );
    }

    const risk = retentionRisk(policy.actualSeconds, requestedSeconds);
    const impact = await this.repository.previewImpact(
      definition,
      policy.actualSeconds,
      requestedSeconds,
      risk
    );
    const settings = retentionManagementSettings();
    const backupSafety = await readBackupSafetyStatus(
      settings.backupStatePath,
      settings.backupMaxAgeHours,
      risk === "DESTRUCTIVE"
    );

    if (risk === "DESTRUCTIVE" && !backupSafety.ok) {
      throw retentionError(
        409,
        backupSafety.reason ||
          "A recent verified Recovery Point is required before destructive retention changes"
      );
    }

    const preview = {
      generatedAt: new Date().toISOString(),
      requestedSeconds,
      risk,
      impact,
      backupSafety
    };

    await this.repository.applyPolicy({
      definition,
      previousSeconds: policy.actualSeconds,
      requestedSeconds,
      risk,
      actor: requestActor(request),
      preview
    });

    const updated = currentPolicy(
      await this.repository.getManagedPolicies(),
      definition.key
    );

    reply.send({
      status: "APPLIED",
      policyKey: definition.key,
      previousRetentionSeconds: policy.actualSeconds,
      requestedRetentionSeconds: requestedSeconds,
      risk,
      impact,
      backupSafety,
      effective: updated
    });
  };

  audit = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    requireAdmin(request);
    const query =
      request.query && typeof request.query === "object"
        ? request.query as Record<string, unknown>
        : {};
    const parsedLimit = Number(query.limit ?? 100);
    const limit =
      Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.trunc(parsedLimit)
        : 100;

    reply.send(await this.repository.getAudit(limit));
  };
}
