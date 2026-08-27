import type {
  FastifyReply,
  FastifyRequest
} from "fastify";

import { z } from "zod";

import type {
  AssetService
} from "./service.js";

import {
  badRequest,
  notFound,
  ok
} from "../../shared/http/index.js";

interface AssetParams {
  id: string;
}

interface AssetMetricParams {
  id: string;
  metricId: string;
}

interface MetricQualityPolicyParams {
  metricKey: string;
}

const assetIdSchema =
  z.string().uuid();

const metricIdSchema =
  z.string().uuid();

const finiteNumberSchema =
  z.number().finite();

const metricQualitySchema =
  z.union(
    [
      z.object({
        mode: z.literal("NONE")
      }).strict(),

      z.object({
        mode:
          z.literal(
            "HIGHER_IS_BETTER"
          ),
        warning:
          finiteNumberSchema,
        good:
          finiteNumberSchema
      })
      .strict()
      .refine(
        value =>
          value.warning <
          value.good,
        {
          message:
            "warning must be lower than good"
        }
      ),

      z.object({
        mode:
          z.literal(
            "LOWER_IS_BETTER"
          ),
        good:
          finiteNumberSchema,
        warning:
          finiteNumberSchema
      })
      .strict()
      .refine(
        value =>
          value.good <
          value.warning,
        {
          message:
            "good must be lower than warning"
        }
      ),

      z.object({
        mode: z.literal("RANGE"),
        criticalMin:
          finiteNumberSchema,
        warningMin:
          finiteNumberSchema,
        warningMax:
          finiteNumberSchema,
        criticalMax:
          finiteNumberSchema
      })
      .strict()
      .refine(
        value =>
          value.criticalMin <
            value.warningMin &&
          value.warningMin <=
            value.warningMax &&
          value.warningMax <
            value.criticalMax,
        {
          message:
            "Expected criticalMin < warningMin <= warningMax < criticalMax"
        }
      )
    ]
  );

const createAssetSchema =
  z.object({
    externalId:
      z.string().trim().min(1).max(255),

    name:
      z.string().trim().min(1).max(255)
        .nullable()
        .optional(),

    description:
      z.string().trim().max(2000)
        .nullable()
        .optional(),

    manufacturer:
      z.string().trim().max(255)
        .nullable()
        .optional(),

    model:
      z.string().trim().max(255)
        .nullable()
        .optional(),

    firmwareVersion:
      z.string().trim().max(255)
        .nullable()
        .optional(),

    assetType:
      z.string().trim().min(1).max(100),

    protocol:
      z.string().trim().max(100)
        .nullable()
        .optional(),

    enabled:
      z.boolean().optional(),

    tags:
      z.array(z.string().trim().min(1).max(100)).max(50).optional()
  })
  .strict();

const updateAssetSchema =
  z.object({
    externalId:
      z.string().trim().min(1).max(255)
        .optional(),

    name:
      z.string().trim().min(1).max(255)
        .nullable()
        .optional(),

    description:
      z.string().trim().max(2000)
        .nullable()
        .optional(),

    manufacturer:
      z.string().trim().max(255)
        .nullable()
        .optional(),

    model:
      z.string().trim().max(255)
        .nullable()
        .optional(),

    firmwareVersion:
      z.string().trim().max(255)
        .nullable()
        .optional(),

    assetType:
      z.string().trim().min(1).max(100)
        .optional(),

    protocol:
      z.string().trim().max(100)
        .nullable()
        .optional(),

    enabled:
      z.boolean().optional(),

    warningAfterSeconds:
      z.number().int().positive().optional(),

    offlineAfterSeconds:
      z.number().int().positive().optional(),

    tags:
      z.array(z.string().trim().min(1).max(100)).max(50).optional()
  })
  .strict()
  .refine(
    value =>
      Object.keys(value).length > 0,
    {
      message: "At least one field must be provided"
    }
  );

const assignAssetLocationSchema =
  z.object({
    locationId:
      z.string().uuid().nullable()
  })
  .strict();

