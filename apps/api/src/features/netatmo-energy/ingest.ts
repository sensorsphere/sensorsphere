import type { Pool } from 'pg';
import type { Readings } from './telemetry.js';
export async function ingestNetatmoReadings(pool: Pool, readings: Readings, connectionId?: string): Promise<{ assets: number; observations: number; readings: {assetExternalId:string;metricKey:string;label:string;value:string|number|boolean;unit:string|null;timestamp:string}[] }> {
  const client = await pool.connect();
  let observations = 0;
  const assets = new Set<string>();
  const reportReadings: {assetExternalId:string;metricKey:string;label:string;value:string|number|boolean;unit:string|null;timestamp:string}[] = [];
  const timestamp = new Date();
  const scoped = (value: string) => connectionId ? `${connectionId}:${value}` : value;
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('sensorsphere:netatmo:telemetry'))");
    const record = async (externalId: string, name: string, key: string, label: string, unit: string | null, value: string | number | boolean | null, moduleIdentity?: string) => {
      if (value === null || !Number.isFinite(typeof value === 'number' ? value : 0)) return;
      const asset = await client.query<{ id: string }>(`INSERT INTO assets (id, external_id, description, manufacturer, asset_type, protocol) VALUES (gen_random_uuid(),$1,$2,'Netatmo','sensor','http') ON CONFLICT (external_id) DO UPDATE SET updated_at=NOW() RETURNING id`, [scoped(externalId),name]);
      const assetId = asset.rows[0]!.id;
      assets.add(assetId);
      if (moduleIdentity) await client.query(`INSERT INTO device_registry_links (device_id,target_type,target_id) SELECT i.device_id,'asset',$2::uuid FROM device_registry_identities i WHERE i.identity_type='NETATMO_MODULE_ID' AND i.value=$1 ON CONFLICT (device_id,target_type,target_id) DO NOTHING`, [scoped(moduleIdentity),assetId]);
      const type = typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string';
      const metric = await client.query<{ id: string }>(`INSERT INTO asset_metrics (asset_id,metric_key,display_name,unit,value_type) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (asset_id,metric_key) DO UPDATE SET display_name=EXCLUDED.display_name,unit=EXCLUDED.unit,value_type=EXCLUDED.value_type RETURNING id`, [assetId,key,label,unit,type]);
      await client.query('INSERT INTO observations (time,asset_metric_id,value_double,value_text,value_boolean,source,source_ref) VALUES ($1,$2,$3,$4,$5,$6,$7)', [timestamp,metric.rows[0]!.id,typeof value === 'number' ? value : null,typeof value === 'string' ? value : null,typeof value === 'boolean' ? value : null,connectionId ? `netatmo-energy:${connectionId}` : 'netatmo-energy',scoped(externalId)]);
      observations++;
      reportReadings.push({assetExternalId:scoped(externalId),metricKey:key,label,value:value as string|number|boolean,unit,timestamp:timestamp.toISOString()});
    };
    for (const room of readings.rooms) {
      const id = room.moduleId ? `netatmo:module:${room.homeId}:${room.moduleId}` : `netatmo:room:${room.homeId}:${room.roomId}`;
      const identity = room.moduleId ? `${room.homeId}:${room.moduleId}` : undefined;
      await record(id,`Netatmo room ${room.roomId}`,'temperature','Temperature','°C',room.measuredTemperature,identity);
      await record(id,`Netatmo room ${room.roomId}`,'setpoint','Setpoint','°C',room.setpointTemperature,identity);
      await record(id,`Netatmo room ${room.roomId}`,'mode','Thermostat mode',null,room.setpointMode,identity);
    }
    for (const module of readings.modules) {
      // Registry health uses last_seen_at; telemetry alone does not refresh it.
      // Only a positively reachable module counts as a fresh health observation.
      await client.query(`UPDATE device_registry_devices AS d
        SET last_seen_at = CASE WHEN $2::boolean IS TRUE THEN $4::timestamptz ELSE d.last_seen_at END,
            battery_percent = COALESCE($3::double precision, d.battery_percent),
            updated_at = NOW()
        FROM device_registry_identities AS i
        WHERE i.device_id = d.id AND i.identity_type = 'NETATMO_MODULE_ID' AND i.value = $1`,
        [scoped(`${module.homeId}:${module.moduleId}`), module.reachable, module.batteryPercent, timestamp]);
      const id = `netatmo:module:${module.homeId}:${module.moduleId}`;
      await record(id,`Netatmo module ${module.moduleId}`,'heating','Heating',null,module.heating,`${module.homeId}:${module.moduleId}`);
      await record(id,`Netatmo module ${module.moduleId}`,'reachable','Reachable',null,module.reachable,`${module.homeId}:${module.moduleId}`);
      await record(id,`Netatmo module ${module.moduleId}`,'battery','Battery','%',module.batteryPercent,`${module.homeId}:${module.moduleId}`);
    }
    await client.query('COMMIT');
    return { assets: assets.size, observations, readings: reportReadings };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
