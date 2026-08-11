import type {
  FastifyReply,
  FastifyRequest
} from "fastify";

import type {
  LocationService
} from "./service.js";

import {
  ok
} from "../../shared/http/index.js";

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
