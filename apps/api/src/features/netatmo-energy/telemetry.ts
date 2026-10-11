import type { NetatmoConfig } from './client.js';
export type RoomReading = { homeId: string; roomId: string; measuredTemperature: number | null; setpointTemperature: number | null; setpointMode: string | null };
export type ModuleReading = { homeId: string; moduleId: string; heating: boolean | null; reachable: boolean | null; batteryPercent: number | null };
export type Readings = { rooms: RoomReading[]; modules: ModuleReading[] };
const numeric = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) ? v : null;
const boolean = (v: unknown): boolean | null => typeof v === 'boolean' ? v : null;
export async function readTelemetry(config: NetatmoConfig, accessToken: string): Promise<Readings> {
  const get = async (path: string): Promise<any> => {
    const response = await fetch(new URL(path, config.baseUrl), { headers: { authorization: `Bearer ${accessToken}` }, redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Netatmo HTTP ${response.status}`);
    return response.json();
  };
  const homes = (await get('/api/homesdata'))?.body?.homes;
  if (!Array.isArray(homes)) throw new Error('Invalid homesdata');
  const rooms: RoomReading[] = [], modules: ModuleReading[] = [];
  for (const home of homes) {
    if (typeof home.id !== 'string') throw new Error('Invalid home');
    const status = (await get(`/api/homestatus?home_id=${encodeURIComponent(home.id)}`))?.body?.home;
    if (!Array.isArray(status?.rooms) || !Array.isArray(status?.modules)) throw new Error('Invalid homestatus');
    for (const room of status.rooms) {
      if (typeof room.id !== 'string') continue;
      rooms.push({ homeId: home.id, roomId: room.id, measuredTemperature: numeric(room.therm_measured_temperature), setpointTemperature: numeric(room.therm_setpoint_temperature), setpointMode: typeof room.therm_setpoint_mode === 'string' ? room.therm_setpoint_mode : null });
    }
    for (const module of status.modules) {
      if (typeof module.id !== 'string') continue;
      modules.push({ homeId: home.id, moduleId: module.id, heating: boolean(module.boiler_status), reachable: boolean(module.reachable), batteryPercent: numeric(module.battery_percent) });
    }
  }
  return { rooms, modules };
}
