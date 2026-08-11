import type {
  FastifyReply
} from "fastify";

export async function ok<T>(
  reply: FastifyReply,
  payload: T
): Promise<void> {

  await reply
    .code(200)
    .send(payload);
}

export async function created<T>(
  reply: FastifyReply,
  payload: T
): Promise<void> {

  await reply
    .code(201)
    .send(payload);
}

export async function noContent(
  reply: FastifyReply
): Promise<void> {

  await reply
    .code(204)
    .send();
}
