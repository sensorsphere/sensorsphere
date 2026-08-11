import type {
  FastifyReply
} from "fastify";

interface ErrorBody {

  error: string;

}

export async function badRequest(
  reply: FastifyReply,
  message: string
): Promise<void> {

  await reply
    .code(400)
    .send({
      error: message
    });

}

export async function notFound(
  reply: FastifyReply,
  message = "Resource not found"
): Promise<void> {

  await reply
    .code(404)
    .send({
      error: message
    });

}

export async function internalServerError(
  reply: FastifyReply
): Promise<void> {

  await reply
    .code(500)
    .send({
      error:
        "Internal server error"
    });

}
