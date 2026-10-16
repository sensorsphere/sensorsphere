import React from "react";
import { Alert, Badge, Button, Card, Group, PasswordInput, Stack, Table, Text, TextInput, Title } from "@mantine/core";

type Connection={id:string;display_name:string;base_url:string;client_id:string;redirect_uri:string;enabled:boolean;oauth_status:string;oauth_last_error:string|null;oauth_last_error_at:string|null};
const root="/api/v1/integrations/netatmo/connections";
async function api(path:string, init?:RequestInit):Promise<any> {
  const response=await fetch(root+path,{credentials:"same-origin",...init});
  const body=await response.json().catch(()=>({}));
  if(!response.ok){const details=Array.isArray(body.details)?body.details.map((d:{field:string;message:string})=>`${d.field}: ${d.message}`).join('; '):'';throw new Error((body.error||`HTTP ${response.status}`)+(details?' — '+details:''));}
  return body;
}
export function NetatmoConnectionsPanel({onOpenDevice,onOpenHistory,onOpenAssets}:{onOpenDevice?:(id:string)=>void;onOpenHistory?:()=>void;onOpenAssets?:(connectionId:string)=>void}={}){
  const [connections,setConnections]=React.useState<Connection[]>([]);
  const [error,setError]=React.useState("");
  const [message,setMessage]=React.useState("");
  const [busy,setBusy]=React.useState(false);
  const [report,setReport]=React.useState<{operation:"discovery"|"collection";connectionId:string;created?:number;updated?:number;assets?:number;observations?:number;devices?:{id:string;name:string;deviceType:string;deviceClass:string;action:string}[];at:string}|null>(null);
  const [id,setId]=React.useState("");
  const [editing,setEditing]=React.useState<string|null>(null);
  const clearForm=()=>{setEditing(null);setId("");setDisplayName("");setBaseUrl("");setClientId("");setClientSecret("");};
  const beginEdit=(c:Connection)=>{setEditing(c.id);setId(c.id);setDisplayName(c.display_name);setBaseUrl(c.base_url);setClientId(c.client_id);setClientSecret("");setError("");setMessage("");};
  const [displayName,setDisplayName]=React.useState("");
  const [baseUrl,setBaseUrl]=React.useState("");
  const [clientId,setClientId]=React.useState("");
  const [clientSecret,setClientSecret]=React.useState("");
  const [redirectUri,setRedirectUri]=React.useState("");
  const refresh=React.useCallback(async()=>{try{const result=await api("");setConnections(result.connections);setError("");}catch(e){setError(String(e));}},[]);
  React.useEffect(()=>{void refresh();void api("/redirect-uri").then(result=>setRedirectUri(result.redirectUri)).catch(e=>setError(String(e)));},[refresh]);
  async function action(label:string,task:()=>Promise<void>){
    setBusy(true);setError("");setMessage("");
    try{await task();setMessage(current=>current||label);await refresh();}catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }
  return <Stack gap="md">
    <Group justify="space-between"><Title order={3}>Netatmo · Connections</Title><Button variant="light" onClick={()=>void refresh()}>Refresh</Button></Group>
    <Text size="sm" c="dimmed">Each connection has independent OAuth credentials. Secrets and access tokens are never displayed.</Text>
    {error&&<Alert color="red">{error}</Alert>}
    {message&&<Alert color="green">{message}</Alert>}
    <Card withBorder><Stack gap="sm"><Title order={4}>Configured connections</Title>
      <Table striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Endpoint</Table.Th><Table.Th>State</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead>
      <Table.Tbody>{connections.map(c=><Table.Tr key={c.id}><Table.Td><Text fw={600}>{c.display_name}</Text><Text size="xs" c="dimmed">{c.id}</Text></Table.Td><Table.Td>{c.base_url}</Table.Td><Table.Td><Badge color={c.enabled?"green":"gray"}>{c.enabled?"Enabled":"Disabled"}</Badge><Text size="xs" mt="xs" c={c.oauth_status==="authorized"?"green":c.oauth_status==="authorization_failed"?"red":"orange"}>{c.oauth_status==="authorized"?"Authorized":c.oauth_status==="authorization_failed"?"Authorization failed":"Not authorized"}</Text>{c.oauth_last_error&&<Text size="xs" c="red">{c.oauth_last_error}</Text>}</Table.Td><Table.Td><Group gap="xs">
        <Button size="xs" variant="light" disabled={busy} onClick={()=>beginEdit(c)}>Edit</Button>
        <Button size="xs" variant="subtle" color={c.enabled?"orange":"green"} disabled={busy} onClick={()=>void action("Connection state updated",async()=>{await api(`/${encodeURIComponent(c.id)}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({enabled:!c.enabled})});})}>{c.enabled?"Disable":"Enable"}</Button>
        <Button size="xs" disabled={busy||!c.enabled} onClick={()=>void action("OAuth authorization opened",async()=>{const data=await api(`/${encodeURIComponent(c.id)}/authorize`);const popup=window.open("about:blank","_blank");if(popup){popup.opener=null;popup.location.replace(data.authorizationUrl);}else{setMessage("Allow pop-ups for SensorSphere, then retry authorization");}})}>Authorize</Button>
        <Button size="xs" variant="light" disabled={busy||!c.enabled} onClick={()=>void action("Discovery completed",async()=>{const result=await api(`/${encodeURIComponent(c.id)}/discovery/import`,{method:"POST"});setReport({operation:"discovery",connectionId:c.id,created:result.created,updated:result.updated,devices:result.devices,at:new Date().toLocaleString()});})}>Discover</Button>
        <Button size="xs" variant="light" disabled={busy||!c.enabled} onClick={()=>void action("Collection completed",async()=>{const result=await api(`/${encodeURIComponent(c.id)}/telemetry/collect`,{method:"POST"});setReport({operation:"collection",connectionId:c.id,assets:result.assets,observations:result.observations,at:new Date().toLocaleString()});})}>Collect</Button>
      </Group></Table.Td></Table.Tr>)}</Table.Tbody></Table>
      {connections.length===0&&<Text size="sm" c="dimmed">No connections configured. The legacy Netatmo integration is preserved separately.</Text>}
    </Stack></Card>
    {report&&<Card withBorder><Stack gap="xs"><Group justify="space-between"><Title order={4}>{report.operation==="discovery"?"Discovery report":"Collection report"} · {report.connectionId}</Title><Button size="xs" variant="subtle" onClick={()=>setReport(null)}>Close</Button></Group><Text size="xs" c="dimmed">{report.at}</Text>{report.operation==="discovery"?<><Group gap="md"><Badge color="green">Created: {report.created??0}</Badge><Badge color="blue">Updated: {report.updated??0}</Badge><Badge color="gray">Total: {(report.created??0)+(report.updated??0)}</Badge></Group>{report.devices?.length?<Table striped><Table.Thead><Table.Tr><Table.Th>Device</Table.Th><Table.Th>Type / class</Table.Th><Table.Th>Action</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{report.devices.map(d=><Table.Tr key={d.id}><Table.Td><Button variant="subtle" size="compact-sm" onClick={()=>onOpenDevice?.(d.id)} disabled={!onOpenDevice}>{d.name}</Button><Text size="xs" c="dimmed">{d.id}</Text></Table.Td><Table.Td>{d.deviceType} / {d.deviceClass}</Table.Td><Table.Td><Badge color={d.action==="created"?"green":"blue"}>{d.action}</Badge></Table.Td></Table.Tr>)}</Table.Tbody></Table>:<Text size="sm">No devices returned.</Text>}</>:<Group gap="md"><Badge color="blue">Assets: {report.assets??0}</Badge><Badge color="green">Observations: {report.observations??0}</Badge><Button size="xs" variant="light" onClick={onOpenInventory} disabled={!onOpenInventory}>View assets</Button><Button size="xs" variant="light" onClick={onOpenHistory} disabled={!onOpenHistory}>View in History</Button></Group>}</Stack></Card>}
    <Card withBorder><Stack gap="sm"><Title order={4}>{editing?`Edit connection · ${editing}`:"Add connection"}</Title>
      <TextInput label="Connection ID" description="Unique technical identifier for this connection (example: sim-01)." placeholder="sim-01" value={id} onChange={e=>setId(e.currentTarget.value)} disabled={Boolean(editing)} required/>
      <TextInput label="Display name" description="Name shown in SensorSphere (example: Netatmo SIM-01)." placeholder="Netatmo SIM-01" value={displayName} onChange={e=>setDisplayName(e.currentTarget.value)} required/>
      <TextInput label="Base URL" description="Netatmo API endpoint of this simulator; SIM-02 uses port 8092." placeholder="http://100.64.0.8:8091" value={baseUrl} onChange={e=>setBaseUrl(e.currentTarget.value)} required/>
      <TextInput label="OAuth client ID" description="Client identifier configured on the simulator." placeholder="sim-client" value={clientId} onChange={e=>setClientId(e.currentTarget.value)} required/>
      <PasswordInput label="OAuth client secret" description={editing?"Leave empty to keep the existing encrypted secret. Changing it requires reauthorization.":"Secret configured on the simulator; never displayed after saving."} placeholder="Simulator OAuth client secret" value={clientSecret} onChange={e=>setClientSecret(e.currentTarget.value)} required={!editing}/>
      <TextInput label="OAuth redirect URI (automatic)" description="Calculated by the SensorSphere server from SENSORSPHERE_PUBLIC_URL; identical for all connections on this instance." value={redirectUri} readOnly rightSection={<Button size="compact-xs" variant="subtle" onClick={()=>void navigator.clipboard.writeText(redirectUri)} disabled={!redirectUri}>Copy</Button>} rightSectionWidth={62}/>
      <Group justify="flex-end">{editing&&<Button variant="subtle" onClick={clearForm} disabled={busy}>Cancel</Button>}<Button disabled={busy||!id||!displayName||!baseUrl||!clientId||(!editing&&!clientSecret)||!redirectUri} onClick={()=>void action(editing?"Connection updated":"Connection created",async()=>{if(editing){const result=await api(`/${encodeURIComponent(editing)}`,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({displayName,baseUrl,clientId,...(clientSecret?{clientSecret}:{})})});clearForm();if(result.reauthorizationRequired)setMessage("Connection updated. OAuth parameters changed: click Authorize to reconnect.");}else{await api("",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id,displayName,baseUrl,clientId,clientSecret,enabled:true})});clearForm();}})}>{editing?"Save changes":"Add connection"}</Button></Group>
    </Stack></Card>
  </Stack>;
}
