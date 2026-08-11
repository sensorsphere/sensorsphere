import type {
  FastifyReply,
  FastifyRequest
} from "fastify";

import type {
  SensorService
} from "./service.js";

import {
  ok
} from "../../shared/http/index.js";

export class SensorController {

  constructor(
    private readonly service:
      SensorService
  ) {}

  listSensors =
    async (
      _request: FastifyRequest,
      reply: FastifyReply
    ): Promise<void> => {

      const sensors =
        await this.service
          .listSensors();

      await ok(
        reply,
        sensors
      );
    };
}