export class AssetController {

  constructor(
    private readonly service:
      AssetService
  ) {}

  listAssets =
    async (
      _request: FastifyRequest,
      reply: FastifyReply
    ): Promise<void> => {

      const assets =
        await this.service.listAssets();

      await ok(reply, assets);
    };

  createAsset =
    async (
      request:
        FastifyRequest<{
          Body: unknown;
        }>,
      reply: FastifyReply
    ): Promise<void> => {

      const parsedBody =
        createAssetSchema.safeParse(
          request.body
        );

      if (!parsedBody.success) {
        await badRequest(
          reply,
          parsedBody.error.issues[0]?.message
            ?? "Invalid asset payload"
        );
        return;
      }

      const result =
        await this.service.createAsset(
          parsedBody.data
        );

      switch (result.status) {
        case "created":
          await reply.code(201).send(result.asset);
          return;
        case "external_id_conflict":
          await reply.code(409).send({ error: "Asset external id already exists" });
          return;
        case "invalid_asset_type":
          await badRequest(reply, "Unknown asset type");
          return;
        case "invalid_manufacturer":
          await badRequest(reply, "Unknown manufacturer");
          return;
        case "invalid_tags":
          await badRequest(reply, "Unknown tag");
          return;
      }
    };

  updateAsset =
    async (
      request:
        FastifyRequest<{
          Params: {
            id: string;
          };
          Body: unknown;
        }>,
      reply: FastifyReply
    ): Promise<void> => {

      const parsedId =
        assetIdSchema.safeParse(
          request.params.id
        );

      if (!parsedId.success) {
        await badRequest(
          reply,
          "Invalid asset id"
        );
        return;
      }

      const parsedBody =
        updateAssetSchema.safeParse(
          request.body
        );

      if (!parsedBody.success) {
        await badRequest(
          reply,
          parsedBody.error.issues[0]?.message
            ?? "Invalid asset payload"
        );
        return;
      }

      const result =
        await this.service.updateAsset(
          parsedId.data,
          parsedBody.data
        );

      switch (result.status) {
        case "updated":
          await ok(
            reply,
            result.asset
          );
          return;

        case "asset_not_found":
          await notFound(
            reply,
            "Asset not found"
          );
          return;

        case "external_id_conflict":
          await reply
            .code(409)
            .send({
              error:
                "Asset external id already exists"
            });
          return;

        case "invalid_health_thresholds":
          await badRequest(
            reply,
            "warningAfterSeconds must be lower than offlineAfterSeconds"
          );
          return;

        case "invalid_asset_type":
          await badRequest(reply, "Unknown asset type");
          return;

        case "invalid_manufacturer":
          await badRequest(reply, "Unknown manufacturer");
          return;

        case "invalid_tags":
          await badRequest(reply, "Unknown tag");
          return;
      }
    };

  assignAssetLocation =
    async (
      request:
        FastifyRequest<{
          Params: {
            id: string;
          };
          Body: unknown;
        }>,
      reply: FastifyReply
    ): Promise<void> => {

      const parsedId =
        assetIdSchema.safeParse(
          request.params.id
        );

      if (!parsedId.success) {
        await badRequest(
          reply,
          "Invalid asset id"
        );
        return;
      }

      const parsedBody =
        assignAssetLocationSchema.safeParse(
          request.body
        );

      if (!parsedBody.success) {
        await badRequest(
          reply,
          parsedBody.error.issues[0]?.message
            ?? "Invalid location assignment payload"
        );
        return;
      }

      const result =
        await this.service.assignAssetLocation(
          parsedId.data,
          parsedBody.data.locationId
        );

      switch (result.status) {
        case "updated":
          await ok(
            reply,
            result.asset
          );
          return;

        case "asset_not_found":
          await notFound(
            reply,
            "Asset not found"
          );
          return;

        case "location_not_found":
          await notFound(
            reply,
            "Location not found"
          );
          return;
      }
    };

