import type { Pool } from 'pg';
import type { Readings } from './telemetry.js';
export async function ingestNetatmoReadings(pool: Pool, readings: Readings): Promise<{ assets: number; observations: number }> {
  const client = await pool.connect();
  let observations = 0;
  const assets = new Set<string>();
  const timestamp = new Date();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('sensorsphere:netatmo:telemetry'))");
    const record = async (externalId: string, name: string, key: string, label: string, unit: string | null, value: string | number | boolean | null) => {
      if (value === null || !Number.isFinite(typeof value === 'number' ? value : 0)) return;
      const asset = await client.query<{ id: string }>(`INSERT INTO assets (id, external_id, name, manufacturer, asset_type, protocol) VALUES (gen_random_uuid(),$1,$2,'Netatmo','sensor','http') ON CONFLICT (external_id) DO UPDATE SET name=EXCLUDED.name, updated_at=NOW() RETURNING id`, [externalId,name]);
      const assetId = asset.rows[0]!.id;
      assets.add(assetId);
      const type = typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string';
      const metric = await client.query<{ id: string }>(`INSERT INTO asset_metrics (asset_id,metric_key,display_name,unit,value_type) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (asset_id,metric_key) DO UPDATE SET display_name=EXCLUDED.display_name,unit=EXCLUDED.unit,value_type=EXCLUDED.value_type RETURNING id`, [assetId,key,label,unit,type]);
      await client.query('INSERT INTO observations (time,asset_metric_id,value_double,value_text,value_boolean,source,source_ref) VALUES ($1,$2,$3,$4,$5,$6,$7)', [timestamp,metric.rows[0]!.id,typeof value === 'number' ? value : null,typeof value === 'string' ? value : null,typeof value === 'boolean' ? value : null,'netatmo-energy',externalId]);
      observations++;
    };
    for (const room of readings.rooms) {
      const id = `netatmo:room:${room.homeId}:${room.roomId}`;
      await record(id,`Netatmo room ${room.roomId}`,'temperature','Temperature','°C',room.measuredTemperature);
      await record(id,`Netatmo room ${room.roomId}`,'setpoint','Setpoint','°C',room.setpointTemperature);
      await record(id,`Netatmo room ${room.roomId}`,'mode','Thermostat mode',null,room.setpointMode);
    }
    for (const module of readings.modules) {
      const id = `netatmo:module:${module.homeId}:${module.moduleId}`;
      await record(id,`Netatmo module ${module.moduleId}`,'heating','Heating',null,module.heating);
      await record(id,`Netatmo module ${module.moduleId}`,'reachable','Reachable',null,module.reachable);
      await record(id,`Netatmo module ${module.moduleId}`,'battery','Battery','%',module.batteryPercent);
    }
    await client.query('COMMIT');
    return { assets: assets.size, observations };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
