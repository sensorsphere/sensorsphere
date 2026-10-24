/**
 * RE-07: an explicitly non-chronological Netatmo history representation.
 * Neither the query grid nor the polling time is a verified sensor acquisition time.
 */
export type HistoricalGridPoint = {
  position: number;
  temperatureCelsius: number | null;
  // Netatmo's reported grid coordinate is not a sensor timestamp.
  reportedGridTime: string | null;
};
export type HistoricalGridSeries = {
  provenance: 'netatmo:getroommeasure:historical';
  quality: 'historical_unverified_timestamp';
  currentTelemetry: false;
  queriedAt: string;
  requestedWindow: {begin: string; end: string; scale: '30min'};
  acquisitionAt: null;
  sourceGridStepSeconds: number | null;
  points: HistoricalGridPoint[];
  warning: string;
};

export function parseHistoricalGrid(input: unknown, window: {begin: number; end: number}, queriedAt: string): HistoricalGridSeries {
  if (!Number.isInteger(window.begin) || !Number.isInteger(window.end) || window.end <= window.begin ||
    !Number.isFinite(Date.parse(queriedAt))) throw new Error('Invalid historical query bounds');
  const root = input && typeof input === 'object' ? input as Record<string,unknown> : {};
  if(root.status !== 'ok' || !Array.isArray(root.body)) throw new Error('Invalid historical series response');
  const points: HistoricalGridPoint[] = [];
  let step: number | null = null;
  for (const raw of root.body.slice(0,48)) {
    if (!raw || typeof raw !== 'object') continue;
    const segment = raw as Record<string,unknown>;
    if (!Array.isArray(segment.value)) continue;
    const gridStart=typeof segment.beg_time==='number'&&Number.isFinite(segment.beg_time)?segment.beg_time:null;
    const gridStep=typeof segment.step_time==='number'&&Number.isInteger(segment.step_time)&&segment.step_time>0?segment.step_time:null;
    if(step===null)step=gridStep;
    for(const [idx,point] of segment.value.entries()){
      if(points.length>=48)break;
      const val=Array.isArray(point)?point[0]:null;
      const safe=typeof val==='number'&&Number.isFinite(val)&&val>=-50&&val<=80?val:null;
      const gridTime=gridStart!==null&&gridStep!==null?new Date((gridStart+idx*gridStep)*1000).toISOString():null;
      points.push({position:points.length+1,temperatureCelsius:safe,reportedGridTime:gridTime});
    }
  }
  return {
    provenance:'netatmo:getroommeasure:historical',
    quality:'historical_unverified_timestamp',
    currentTelemetry:false,queriedAt,
    requestedWindow:{begin:new Date(window.begin*1000).toISOString(),end:new Date(window.end*1000).toISOString(),scale:'30min'},
    acquisitionAt:null,sourceGridStepSeconds:step,points,
    warning:'Grid coordinates are request-dependent; they are NOT sensor acquisition timestamps',
  };
}
