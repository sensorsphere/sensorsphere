import React from "react";
import { Alert, Badge, Button, Card, Group, PasswordInput, Stack, Table, Text, TextInput, Title } from "@mantine/core";

type Connection={id:string;display_name:string;base_url:string;client_id:string;redirect_uri:string;enabled:boolean};
const root="/api/v1/integrations/netatmo/connections";
async function api(path:string, init?:RequestInit):Promise<any> {
  const response=await fetch(root+path,{credentials:"same-origin",...init});
  const body=await response.json().catch(()=>({}));
  if(!response.ok){const details=Array.isArray(body.details)?body.details.map((d:{field:string;message:string})=>`${d.field}: ${d.message}`).join('; '):'';throw new Error((body.error||`HTTP ${response.status}`)+(details?' — '+details:''));}
  return body;
}
export function NetatmoConnectionsPanel(){
  const [connections,setConnections]=React.useState<Connection[]>([]);
  const [error,setError]=React.useState("");
  const [message,setMessage]=React.useState("");
  const [busy,setBusy]=React.useState(false);
  const [id,setId]=React.useState("");
  const [displayName,setDisplayName]=React.useState("");
  const [baseUrl,setBaseUrl]=React.useState("");
  const [clientId,setClientId]=React.useState("");
  const [clientSecret,setClientSecret]=React.useState("");
  const [redirectUri,setRedirectUri]=React.useState("");
  const refresh=React.useCallback(async()=>{try{const result=await api("");setConnections(result.connections);setError("");}catch(e){setError(String(e));}},[]);
  React.useEffect(()=>{void refresh();void api("/redirect-uri").then(result=>setRedirectUri(result.redirectUri)).catch(e=>setError(String(e)));},[refresh]);
  async function action(label:string,task:()=>Promise<void>){
    setBusy(true);setError("");setMessage("");
    try{await task();setMessage(label);await refresh();}catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }
  return <Stack gap="md">
    <Group justify="space-between"><Title order={3}>Netatmo · Connections</Title><Button variant="light" onClick={()=>void refresh()}>Refresh</Button></Group>
    <Text size="sm" c="dimmed">Each connection has independent OAuth credentials. Secrets and access tokens are never displayed.</Text>
    {error&&<Alert color="red">{error}</Alert>}
    {message&&<Alert color="green">{message}</Alert>}
    <Card withBorder><Stack gap="sm"><Title order={4}>Configured connections</Title>
      <Table striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Endpoint</Table.Th><Table.Th>State</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead>
      <Table.Tbody>{connections.map(c=><Table.Tr key={c.id}><Table.Td><Text fw={600}>{c.display_name}</Text><Text size="xs" c="dimmed">{c.id}</Text></Table.Td><Table.Td>{c.base_url}</Table.Td><Table.Td><Badge color={c.enabled?"green":"gray"}>{c.enabled?"Enabled":"Disabled"}</Badge></Table.Td><Table.Td><Group gap="xs">
        <Button size="xs" variant="subtle" color={c.enabled?"orange":"green"} disabled={busy} onClick={()=>void action("Connection state updated",async()=>{await api(`/${encodeURIComponent(c.id)}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({enabled:!c.enabled})});})}>{c.enabled?"Disable":"Enable"}</Button>
        <Button size="xs" disabled={busy||!c.enabled} onClick={()=>void action("OAuth authorization opened",async()=>{const data=await api(`/${encodeURIComponent(c.id)}/authorize`);const popup=window.open("about:blank","_blank");if(popup){popup.opener=null;popup.location.replace(data.authorizationUrl);}else{setMessage("Allow pop-ups for SensorSphere, then retry authorization");}})}>Authorize</Button>
        <Button size="xs" variant="light" disabled={busy||!c.enabled} onClick={()=>void action("Discovery completed",async()=>{await api(`/${encodeURIComponent(c.id)}/discovery/import`,{method:"POST"});})}>Discover</Button>
        <Button size="xs" variant="light" disabled={busy||!c.enabled} onClick={()=>void action("Collection completed",async()=>{await api(`/${encodeURIComponent(c.id)}/telemetry/collect`,{method:"POST"});})}>Collect</Button>
      </Group></Table.Td></Table.Tr>)}</Table.Tbody></Table>
      {connections.length===0&&<Text size="sm" c="dimmed">No connections configured. The legacy Netatmo integration is preserved separately.</Text>}
    </Stack></Card>
    <Card withBorder><Stack gap="sm"><Title order={4}>Add connection</Title>
      <TextInput label="Connection ID" description="Unique technical identifier for this connection (example: sim-01)." placeholder="sim-01" value={id} onChange={e=>setId(e.currentTarget.value)} required/>
      <TextInput label="Display name" description="Name shown in SensorSphere (example: Netatmo SIM-01)." placeholder="Netatmo SIM-01" value={displayName} onChange={e=>setDisplayName(e.currentTarget.value)} required/>
      <TextInput label="Base URL" description="Netatmo API endpoint of this simulator; SIM-02 uses port 8092." placeholder="http://100.64.0.8:8091" value={baseUrl} onChange={e=>setBaseUrl(e.currentTarget.value)} required/>
      <TextInput label="OAuth client ID" description="Client identifier configured on the simulator." placeholder="sim-client" value={clientId} onChange={e=>setClientId(e.currentTarget.value)} required/>
      <PasswordInput label="OAuth client secret" description="Secret configured on the simulator; never displayed after saving." placeholder="Simulator OAuth client secret" value={clientSecret} onChange={e=>setClientSecret(e.currentTarget.value)} required/>
      <TextInput label="OAuth redirect URI (automatic)" description="Calculated by the SensorSphere server from SENSORSPHERE_PUBLIC_URL; identical for all connections on this instance." value={redirectUri} readOnly rightSection={<Button size="compact-xs" variant="subtle" onClick={()=>void navigator.clipboard.writeText(redirectUri)} disabled={!redirectUri}>Copy</Button>} rightSectionWidth={62}/>
      <Group justify="flex-end"><Button disabled={busy||!id||!displayName||!baseUrl||!clientId||!clientSecret||!redirectUri} onClick={()=>void action("Connection created",async()=>{await api("",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id,displayName,baseUrl,clientId,clientSecret,enabled:true})});setClientSecret("");})}>Add connection</Button></Group>
    </Stack></Card>
  </Stack>;
}
