import type { FastifyInstance } from "fastify";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";

export interface ServiceRegistryFeatureOptions { pool: Pool; }

const codeSchema = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
const healthSchema = z.enum(["ONLINE", "WARNING", "OFFLINE", "UNKNOWN", "DISABLED"]);
const accessLinkSchema = z.object({
  name: z.string().trim().min(1).max(200), linkType: z.string().trim().min(1).max(100).default("WEB"),
  urlTemplate: z.string().trim().min(1).max(2000), username: z.string().trim().max(300).nullable().optional(),
  port: z.number().int().min(1).max(65535).nullable().optional(), parameters: z.record(z.string(), z.string()).optional(),
  icon: z.string().trim().min(1).max(100).optional(), color: z.string().trim().min(1).max(50).optional(),
  enabled: z.boolean().optional(), sortOrder: z.number().int().min(0).max(100000).optional()
}).strict();
const resourceSchema = z.object({
  name: z.string().trim().min(1).max(300), resourceType: z.string().trim().min(1).max(100).default("custom"),
  externalId: z.string().trim().max(500).nullable().optional(), description: z.string().trim().max(5000).nullable().optional(),
  linkedDeviceId: z.string().uuid().nullable().optional(), enabled: z.boolean().optional(), sortOrder: z.number().int().min(0).max(100000).optional()
}).strict();
const accountSchema = z.object({
  name: z.string().trim().min(1).max(300), accountIdentifier: z.string().trim().max(500).nullable().optional(),
  contractIdentifier: z.string().trim().max(500).nullable().optional(), description: z.string().trim().max(5000).nullable().optional(),
  enabled: z.boolean().optional(), sortOrder: z.number().int().min(0).max(100000).optional(), resources: z.array(resourceSchema).optional()
}).strict();
const serviceBaseSchema = z.object({
  name: z.string().trim().min(1).max(300), serviceClass: codeSchema, serviceType: codeSchema,
  provider: z.string().trim().max(300).nullable().optional(), description: z.string().trim().max(5000).nullable().optional(),
  enabled: z.boolean().optional(), healthStatus: healthSchema.optional(), lastCheckedAt: z.string().datetime().nullable().optional(),
  accounts: z.array(accountSchema).optional(), accessLinks: z.array(accessLinkSchema).optional()
}).strict();
const serviceCreateSchema = serviceBaseSchema;
const serviceUpdateSchema = serviceBaseSchema.partial().refine(value => Object.keys(value).length > 0, "At least one field is required");
const taxonomyClassSchema = z.object({ code: codeSchema, label: z.string().trim().min(1).max(200), description: z.string().trim().max(2000).nullable().optional(), icon: z.string().trim().min(1).max(100), color: z.string().trim().min(1).max(50), enabled: z.boolean().optional(), sortOrder: z.number().int().min(0).max(100000).optional() }).strict();
const taxonomyTypeSchema = z.object({ code: codeSchema, label: z.string().trim().min(1).max(200), serviceClass: codeSchema, description: z.string().trim().max(2000).nullable().optional(), icon: z.string().trim().min(1).max(100), color: z.string().trim().min(1).max(50), enabled: z.boolean().optional(), sortOrder: z.number().int().min(0).max(100000).optional() }).strict();

function mapReference(row: any) { return { code: row.code, label: row.label, description: row.description, icon: row.icon, color: row.color, enabled: row.enabled, sortOrder: row.sort_order }; }
function mapType(row: any) { return { ...mapReference(row), serviceClass: row.service_class }; }
function mapAccess(row: any) { return { id: row.id, name: row.name, linkType: row.link_type, urlTemplate: row.url_template, username: row.username, port: row.port, parameters: row.parameters ?? {}, icon: row.icon, color: row.color, enabled: row.enabled, sortOrder: row.sort_order }; }
function mapResource(row: any) { return { id: row.id, name: row.name, resourceType: row.resource_type, externalId: row.external_id, description: row.description, linkedDeviceId: row.linked_device_id, enabled: row.enabled, sortOrder: row.sort_order }; }
function mapAccount(row: any, resources: any[]) { return { id: row.id, name: row.name, accountIdentifier: row.account_identifier, contractIdentifier: row.contract_identifier, description: row.description, enabled: row.enabled, sortOrder: row.sort_order, resources: resources.filter(item => item.account_id === row.id).map(mapResource) }; }

