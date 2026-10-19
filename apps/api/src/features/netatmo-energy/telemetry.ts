import type { NetatmoConfig } from './client.js';
export type RoomReading = { homeId: string; roomId: string; moduleId?: string | null; measuredTemperature: number | null; setpointTemperature: number | null; setpointMode: string | null; outdoorTemperature?: number | null };
export type ModuleReading = { homeId: string; moduleId: string; heating: boolean | null; boilerFault?: boolean | null; reachable: boolean | null; batteryPercent: number | null };
export type DeviceDiagnostic={homeIndex:number;moduleType:string;code:number};
export type Readings={rooms:RoomReading[];modules:ModuleReading[];diagnostics?:DeviceDiagnostic[];homesTotal?:number;homesAvailable?:number};
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
  const rooms: RoomReading[] = [], modules: ModuleReading[] = [],diagnostics:DeviceDiagnostic[]=[];
  let homesAvailable=0;
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
    // A module-level error must not discard measurements from other modules/homes.
    // Report only the home index, module type and numeric code, never module MACs.
    const errors=Array.isArray(statusResponse?.body?.errors)?statusResponse.body.errors:[];
    for(const item of errors){
      if(!item||typeof item!=='object')continue;
      const code=(item as {code?:unknown}).code;
      const moduleId=(item as {id?:unknown}).id;
      if(typeof code!=='number'||!Number.isInteger(code))continue;
      const module=Array.isArray(home.modules)?home.modules.find((m:{id?:unknown})=>m.id===moduleId):null;
      diagnostics.push({homeIndex:homes.indexOf(home)+1,moduleType:typeof module?.type==='string'?module.type:'unknown',code});
    }
    if(!Array.isArray(status?.rooms)||!Array.isArray(status?.modules)){
      if(!errors.length)diagnostics.push({homeIndex:homes.indexOf(home)+1,moduleType:'unknown',code:-1});
      continue;
    }
    homesAvailable++;
    for (const room of status.rooms) {
      if (typeof room.id !== 'string') continue;
      rooms.push({ homeId: home.id, roomId: room.id, moduleId: roomModules.get(`${home.id}:${room.id}`) ?? null, measuredTemperature: numeric(room.therm_measured_temperature), setpointTemperature: numeric(room.therm_setpoint_temperature), setpointMode: typeof room.therm_setpoint_mode === 'string' ? room.therm_setpoint_mode : null, outdoorTemperature: numeric(room.outdoor_temperature) });
    }
    for (const module of status.modules) {
      if (typeof module.id !== 'string') continue;
      modules.push({ homeId: home.id, moduleId: module.id, heating: boolean(module.boiler_status), boilerFault: boolean(module.boiler_fault), reachable: boolean(module.reachable), batteryPercent: numeric(module.battery_percent) });
    }
  }
  return {rooms,modules,...(diagnostics.length||homesAvailable!==homes.length?{diagnostics,homesTotal:homes.length,homesAvailable}:{})};
}
