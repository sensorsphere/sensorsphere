import type { Pool } from 'pg';
import { listConnections } from './connections.js';

type MetricRow={external_id:string;metric_key:string;time:Date|null;value_double:number|null;value_text:string|null;value_boolean:boolean|null};
type DeviceRow={id:string;name:string;device_type:string;identity:string;parent_device_id:string|null;last_seen_at:Date|null};
export type HeatingMetric={value:number|string|boolean|null;recordedAt:string|null};
export type HeatingDevice={id:string;name:string;type:'thermostat'|'relay';parentId:string|null;lastSeenAt:string|null;homeId:string|null;moduleId:string|null;metrics:Record<string,HeatingMetric>};
export type HeatingConnection={id:string;name:string;enabled:boolean;oauthStatus:string;permissions:{read:string;write:string};lastSuccessAt:string|null;lastError:string|null;intervalSeconds:number;source:'simulator'|'external';controlCapability:'simulator-enabled'|'read-only';devices:HeatingDevice[]};

export function assetModuleIdentity(externalId:string,connectionId:string):string|null {
  const prefix=connectionId+':netatmo:module:';
  if(!externalId.startsWith(prefix))return null;
  const suffix=externalId.slice(prefix.length);
  const delimiter=suffix.indexOf(':');
  return delimiter>0&&delimiter<suffix.length-1?suffix:null;
}
export function registryModuleIdentity(identity:string,connectionId:string):string|null {
  const prefix=connectionId+':';
  return identity.startsWith(prefix)?identity.slice(prefix.length):null;
}
export function controlCapability(connectionId:string,source:'simulator'|'external',write:string):'simulator-enabled'|'read-only' {
  return connectionId==='sim-02'&&source==='simulator'&&write==='granted'?'simulator-enabled':'read-only';
}
export function readingValue(row:MetricRow):HeatingMetric {
  return {value:row.value_double??row.value_boolean??row.value_text??null,recordedAt:row.time?.toISOString()??null};
}

export async function getNetatmoHeatingOverview(pool:Pool):Promise<{connections:HeatingConnection[];generatedAt:string}> {
  const connections=await listConnections(pool);
  const result:HeatingConnection[]=[];
  for(const connection of connections) {
    const prefix=connection.id+':';
    const [registry,metrics]=await Promise.all([
      pool.query<DeviceRow>(`SELECT d.id,d.name,d.device_type,i.value AS identity,d.parent_device_id,d.last_seen_at
        FROM device_registry_identities i JOIN device_registry_devices d ON d.id=i.device_id
        WHERE i.identity_type='NETATMO_MODULE_ID' AND left(i.value,length($1))=$1
        ORDER BY d.device_type,d.name`,[prefix]),
      pool.query<MetricRow>(`SELECT a.external_id,m.metric_key,latest.time,latest.value_double,latest.value_text,latest.value_boolean
        FROM assets a JOIN asset_metrics m ON m.asset_id=a.id
        LEFT JOIN LATERAL (
          SELECT o.time,o.value_double,o.value_text,o.value_boolean FROM observations o
          WHERE o.asset_metric_id=m.id ORDER BY o.time DESC LIMIT 1
        ) latest ON TRUE
        WHERE left(a.external_id,length($1))=$1 AND a.manufacturer='Netatmo'`,[prefix])
    ]);
    const deviceMetrics=new Map<string,Record<string,HeatingMetric>>();
    for(const metric of metrics.rows) {
      const moduleId=assetModuleIdentity(metric.external_id,connection.id);
      if(!moduleId)continue;
      const collected=deviceMetrics.get(moduleId)??{};
      collected[metric.metric_key]=readingValue(metric);
      deviceMetrics.set(moduleId,collected);
    }
    const devices:HeatingDevice[]=registry.rows
      .filter(d=>d.device_type==='thermostat'||d.device_type==='gateway')
      .map(d=>({
        id:d.id,name:d.name,type:d.device_type==='thermostat'?'thermostat' as const:'relay' as const,
        parentId:d.parent_device_id,lastSeenAt:d.last_seen_at?.toISOString()??null,
        homeId:registryModuleIdentity(d.identity,connection.id)?.split(':')[0]??null,
        moduleId:registryModuleIdentity(d.identity,connection.id)?.split(':').slice(1).join(':')??null,
        metrics:deviceMetrics.get(registryModuleIdentity(d.identity,connection.id)??'')??{}
      }));
    // Only the explicitly approved simulator endpoint may advertise write control.
    // An OAuth write scope alone never enables commands to a real Netatmo device.
    const source=((connection.id==='sim-01'&&new URL(connection.base_url).host==='100.64.0.8:8091')||(connection.id==='sim-02'&&new URL(connection.base_url).host==='100.64.0.8:8092'))?'simulator' as const:'external' as const;
    result.push({
      source,controlCapability:controlCapability(connection.id,source,connection.oauth_permissions.write),
      id:connection.id,name:connection.display_name,enabled:connection.enabled,
      oauthStatus:connection.oauth_status,
      permissions:connection.oauth_permissions,
      lastSuccessAt:connection.collect_last_success_at?new Date(connection.collect_last_success_at).toISOString():null,
      lastError:connection.collect_last_error,
      intervalSeconds:connection.collect_interval_seconds,
      devices
    });
  }
  return {connections:result,generatedAt:new Date().toISOString()};
}
