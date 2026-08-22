import type {
  FastifyReply,
  FastifyRequest
} from "fastify";

import { z } from "zod";

import type {
  GatewayService
} from "./service.js";

import {
  badRequest,
  notFound,
  ok
} from "../../shared/http/index.js";

const databaseIdSchema = z.string().uuid();
const mqttGatewayIdSchema =
  z.string().trim().min(1).max(200).regex(/^[A-Za-z0-9._-]+$/);

const nullableText =
  z.string().trim().max(200).nullable();

const createGatewaySchema = z.object({
  gatewayId: mqttGatewayIdSchema,
  name: z.string().trim().min(1).max(200),
  gatewayTypeId: databaseIdSchema,
  version: nullableText.optional(),
  ipAddress: z.string().trim().max(100).nullable().optional(),
  macAddress: nullableText.optional(),
  wifiSsid: nullableText.optional(),
  boardId: nullableText.optional(),
  buildDate: nullableText.optional(),
  locationId: databaseIdSchema.nullable().optional(),
  enabled: z.boolean().optional()
}).strict();

const updateGatewaySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  gatewayTypeId: databaseIdSchema.optional(),
  version: nullableText.optional(),
  ipAddress: z.string().trim().max(100).nullable().optional(),
  macAddress: nullableText.optional(),
  wifiSsid: nullableText.optional(),
  boardId: nullableText.optional(),
  buildDate: nullableText.optional(),
  locationId: databaseIdSchema.nullable().optional(),
  enabled: z.boolean().optional()
})
  .strict()
  .refine(
    value => Object.keys(value).length > 0,
    { message: "At least one editable field is required" }
  );

interface GatewayParams {
  id: string;
}

export class GatewayController {
  constructor(
    private readonly service: GatewayService
  ) {}

  listGateways = async (
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    await ok(
      reply,
      await this.service.listGateways()
    );
  };

  listGatewayTypes = async (
    _request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    await ok(
      reply,
      await this.service.listGatewayTypes()
    );
  };

  getGateway = async (
    request: FastifyRequest<{ Params: GatewayParams }>,
    reply: FastifyReply
  ): Promise<void> => {
    const parsedId =
      databaseIdSchema.safeParse(request.params.id);

    if (!parsedId.success) {
      await badRequest(reply, "Invalid gateway id");
      return;
    }

    const gateway =
      await this.service.getGateway(parsedId.data);

    if (!gateway) {
      await notFound(reply, "Gateway not found");
      return;
    }

    await ok(reply, gateway);
  };

  createGateway = async (
    request: FastifyRequest<{ Body: unknown }>,
    reply: FastifyReply
  ): Promise<void> => {
    const parsed =
      createGatewaySchema.safeParse(request.body);

    if (!parsed.success) {
      await badRequest(
        reply,
        parsed.error.issues[0]?.message
          ?? "Invalid gateway payload"
      );
      return;
    }

    try {
      await ok(
        reply,
        await this.service.createGateway(parsed.data)
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "gateway_type_not_found"
      ) {
        await badRequest(reply, "Gateway type not found");
        return;
      }
      throw error;
    }
  };

  updateGateway = async (
    request: FastifyRequest<{
      Params: GatewayParams;
      Body: unknown;
    }>,
    reply: FastifyReply
  ): Promise<void> => {
    const parsedId =
      databaseIdSchema.safeParse(request.params.id);
    const parsedBody =
      updateGatewaySchema.safeParse(request.body);

    if (!parsedId.success) {
      await badRequest(reply, "Invalid gateway id");
      return;
    }

    if (!parsedBody.success) {
      await badRequest(
        reply,
        parsedBody.error.issues[0]?.message
          ?? "Invalid gateway payload"
      );
      return;
    }

    try {
      const gateway =
        await this.service.updateGateway(
          parsedId.data,
          parsedBody.data
        );

      if (!gateway) {
        await notFound(reply, "Gateway not found");
        return;
      }

      await ok(reply, gateway);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "gateway_type_not_found"
      ) {
        await badRequest(reply, "Gateway type not found");
        return;
      }
      throw error;
    }
  };

  deleteGateway = async (
    request: FastifyRequest<{ Params: GatewayParams }>,
    reply: FastifyReply
  ): Promise<void> => {
    const parsedId =
      databaseIdSchema.safeParse(request.params.id);

    if (!parsedId.success) {
      await badRequest(reply, "Invalid gateway id");
      return;
    }

    if (!(await this.service.deleteGateway(parsedId.data))) {
      await notFound(reply, "Gateway not found");
      return;
    }

    reply.code(204).send();
  };
}
