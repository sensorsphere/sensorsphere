import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";

const assetTypeKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);

const assetTypeSchema = z.object({
  key: assetTypeKeySchema,
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).nullable().optional()
}).strict();

const updateAssetTypeSchema = assetTypeSchema.partial().refine(
  value => Object.keys(value).length > 0,
  { message: "At least one field must be provided" }
);

const nameSchema = z.object({
  name: z.string().trim().min(1).max(255)
}).strict();

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "23505"
  );
}

export async function registerAssetClassificationRoutes(
  app: FastifyInstance,
  pool: Pool
): Promise<void> {
  app.get("/asset-classification", async () => {
    const [assetTypes, manufacturers, tags] = await Promise.all([
      pool.query<{
        key: string;
        name: string;
        description: string | null;
      }>(
        `SELECT key, name, description FROM asset_types ORDER BY name, key`
      ),
      pool.query<{ name: string }>(
        `SELECT name FROM manufacturers ORDER BY name`
      ),
      pool.query<{ id: string; name: string }>(
        `SELECT id, name FROM tags ORDER BY name`
      )
    ]);

    return {
      assetTypes: assetTypes.rows,
      manufacturers: manufacturers.rows,
      tags: tags.rows
    };
  });

  app.post("/asset-types", async (request, reply) => {
    const parsed = assetTypeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid asset type" });
    }
    try {
      const result = await pool.query(
        `INSERT INTO asset_types (key, name, description)
         VALUES ($1, $2, $3)
         RETURNING key, name, description`,
        [parsed.data.key, parsed.data.name, parsed.data.description ?? null]
      );
      return reply.code(201).send(result.rows[0]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.code(409).send({ error: "Asset type already exists" });
      }
      throw error;
    }
  });

  app.patch("/asset-types/:key", async (request, reply) => {
    const params = z.object({ key: assetTypeKeySchema }).safeParse(request.params);
    const body = updateAssetTypeSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: body.success ? "Invalid asset type key" : body.error.issues[0]?.message });
    }
    const current = await pool.query<{ key: string; name: string; description: string | null }>(
      `SELECT key, name, description FROM asset_types WHERE key = $1`,
      [params.data.key]
    );
    if (!current.rows[0]) {
      return reply.code(404).send({ error: "Asset type not found" });
    }
    const next = {
      key: body.data.key ?? current.rows[0].key,
      name: body.data.name ?? current.rows[0].name,
      description: body.data.description !== undefined
        ? body.data.description
        : current.rows[0].description
    };
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE asset_types
         SET key = $2, name = $3, description = $4, updated_at = NOW()
         WHERE key = $1
         RETURNING key, name, description`,
        [params.data.key, next.key, next.name, next.description]
      );
      if (next.key !== params.data.key) {
        await client.query(
          `UPDATE assets SET asset_type = $2, updated_at = NOW() WHERE asset_type = $1`,
          [params.data.key, next.key]
        );
      }
      await client.query("COMMIT");
      return reply.send(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(error)) {
        return reply.code(409).send({ error: "Asset type already exists" });
      }
      throw error;
    } finally {
      client.release();
    }
  });

  app.delete("/asset-types/:key", async (request, reply) => {
    const params = z.object({ key: assetTypeKeySchema }).safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "Invalid asset type key" });
    }
    const usage = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::integer AS count FROM assets WHERE asset_type = $1`,
      [params.data.key]
    );
    if ((usage.rows[0]?.count ?? 0) > 0) {
      return reply.code(409).send({ error: "Asset type is assigned to assets" });
    }
    const result = await pool.query(`DELETE FROM asset_types WHERE key = $1`, [params.data.key]);
    return (result.rowCount ?? 0) > 0
      ? reply.code(204).send()
      : reply.code(404).send({ error: "Asset type not found" });
  });

  app.post("/manufacturers", async (request, reply) => {
    const parsed = nameSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid manufacturer" });
    }
    try {
      const result = await pool.query(
        `INSERT INTO manufacturers (name) VALUES ($1) RETURNING name`,
        [parsed.data.name]
      );
      return reply.code(201).send(result.rows[0]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.code(409).send({ error: "Manufacturer already exists" });
      }
      throw error;
    }
  });

  app.patch("/manufacturers/:name", async (request, reply) => {
    const params = z.object({ name: z.string().min(1).max(255) }).safeParse(request.params);
    const body = nameSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "Invalid manufacturer" });
    }
    const oldName = decodeURIComponent(params.data.name);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `UPDATE manufacturers SET name = $2, updated_at = NOW() WHERE name = $1 RETURNING name`,
        [oldName, body.data.name]
      );
      if (!result.rows[0]) {
        await client.query("ROLLBACK");
        return reply.code(404).send({ error: "Manufacturer not found" });
      }
      if (oldName !== body.data.name) {
        await client.query(
          `UPDATE assets SET manufacturer = $2, updated_at = NOW() WHERE manufacturer = $1`,
          [oldName, body.data.name]
        );
      }
      await client.query("COMMIT");
      return reply.send(result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(error)) {
        return reply.code(409).send({ error: "Manufacturer already exists" });
      }
      throw error;
    } finally {
      client.release();
    }
  });

  app.delete("/manufacturers/:name", async (request, reply) => {
    const params = z.object({ name: z.string().min(1).max(255) }).safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "Invalid manufacturer" });
    }
    const name = decodeURIComponent(params.data.name);
    const usage = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::integer AS count FROM assets WHERE manufacturer = $1`,
      [name]
    );
    if ((usage.rows[0]?.count ?? 0) > 0) {
      return reply.code(409).send({ error: "Manufacturer is assigned to assets" });
    }
    const result = await pool.query(`DELETE FROM manufacturers WHERE name = $1`, [name]);
    return (result.rowCount ?? 0) > 0
      ? reply.code(204).send()
      : reply.code(404).send({ error: "Manufacturer not found" });
  });

  app.post("/tags", async (request, reply) => {
    const parsed = nameSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Invalid tag" });
    }
    try {
      const result = await pool.query(
        `INSERT INTO tags (name) VALUES ($1) RETURNING id, name`,
        [parsed.data.name]
      );
      return reply.code(201).send(result.rows[0]);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.code(409).send({ error: "Tag already exists" });
      }
      throw error;
    }
  });

  app.patch("/tags/:id", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = nameSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "Invalid tag" });
    }
    try {
      const result = await pool.query(
        `UPDATE tags SET name = $2, updated_at = NOW() WHERE id = $1 RETURNING id, name`,
        [params.data.id, body.data.name]
      );
      return result.rows[0]
        ? reply.send(result.rows[0])
        : reply.code(404).send({ error: "Tag not found" });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.code(409).send({ error: "Tag already exists" });
      }
      throw error;
    }
  });

  app.delete("/tags/:id", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "Invalid tag id" });
    }
    const result = await pool.query(`DELETE FROM tags WHERE id = $1`, [params.data.id]);
    return (result.rowCount ?? 0) > 0
      ? reply.code(204).send()
      : reply.code(404).send({ error: "Tag not found" });
  });
}
