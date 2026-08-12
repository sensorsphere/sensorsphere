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

const assetIdSchema =
  z.string().uuid();

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
      z.boolean().optional()
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
      z.number().int().positive().optional()
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

      if (
        result.status ===
        "external_id_conflict"
      ) {
        await reply
          .code(409)
          .send({
            error:
              "Asset external id already exists"
          });
        return;
      }

      await reply
        .code(201)
        .send(result.asset);
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
