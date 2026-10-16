import type { Pool } from 'pg';
import type { Discovery } from './client.js';
export async function importNetatmoDiscovery(pool: Pool, discovery: Discovery, connectionId?: string): Promise<{ created: number; updated: number; deviceIds: string[]; devices: { id: string; name: string; deviceType: string; deviceClass: string; action: "created" | "updated" }[] }> {
  const client = await pool.connect();
  let created = 0, updated = 0;
  const ids = new Map<string,string>();
  const devices: { id: string; name: string; deviceType: string; deviceClass: string; action: "created" | "updated" }[] = [];
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('sensorsphere:netatmo:registry'))");
    for (const item of discovery.devices) {
      const d = item.device;
      const displayName = connectionId ? `${d.name} - Netatmo ${connectionId.toUpperCase()}` : d.name;
      const originalIdentity = d.identities[0];
      const identity = originalIdentity && connectionId ? { ...originalIdentity, value: `${connectionId}:${originalIdentity.value}` } : originalIdentity;
      if (!identity || identity.identityType !== 'NETATMO_MODULE_ID') throw new Error('Missing Netatmo identity');
      const references = await client.query<{ code: string }>('SELECT code FROM device_types WHERE code = $1 AND device_class = $2 AND enabled = TRUE', [d.deviceType, d.deviceClass]);
      if (!references.rows.length) throw new Error(`Unregistered device type: ${d.deviceType}`);
      const existing = await client.query<{ id: string }>('SELECT device_id AS id FROM device_registry_identities WHERE identity_type = $1 AND value = $2 FOR UPDATE', [identity.identityType, identity.value]);
      let id = existing.rows[0]?.id;
      const action = id ? "updated" : "created";
      if (id) {
        await client.query('UPDATE device_registry_devices SET name=$2, manufacturer=$3, model=$4, description=$5, last_seen_at=NOW(), updated_at=NOW() WHERE id=$1', [id, displayName, d.manufacturer, d.model, d.description]);
        updated++;
      } else {
        const result = await client.query<{ id: string }>('INSERT INTO device_registry_devices (name,device_class,device_type,technology,manufacturer,model,description,last_seen_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW()) RETURNING id', [displayName,d.deviceClass,d.deviceType,d.technology,d.manufacturer,d.model,d.description]);
        id = result.rows[0]!.id;
        await client.query('INSERT INTO device_registry_identities (device_id,identity_type,value,normalized_value,source,is_primary,sort_order) VALUES ($1,$2,$3,$3,$4,TRUE,0)', [id,identity.identityType,identity.value,identity.source]);
        created++;
      }
      ids.set(item.clientKey,id!);
      devices.push({ id: id!, name: displayName, deviceType: d.deviceType, deviceClass: d.deviceClass, action });
    }
    for (const item of discovery.devices) {
      const parentId = item.parentClientKey ? ids.get(item.parentClientKey) : undefined;
      if (parentId) await client.query('UPDATE device_registry_devices SET parent_device_id=$2,updated_at=NOW() WHERE id=$1 AND parent_device_id IS DISTINCT FROM $2', [ids.get(item.clientKey),parentId]);
    }
    await client.query('COMMIT');
    return { created, updated, deviceIds: [...ids.values()], devices };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
