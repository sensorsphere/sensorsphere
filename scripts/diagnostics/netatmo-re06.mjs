import fs from 'node:fs';
import pg from 'pg';
import {getConnection} from './features/netatmo-energy/connections.js';
import {getNetatmoAccessToken,netatmoEncryptionKey} from './features/netatmo-energy/credentials.js';
// Executed ONLY inside the DEV API container. No DB writes or commands.
const out='/app/data/netatmo-re06';
const pool=new pg.Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT??5432),database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD});
const begin=Date.now(),duration=4*60*60*1000,interval=5*60*1000;
const fixedEnd=Math.floor(begin/1000)-1800;
const append=(f,v)=>fs.appendFileSync(out+'/'+f,JSON.stringify(v)+'\n',{mode:0o600});
async function cycle(){
 const c=await getConnection(pool,'homefcs-01');
 if(!c||new URL(c.baseUrl).hostname!=='api.netatmo.com')throw Error('Real official connection unavailable');
 const t=await getNetatmoAccessToken(pool,c,netatmoEncryptionKey(),'netatmo-energy:homefcs-01');
 if(!t)throw Error('Authorization unavailable');
 const hdr={authorization:'Bearer '+t};
 const r=await fetch(new URL('/api/homesdata',c.baseUrl),{headers:hdr,signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('Homesdata unavailable');
 const home=(await r.json())?.body?.homes?.[0],room=home?.rooms?.[0];
 if(typeof home?.id!=='string'||typeof room?.id!=='string')throw Error('Room unavailable');
 const now=Math.floor(Date.now()/1000),fixedStart=fixedEnd-10800;
 const cases=[['A_sliding',now-7200,now],['B_fixed',fixedStart,fixedEnd],['B_plus_60',fixedStart+60,fixedEnd+60],['B_plus_180',fixedStart+180,fixedEnd+180],['B_plus_600',fixedStart+600,fixedEnd+600]];
 const results=[];
 for(const [name,start,end] of cases){
  const url=new URL('/api/getroommeasure',c.baseUrl);
  for(const [k,v] of Object.entries({home_id:home.id,room_id:room.id,type:'temperature',scale:'30min',date_begin:start,date_end:end,limit:48}))url.searchParams.set(k,String(v));
  try{
   const resp=await fetch(url,{headers:hdr,method:'GET',redirect:'error',signal:AbortSignal.timeout(10000)});
   const json=await resp.json().catch(()=>null);
   const segments=(Array.isArray(json?.body)?json.body:[]).map(s=>({gridStart:typeof s.beg_time==='number'?s.beg_time:null,gridStep:s.step_time??null,values:(Array.isArray(s.value)?s.value:[]).map(v=>Array.isArray(v)&&typeof v[0]==='number'&&Number.isFinite(v[0])?v[0]:null)}));
   const values=segments.flatMap(s=>s.values).filter(v=>v!==null);
   results.push({name,http:resp.status,status:json?.status??null,requestedStart:start,requestedEnd:end,segments,samples:values.length,lastTemperature:values.at(-1)??null});
  }catch(e){results.push({name,error:e?.name??'unknown'});}
 }
 const record={at:new Date().toISOString(),elapsedMinutes:Math.floor((Date.now()-begin)/60000),results};
 append('samples.jsonl',record);
 console.log(JSON.stringify({at:record.at,summary:results.map(x=>({name:x.name,http:x.http,samples:x.samples,lastTemperature:x.lastTemperature,gridStart:x.segments?.[0]?.gridStart}))}));
}
try{
 let n=0;
 while(true){
  try{await cycle();}catch(e){append('events.jsonl',{at:new Date().toISOString(),errorCategory:'cycle_failed',message:String(e?.message??'unknown').slice(0,80)});}
  n++;
  if(process.argv[2]!=='--loop'||Date.now()-begin>=duration)break;
  await new Promise(r=>setTimeout(r,interval));
 }
 append('events.jsonl',{at:new Date().toISOString(),event:'finished',cycles:n});
}finally{await pool.end();}
