import type { NetatmoConfig } from './client.js';
export type RoomReading = { homeId: string; roomId: string; moduleId?: string | null; measuredTemperature: number | null; setpointTemperature: number | null; setpointMode: string | null; outdoorTemperature?: number | null };
export type ModuleReading = { homeId: string; moduleId: string; heating: boolean | null; boilerFault?: boolean | null; reachable: boolean | null; batteryPercent: number | null };
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
  const roomModules = new Map<string, string>();
  for (const home of homes) {
    if (!Array.isArray(home.rooms)) continue;
    for (const room of home.rooms) {
      if (typeof room.id === 'string' && Array.isArray(room.module_ids)) {
        const moduleId = room.module_ids.find((id: unknown) => typeof id === 'string');
        if (typeof moduleId === 'string') roomModules.set(`${home.id}:${room.id}`, moduleId);
      }
    }
  }
  for (const home of homes) {
    if (typeof home.id !== 'string') throw new Error('Invalid home');
    const statusResponse = await get(`/api/homestatus?home_id=${encodeURIComponent(home.id)}`);
    const status = statusResponse?.body?.home;
    if (!Array.isArray(status?.rooms) || !Array.isArray(status?.modules)) {
      const codes=Array.isArray(statusResponse?.body?.errors)?statusResponse.body.errors.map((item:unknown)=>typeof item==='object'&&item!==null&&typeof (item as {code?:unknown}).code==='number'?(item as {code:number}).code:null).filter((v:unknown)=>v!==null):[];
      throw new Error(codes.length?'Netatmo homestatus unavailable (device errors: '+codes.slice(0,5).join(', ')+')':'Netatmo homestatus missing rooms/modules');
    }
    for (const room of status.rooms) {
      if (typeof room.id !== 'string') continue;
      rooms.push({ homeId: home.id, roomId: room.id, moduleId: roomModules.get(`${home.id}:${room.id}`) ?? null, measuredTemperature: numeric(room.therm_measured_temperature), setpointTemperature: numeric(room.therm_setpoint_temperature), setpointMode: typeof room.therm_setpoint_mode === 'string' ? room.therm_setpoint_mode : null, outdoorTemperature: numeric(room.outdoor_temperature) });
    }
    for (const module of status.modules) {
      if (typeof module.id !== 'string') continue;
      modules.push({ homeId: home.id, moduleId: module.id, heating: boolean(module.boiler_status), boilerFault: boolean(module.boiler_fault), reachable: boolean(module.reachable), batteryPercent: numeric(module.battery_percent) });
    }
  }
  return { rooms, modules };
}
