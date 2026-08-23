import type {
  FastifyReply,
  FastifyRequest
} from "fastify";

import { z } from "zod";

import type {
  SensorService
} from "./service.js";

import {
  badRequest,
  notFound,
  ok
} from "../../shared/http/index.js";

const sensorIdSchema =
  z.string().uuid();

const updateSensorSchema =
  z.object({
    name:
      z.string().trim().min(1).max(200).nullable().optional(),

    description:
      z.string().trim().max(2000).nullable().optional(),

    manufacturer:
      z.string().trim().max(200).nullable().optional(),

    model:
      z.string().trim().max(200).nullable().optional(),

    firmwareVersion:
      z.string().trim().max(200).nullable().optional(),

    gatewayId:
      z.string().uuid().nullable().optional(),

    backupGatewayId:
      z.string().uuid().nullable().optional(),

    enabled:
      z.boolean().optional()
  })
  .strict()
  .refine(
    value =>
      Object.keys(value).length > 0,
    {
      message:
        "At least one editable field is required"
    }
  );

interface SensorParams {
  id: string;
}

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
        await this.service.listSensors();

      await ok(reply, sensors);
    };

  getSensor =
    async (
      request:
        FastifyRequest<{
          Params: SensorParams;
        }>,
      reply: FastifyReply
    ): Promise<void> => {

      const parsedId =
        sensorIdSchema.safeParse(
          request.params.id
        );

      if (!parsedId.success) {
        await badRequest(
          reply,
          "Invalid sensor id"
        );
        return;
      }

      const sensor =
        await this.service.getSensor(
          parsedId.data
        );

      if (!sensor) {
        await notFound(
          reply,
          "Sensor not found"
        );
        return;
      }

      await ok(reply, sensor);
    };

  updateSensor =
    async (
      request:
        FastifyRequest<{
          Params: SensorParams;
          Body: unknown;
        }>,
      reply: FastifyReply
    ): Promise<void> => {

      const parsedId =
        sensorIdSchema.safeParse(
          request.params.id
        );

      if (!parsedId.success) {
        await badRequest(
          reply,
          "Invalid sensor id"
        );
        return;
      }

      const parsedBody =
        updateSensorSchema.safeParse(
          request.body
        );

      if (!parsedBody.success) {
        await badRequest(
          reply,
          parsedBody.error.issues[0]?.message
            ?? "Invalid sensor payload"
        );
        return;
      }

      let sensor;

      try {
        sensor =
          await this.service.updateSensor(
            parsedId.data,
            parsedBody.data
          );
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Primary and backup gateway must be different"
        ) {
          await badRequest(reply, error.message);
          return;
        }

        throw error;
      }

      if (!sensor) {
        await notFound(
          reply,
          "Sensor not found"
        );
        return;
      }

      await ok(reply, sensor);
    };
}
