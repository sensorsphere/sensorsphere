import type { Pool } from 'pg';
import type { Readings } from './telemetry.js';

export type ThermostatCommand={mode:'manual'|'schedule'|'away'|'hg';temperature?:number;durationSeconds?:number};
export type JournalStatus='pending'|'accepted'|'verified'|'mismatch'|'failed'|'unknown';
export function matchesCommand(command:ThermostatCommand,mode:string|null,setpoint:number|null):boolean {
  return mode===command.mode&&(command.mode!=='manual'||(setpoint!==null&&Math.abs(setpoint-command.temperature!)<=0.05));
}
export async function startCommand(pool:Pool,connectionId:string,actor:string,command:ThermostatCommand):Promise<string>{
  const result=await pool.query<{id:string}>(`INSERT INTO netatmo_command_journal(connection_id,requested_by,mode,temperature,duration_seconds)
    VALUES($1,$2,$3,$4,$5) RETURNING id`,[connectionId,actor,command.mode,command.temperature??null,command.durationSeconds??null]);
  return result.rows[0]!.id;
}
export async function updateCommand(pool:Pool,id:string,status:JournalStatus,details:{upstreamStatus?:number;returnedMode?:string|null;returnedSetpoint?:number|null;errorCode?:string;errorMessage?:string}={}):Promise<void>{
  await pool.query(`UPDATE netatmo_command_journal SET status=$2,upstream_status=COALESCE($3,upstream_status),
    returned_mode=COALESCE($4,returned_mode),returned_setpoint=COALESCE($5,returned_setpoint),
    error_code=$6,error_message=$7,updated_at=NOW() WHERE id=$1`,
    [id,status,details.upstreamStatus??null,details.returnedMode??null,details.returnedSetpoint??null,details.errorCode??null,details.errorMessage??null]);
}
export async function recentCommands(pool:Pool,connectionId:string){
  const result=await pool.query(`SELECT id,connection_id AS "connectionId",requested_at AS "requestedAt",requested_by AS "requestedBy",
    mode,temperature,duration_seconds AS "durationSeconds",status,returned_mode AS "returnedMode",
    returned_setpoint AS "returnedSetpoint",collected_at AS "collectedAt",error_code AS "errorCode",
    error_message AS "errorMessage" FROM netatmo_command_journal
    WHERE connection_id=$1 ORDER BY requested_at DESC LIMIT 25`,[connectionId]);
  return {commands:result.rows};
}
export async function reconcileCommands(pool:Pool,connectionId:string,readings:Readings,collectionAt:Date):Promise<number>{
  const room=readings.rooms.find(r=>r.homeId==='sim-home-02'&&r.roomId==='sim-room-02');
  if(connectionId!=='sim-02'||!room)return 0;
  const pending=await pool.query<{id:string;mode:ThermostatCommand['mode'];temperature:number|null;requested_at:Date}>(`
    SELECT id,mode,temperature,requested_at FROM netatmo_command_journal
    WHERE connection_id=$1 AND status='accepted' AND requested_at<=$2 ORDER BY requested_at DESC LIMIT 25`,[connectionId,collectionAt]);
  let count=0;
  for(const row of pending.rows){
    // A later command supersedes older ones; never incorrectly claim old commands were verified.
    const latest=pending.rows[0]!;
    if(row.id!==latest.id){
      await pool.query(`UPDATE netatmo_command_journal SET status='unknown',error_code='SUPERSEDED',error_message='A later command was issued before collection',updated_at=NOW() WHERE id=$1 AND status='accepted'`,[row.id]);count++;continue;
    }
    const ok=matchesCommand({mode:row.mode,temperature:row.temperature??undefined},room.setpointMode,room.setpointTemperature);
    await pool.query(`UPDATE netatmo_command_journal SET status=$2,collected_at=$3,updated_at=NOW(),
      error_code=$4,error_message=$5 WHERE id=$1 AND status='accepted'`,
      [row.id,ok?'verified':'mismatch',collectionAt,ok?null:'COLLECTED_STATE_MISMATCH',ok?null:'Collected thermostat state does not match requested command']);
    count++;
  }
  return count;
}
