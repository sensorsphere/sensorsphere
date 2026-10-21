import fs from 'node:fs';
import path from 'node:path';
// NET-ANDROID-RE-06-C: offline-only analysis of user-recorded Android readings.
// No network, database access, heating commands, or credentials.
const [,,samplesFile,manualFile,outputFile]=process.argv;
if(!samplesFile||!manualFile||!outputFile)throw Error('Usage: node netatmo-re06-compare.mjs samples.jsonl manual.json report.json');
const samples=fs.readFileSync(samplesFile,'utf8').trim().split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x));
const manual=JSON.parse(fs.readFileSync(manualFile,'utf8'));
if(!Array.isArray(manual))throw Error('Manual data must be an array');
const api=samples.flatMap(s=>{
 const r=s.results?.find(x=>x.name==='A_sliding');
 return r?.http===200&&typeof r.lastTemperature==='number'&&Number.isFinite(r.lastTemperature)?[{at:s.at,t:new Date(s.at).getTime(),temp:r.lastTemperature}]:[];
}).filter(x=>Number.isFinite(x.t)).sort((a,b)=>a.t-b.t);
const comparisons=manual.map((m,i)=>{
 const mt=new Date(m.at).getTime();
 if(!Number.isFinite(mt)||typeof m.temperatureCelsius!=='number'||!Number.isFinite(m.temperatureCelsius)||m.temperatureCelsius< -50||m.temperatureCelsius>80)
  return {index:i+1,status:'invalid_manual_entry'};
 if(!api.length)return {index:i+1,at:m.at,manualCelsius:m.temperatureCelsius,status:'no_api_samples'};
 const nearest=api.reduce((prev,x)=>Math.abs(x.t-mt)<Math.abs(prev.t-mt)?x:prev,api[0]);
 const seconds=Math.round(Math.abs(nearest.t-mt)/1000);
 return {index:i+1,at:m.at,manualCelsius:m.temperatureCelsius,apiQueriedAt:nearest.at,apiHistoricalCelsius:nearest.temp,
   offsetSeconds:seconds,deltaCelsius:Number((m.temperatureCelsius-nearest.temp).toFixed(2)),
   status:seconds<=180?'paired':seconds<=360?'distant_pair':'not_comparable'};
});
const paired=comparisons.filter(x=>x.status==='paired');
const result={method:'nearest A_sliding API query time; NOT a proven temperature acquisition time',
  limitation:'API may report averaged/historical readings; matching temperatures do not prove freshness',
  apiCycles:api.length,manualCount:manual.length,pairedCount:paired.length,
  meanAbsoluteDifferenceCelsius:paired.length?Number((paired.reduce((s,x)=>s+Math.abs(x.deltaCelsius),0)/paired.length).toFixed(3)):null,
  comparisons};
fs.writeFileSync(outputFile,JSON.stringify(result,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({manualCount:result.manualCount,pairedCount:result.pairedCount,meanAbsoluteDifferenceCelsius:result.meanAbsoluteDifferenceCelsius}));
