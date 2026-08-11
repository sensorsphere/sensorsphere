import type {
  FastifyReply,
  FastifyRequest
} from "fastify";

import { z } from "zod";

import type {
  LocationService
} from "./service.js";

import {
  badRequest,
  ok
} from "../../shared/http/index.js";

const createLocationSchema =
  z.object({
    parentId:
      z.string().uuid().nullable().optional(),

    type:
      z.enum([
        "SITE",
        "BUILDING",
        "FLOOR",
        "ROOM",
        "ZONE",
        "AREA",
        "OTHER"
      ]),

    name:
      z.string().trim().min(1).max(200),

    description:
      z.string().trim().max(2000).nullable().optional(),

    metadata:
      z.record(z.string(), z.unknown()).optional()
  })
  .strict();

export class LocationController {

  constructor(
    private readonly service:
      LocationService
  ) {}

  listLocations =
    async (
      _request: FastifyRequest,
      reply: FastifyReply
    ): Promise<void> => {

      const locations =
        await this.service.listLocations();

      await ok(reply, locations);
    };

  getLocationById =
    async (
      request: FastifyRequest<{
        Params: {
          id: string;
        };
      }>,
      reply: FastifyReply
    ): Promise<void> => {

      const location =
        await this.service.getLocationById(
          request.params.id
        );

      if (!location) {
        await reply
          .code(404)
          .send({
            error: "Location not found"
          });

        return;
      }

      await ok(reply, location);
    };

  createLocation =
    async (
      request: FastifyRequest<{
        Body: unknown;
      }>,
      reply: FastifyReply
    ): Promise<void> => {

      const parsedBody =
        createLocationSchema.safeParse(
          request.body
        );

      if (!parsedBody.success) {
        await badRequest(
          reply,
          parsedBody.error.issues[0]?.message
            ?? "Invalid location payload"
        );
        return;
      }

      const location =
        await this.service.createLocation(
          parsedBody.data
        );

      if (!location) {
        await badRequest(
          reply,
          "Parent location not found"
        );
        return;
      }

      await reply
        .code(201)
        .send(location);
    };

  listLocationTree =
    async (
      _request: FastifyRequest,
      reply: FastifyReply
    ): Promise<void> => {

      const locations =
        await this.service.listLocationTree();

      await ok(reply, locations);
    };
}