async function listServices(pool: Pool) {
  const [services, accounts, resources, access] = await Promise.all([
    pool.query(`SELECT s.*, c.label AS class_label, c.icon AS class_icon, c.color AS class_color, t.label AS type_label, t.icon AS type_icon, t.color AS type_color FROM service_registry_services s JOIN service_classes c ON c.code=s.service_class JOIN service_types t ON t.code=s.service_type ORDER BY s.name`),
    pool.query(`SELECT * FROM service_registry_accounts ORDER BY service_id, sort_order, name`),
    pool.query(`SELECT * FROM service_registry_resources ORDER BY account_id, sort_order, name`),
    pool.query(`SELECT * FROM service_registry_access_links ORDER BY service_id, sort_order, name`)
  ]);
  return services.rows.map((row: any) => ({
    id: row.id, name: row.name, serviceClass: row.service_class, serviceClassInfo: { code: row.service_class, label: row.class_label, icon: row.class_icon, color: row.class_color },
    serviceType: row.service_type, serviceTypeInfo: { code: row.service_type, label: row.type_label, icon: row.type_icon, color: row.type_color }, provider: row.provider,
    description: row.description, enabled: row.enabled, healthStatus: row.health_status, lastCheckedAt: row.last_checked_at, createdAt: row.created_at, updatedAt: row.updated_at,
    accounts: accounts.rows.filter((item: any) => item.service_id === row.id).map((item: any) => mapAccount(item, resources.rows)),
    accessLinks: access.rows.filter((item: any) => item.service_id === row.id).map(mapAccess)
  }));
}

async function replaceChildren(client: PoolClient, serviceId: string, input: any) {
  if (input.accounts !== undefined) {
    await client.query(`DELETE FROM service_registry_accounts WHERE service_id=$1`, [serviceId]);
    for (const account of input.accounts) {
      const result = await client.query(`INSERT INTO service_registry_accounts(service_id,name,account_identifier,contract_identifier,description,enabled,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [serviceId, account.name, account.accountIdentifier ?? null, account.contractIdentifier ?? null, account.description ?? null, account.enabled ?? true, account.sortOrder ?? 100]);
      const accountId = result.rows[0].id;
      for (const resource of account.resources ?? []) {
        await client.query(`INSERT INTO service_registry_resources(account_id,name,resource_type,external_id,description,linked_device_id,enabled,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [accountId, resource.name, resource.resourceType ?? "custom", resource.externalId ?? null, resource.description ?? null, resource.linkedDeviceId ?? null, resource.enabled ?? true, resource.sortOrder ?? 100]);
      }
    }
  }
  if (input.accessLinks !== undefined) {
    await client.query(`DELETE FROM service_registry_access_links WHERE service_id=$1`, [serviceId]);
    for (const link of input.accessLinks) {
      await client.query(`INSERT INTO service_registry_access_links(service_id,name,link_type,url_template,username,port,parameters,icon,color,enabled,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)`, [serviceId, link.name, link.linkType ?? "WEB", link.urlTemplate, link.username ?? null, link.port ?? null, JSON.stringify(link.parameters ?? {}), link.icon ?? "globe", link.color ?? "blue", link.enabled ?? true, link.sortOrder ?? 100]);
    }
  }
}

