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
