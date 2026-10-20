/**
 * NET-ANDROID-RE-04: read-only, opt-in exploratory historical measurement reader.
 *
 * IMPORTANT: Netatmo's beg_time/step_time may track the requested date window.
 * Do not present grid timestamps as independently verified acquisition times.
 * Never feed these samples to current telemetry/command reconciliation.
 */
export type HistoricalTemperature = {
  provenance: 'netatmo:getroommeasure:historical';
  homeId: string;
  roomId: string;
  temperatureCelsius: number | null;
  queriedAt: string;
  claimedAcquisitionAt: null;
  timestampConfidence: 'unverified';
  currentTelemetry: false;
  status: 'historical-available' | 'no-measurements';
  warnings: string[];
};

export async function probeHistoricalRoomTemperature(input: {
  baseUrl: string;
  accessToken: string;
  homeId: string;
  roomId: string;
  enabled?: boolean;
  now?: Date;
  fetcher?: typeof fetch;
}): Promise<HistoricalTemperature> {
  if (input.enabled !== true) throw new Error('Historical Netatmo probe disabled by default');
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid reference time');
  const endpoint = new URL('/api/getroommeasure', input.baseUrl);
  if (endpoint.protocol !== 'https:') throw new Error('Historical Netatmo probe requires HTTPS');
  const end = Math.floor(now.getTime()/1000);
  const params = {home_id:input.homeId,room_id:input.roomId,type:'temperature',scale:'30min',date_begin:String(end-86400),date_end:String(end),limit:'48'};
  for (const [key,value] of Object.entries(params)) endpoint.searchParams.set(key,value);
  const response = await (input.fetcher ?? fetch)(endpoint, {
    method:'GET',
    headers:{authorization:`Bearer ${input.accessToken}`},
    redirect:'error',
    signal:AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Historical Netatmo HTTP ${response.status}`);
  const payload: unknown = await response.json();
  const root = payload && typeof payload === 'object' ? payload as Record<string,unknown> : {};
  if (root.status !== 'ok' || !Array.isArray(root.body)) throw new Error('Invalid historical Netatmo response');
  // Each element of value is a vector (typically [temperature]). Null, malformed,
  // NaN and implausible readings cannot be used as a temperature.
  let last: number | null = null;
  for (const raw of root.body) {
    if (!raw || typeof raw !== 'object') continue;
    const segment = raw as Record<string,unknown>;
    if (!Array.isArray(segment.value)) continue;
    for (const point of segment.value) {
      const temp = Array.isArray(point) ? point[0] : null;
      if (typeof temp === 'number' && Number.isFinite(temp) && temp >= -50 && temp <= 80) last = temp;
    }
  }
  return {
    provenance:'netatmo:getroommeasure:historical',homeId:input.homeId,roomId:input.roomId,
    temperatureCelsius:last,queriedAt:now.toISOString(),claimedAcquisitionAt:null,
    timestampConfidence:'unverified',currentTelemetry:false,
    status:last === null ? 'no-measurements' : 'historical-available',
    warnings:['Sampling times are not verified acquisition timestamps','Not suitable for live heating status or command reconciliation'],
  };
}