export async function registerServiceRegistryFeature(app: FastifyInstance, { pool }: ServiceRegistryFeatureOptions) {
  app.get("/api/v1/service-registry/reference/service-classes", async () => (await pool.query(`SELECT * FROM service_classes WHERE enabled ORDER BY sort_order,label`)).rows.map(mapReference));
  app.get("/api/v1/service-registry/reference/service-types", async () => (await pool.query(`SELECT * FROM service_types WHERE enabled ORDER BY sort_order,label`)).rows.map(mapType));
  app.get("/api/v1/service-registry/taxonomy/classes", async () => (await pool.query(`SELECT * FROM service_classes ORDER BY sort_order,label`)).rows.map(mapReference));
  app.get("/api/v1/service-registry/taxonomy/types", async () => (await pool.query(`SELECT * FROM service_types ORDER BY sort_order,label`)).rows.map(mapType));

  app.post("/api/v1/service-registry/taxonomy/classes", async (request, reply) => {
    const input = taxonomyClassSchema.parse(request.body); const r = await pool.query(`INSERT INTO service_classes(code,label,description,icon,color,enabled,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [input.code,input.label,input.description??null,input.icon,input.color,input.enabled??true,input.sortOrder??100]); reply.code(201); return mapReference(r.rows[0]);
  });
  app.patch("/api/v1/service-registry/taxonomy/classes/:code", async (request: any, reply) => {
    const input = taxonomyClassSchema.omit({code:true}).partial().parse(request.body); const current = (await pool.query(`SELECT * FROM service_classes WHERE code=$1`,[request.params.code])).rows[0];
    if(!current) return reply.code(404).send({ error: "Class not found" });
    const r=await pool.query(`UPDATE service_classes SET label=$2,description=$3,icon=$4,color=$5,enabled=$6,sort_order=$7,updated_at=NOW() WHERE code=$1 RETURNING *`,[request.params.code,input.label??current.label,input.description===undefined?current.description:input.description,input.icon??current.icon,input.color??current.color,input.enabled??current.enabled,input.sortOrder??current.sort_order]); return mapReference(r.rows[0]);
  });
  app.delete("/api/v1/service-registry/taxonomy/classes/:code", async (request: any, reply) => { try { await pool.query(`DELETE FROM service_classes WHERE code=$1`,[request.params.code]); return reply.code(204).send(); } catch { return reply.code(409).send({error:"Class is still in use"}); } });

  app.post("/api/v1/service-registry/taxonomy/types", async (request, reply) => { const input=taxonomyTypeSchema.parse(request.body); const r=await pool.query(`INSERT INTO service_types(code,label,service_class,description,icon,color,enabled,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[input.code,input.label,input.serviceClass,input.description??null,input.icon,input.color,input.enabled??true,input.sortOrder??100]); reply.code(201); return mapType(r.rows[0]); });
  app.patch("/api/v1/service-registry/taxonomy/types/:code", async (request:any, reply) => { const input=taxonomyTypeSchema.omit({code:true}).partial().parse(request.body); const current=(await pool.query(`SELECT * FROM service_types WHERE code=$1`,[request.params.code])).rows[0]; if(!current) return reply.code(404).send({error:"Type not found"}); const r=await pool.query(`UPDATE service_types SET label=$2,service_class=$3,description=$4,icon=$5,color=$6,enabled=$7,sort_order=$8,updated_at=NOW() WHERE code=$1 RETURNING *`,[request.params.code,input.label??current.label,input.serviceClass??current.service_class,input.description===undefined?current.description:input.description,input.icon??current.icon,input.color??current.color,input.enabled??current.enabled,input.sortOrder??current.sort_order]); return mapType(r.rows[0]); });
  app.delete("/api/v1/service-registry/taxonomy/types/:code", async (request:any,reply) => { try { await pool.query(`DELETE FROM service_types WHERE code=$1`,[request.params.code]); return reply.code(204).send(); } catch { return reply.code(409).send({error:"Type is still in use"}); } });

  app.get("/api/v1/service-registry/services", async () => listServices(pool));
  app.post("/api/v1/service-registry/services", async (request, reply) => {
    const input=serviceCreateSchema.parse(request.body); const client=await pool.connect(); try { await client.query("BEGIN"); const r=await client.query(`INSERT INTO service_registry_services(name,service_class,service_type,provider,description,enabled,health_status,last_checked_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,[input.name,input.serviceClass,input.serviceType,input.provider??null,input.description??null,input.enabled??true,input.healthStatus??(input.enabled===false?"DISABLED":"UNKNOWN"),input.lastCheckedAt??null]); await replaceChildren(client,r.rows[0].id,input); await client.query("COMMIT"); reply.code(201); return (await listServices(pool)).find(item=>item.id===r.rows[0].id); } catch(error){ await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  });
  app.patch("/api/v1/service-registry/services/:id", async (request:any, reply) => {
    const input=serviceUpdateSchema.parse(request.body); const current=(await pool.query(`SELECT * FROM service_registry_services WHERE id=$1`,[request.params.id])).rows[0]; if(!current) return reply.code(404).send({error:"Service not found"}); const client=await pool.connect(); try { await client.query("BEGIN"); await client.query(`UPDATE service_registry_services SET name=$2,service_class=$3,service_type=$4,provider=$5,description=$6,enabled=$7,health_status=$8,last_checked_at=$9,updated_at=NOW() WHERE id=$1`,[request.params.id,input.name??current.name,input.serviceClass??current.service_class,input.serviceType??current.service_type,input.provider===undefined?current.provider:input.provider,input.description===undefined?current.description:input.description,input.enabled??current.enabled,input.healthStatus??(input.enabled===false?"DISABLED":current.health_status),input.lastCheckedAt===undefined?current.last_checked_at:input.lastCheckedAt]); await replaceChildren(client,request.params.id,input); await client.query("COMMIT"); return (await listServices(pool)).find(item=>item.id===request.params.id); } catch(error){await client.query("ROLLBACK");throw error;} finally{client.release();}
  });
  app.delete("/api/v1/service-registry/services/:id", async (request:any,reply) => { const r=await pool.query(`DELETE FROM service_registry_services WHERE id=$1`,[request.params.id]); if(!r.rowCount) return reply.code(404).send({error:"Service not found"}); return reply.code(204).send(); });
}