  updateMetricQuality =
    async (
      request:
        FastifyRequest<{
          Params: AssetMetricParams;
          Body: unknown;
        }>,
      reply: FastifyReply
    ): Promise<void> => {

      const parsedAssetId =
        assetIdSchema.safeParse(
          request.params.id
        );

      if (!parsedAssetId.success) {
        await badRequest(
          reply,
          "Invalid asset id"
        );
        return;
      }

      const parsedMetricId =
        metricIdSchema.safeParse(
          request.params.metricId
        );

      if (!parsedMetricId.success) {
        await badRequest(
          reply,
          "Invalid metric id"
        );
        return;
      }

      const parsedBody =
        metricQualitySchema.safeParse(
          request.body
        );

      if (!parsedBody.success) {
        await badRequest(
          reply,
          parsedBody.error.issues[0]
            ?.message
            ?? "Invalid metric quality configuration"
        );
        return;
      }

      const result =
        await this.service
          .updateMetricQuality(
            parsedAssetId.data,
            parsedMetricId.data,
            parsedBody.data
          );

      switch (result.status) {
        case "updated":
          await ok(
            reply,
            result.metric
          );
          return;

        case "asset_not_found":
          await notFound(
            reply,
            "Asset not found"
          );
          return;

        case "metric_not_found":
          await notFound(
            reply,
            "Metric not found"
          );
          return;
      }
    };

  resetMetricQuality = async (request: FastifyRequest<{ Params: AssetMetricParams }>, reply: FastifyReply): Promise<void> => {
    const assetId = assetIdSchema.safeParse(request.params.id);
    const metricId = metricIdSchema.safeParse(request.params.metricId);
    if (!assetId.success || !metricId.success) { await badRequest(reply, "Invalid asset or metric id"); return; }
    const result = await this.service.resetMetricQuality(assetId.data, metricId.data);
    if (result.status === "updated") { await ok(reply, result.metric); return; }
    await notFound(reply, result.status === "asset_not_found" ? "Asset not found" : "Metric not found");
  };

  updateGlobalMetricQuality = async (request: FastifyRequest<{ Params: MetricQualityPolicyParams; Body: unknown }>, reply: FastifyReply): Promise<void> => {
    const metricKey = request.params.metricKey.trim().toLowerCase();
    if (!metricKey || metricKey.length > 255) { await badRequest(reply, "Invalid metric key"); return; }
    const parsedBody = metricQualitySchema.safeParse(request.body);
    if (!parsedBody.success) { await badRequest(reply, parsedBody.error.issues[0]?.message ?? "Invalid metric quality configuration"); return; }
    await ok(reply, await this.service.updateGlobalMetricQuality(metricKey, parsedBody.data));
  };

  deleteAsset =
    async (
      request:
        FastifyRequest<{
          Params: {
            id: string;
          };
        }>,
      reply: FastifyReply
    ): Promise<void> => {

      const parsedId =
        assetIdSchema.safeParse(
          request.params.id
        );

      if (!parsedId.success) {
        await badRequest(
          reply,
          "Invalid asset id"
        );
        return;
      }

      const result =
        await this.service.deleteAsset(
          parsedId.data
        );

      switch (result.status) {
        case "deleted":
          await reply
            .code(204)
            .send();
          return;

        case "asset_not_found":
          await notFound(
            reply,
            "Asset not found"
          );
          return;

        case "has_metrics":
          await reply
            .code(409)
            .send({
              error:
                "Asset contains metrics"
            });
          return;
      }
    };

  getAsset =
    async (
      request:
        FastifyRequest<{
          Params: AssetParams;
        }>,
      reply: FastifyReply
    ): Promise<void> => {

      const parsedId =
        assetIdSchema.safeParse(
          request.params.id
        );

      if (!parsedId.success) {
        await badRequest(
          reply,
          "Invalid asset id"
        );
        return;
      }

      const asset =
        await this.service.getAsset(
          parsedId.data
        );

      if (!asset) {
        await notFound(
          reply,
          "Asset not found"
        );
        return;
      }

      await ok(reply, asset);
    };
}
