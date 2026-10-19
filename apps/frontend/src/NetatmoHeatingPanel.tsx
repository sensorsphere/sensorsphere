import React from "react";
import { Alert, Badge, Box, Button, Card, Divider, Grid, Group, Modal, NumberInput, SegmentedControl, Select, Stack, Text, Title } from "@mantine/core";

type Permission="granted"|"missing"|"unknown";
type Metric={value:number|string|boolean|null;recordedAt:string|null};
type Device={id:string;name:string;type:"thermostat"|"relay";parentId:string|null;lastSeenAt:string|null;metrics:Record<string,Metric>};
type Connection={id:string;name:string;enabled:boolean;oauthStatus:string;permissions:{read:Permission;write:Permission};lastSuccessAt:string|null;lastError:string|null;intervalSeconds:number;devices:Device[]};
type Overview={connections:Connection[];generatedAt:string};
type Mode="manual"|"schedule"|"away"|"hg";
type Command={mode:Mode;temperature?:number;durationSeconds?:number};
type CommandResponse={accepted:boolean;returnedState?:{mode:string|null;setpoint:number|null;measuredTemperature:number|null};elapsedMs:number};
const root="/api/v1/integrations/netatmo/connections";
async function request<T>(path:string,options?:RequestInit):Promise<T>{
  const response=await fetch(root+path,{credentials:"same-origin",...options});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body.error||`HTTP ${response.status}`);
  return body as T;
}
const age=(iso:string|null,now:number)=>iso?Math.max(0,Math.floor((now-new Date(iso).getTime())/60000)):null;
const timeLabel=(iso:string|null)=>iso?new Date(iso).toLocaleString():"No data";
const numberMetric=(metric:Metric|undefined)=>typeof metric?.value==="number"?metric.value:null;
const booleanMetric=(metric:Metric|undefined)=>typeof metric?.value==="boolean"?metric.value:null;
const textMetric=(metric:Metric|undefined)=>typeof metric?.value==="string"?metric.value:null;
const modeLabel=(mode:string|null)=>(mode?({manual:"Manual override",schedule:"Schedule",away:"Away",hg:"Frost protection"} as Record<string,string>)[mode]??mode:"Unknown");
const degrees=(value:number|null)=>value===null?"—":`${value.toFixed(1)} °C`;
const modeOptions=[{label:"Schedule",value:"schedule"},{label:"Manual",value:"manual"},{label:"Away",value:"away"},{label:"Frost protection",value:"hg"}];
function metricTimestamp(metrics:Record<string,Metric>){const dates=Object.values(metrics).map(v=>v.recordedAt).filter((x):x is string=>Boolean(x));return dates.length?dates.sort().at(-1)??null:null;}
function status(device:Device,connection:Connection,now:number){
  if(!connection.enabled)return {label:"Disabled",color:"gray"};
  const latest=metricTimestamp(device.metrics);
  if(!latest)return {label:"No telemetry",color:"gray"};
  const limit=Math.max(10,connection.intervalSeconds?connection.intervalSeconds/20:30);
  if((age(latest,now)??Infinity)>limit)return {label:"Stale data",color:"orange"};
  const reachable=booleanMetric(device.metrics.reachable);
  if(reachable===false)return {label:"Unreachable",color:"red"};
  return {label:reachable===true?"Reachable":"Recent data",color:"green"};
}
export function NetatmoHeatingPanel({onOpenAssets,onOpenDevice,onOpenHistory,onOpenConnections}:{onOpenAssets?:(id:string)=>void;onOpenDevice?:(id:string)=>void;onOpenHistory?:()=>void;onOpenConnections?:()=>void}={}){
  const [overview,setOverview]=React.useState<Overview|null>(null);
  const [selected,setSelected]=React.useState<string|null>(null);
  const [error,setError]=React.useState("");
  const [busy,setBusy]=React.useState(false);
  const [mode,setMode]=React.useState<Mode>("manual");
  const [temperature,setTemperature]=React.useState<number|string>(20);
  const [duration,setDuration]=React.useState("3600");
  const [confirm,setConfirm]=React.useState<Command|null>(null);
  const [result,setResult]=React.useState<CommandResponse|null>(null);
  const [resultMode,setResultMode]=React.useState<Mode|null>(null);
  const [now,setNow]=React.useState(Date.now());
  const load=React.useCallback(async()=>{
    try{const data=await request<Overview>("/heating/overview");setOverview(data);setError("");setNow(Date.now());}
    catch(e){setError(e instanceof Error?e.message:String(e));}
  },[]);
  React.useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),30000);return()=>window.clearInterval(timer);},[load]);
  const connections=overview?.connections??[];
  const active=connections.find(c=>c.id===selected)??connections[0];
  const thermostats=active?.devices.filter(d=>d.type==="thermostat")??[];
  const relays=active?.devices.filter(d=>d.type==="relay")??[];
  const controlAllowed=active?.id==="sim-02"&&active.enabled&&active.oauthStatus==="authorized"&&active.permissions.write==="granted";
  const submit=async()=>{
    if(!confirm||!active||busy)return;
    const sent=confirm;setBusy(true);setError("");setResult(null);setResultMode(null);
    try{
      const response=await request<CommandResponse>(`/${encodeURIComponent(active.id)}/control`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(sent)});
      setResult(response);setResultMode(sent.mode);setConfirm(null);
      await load();
    }catch(e){setError(e instanceof Error?e.message:String(e));setConfirm(null);}
    finally{setBusy(false);}
  };
  return <Stack gap="md">
    <Group justify="space-between" align="center">
      <Box><Title order={2}>Netatmo · Heating</Title><Text size="sm" c="dimmed">Thermostats, relays and heating commands · recorded state, not live measurements</Text></Box>
      <Group gap="xs"><Button variant="light" onClick={()=>void load()} disabled={busy}>Refresh</Button>{onOpenConnections&&<Button variant="subtle" onClick={onOpenConnections}>Connection settings</Button>}</Group>
    </Group>
    {error&&<Alert color="red" title="Netatmo">{error}</Alert>}
    {connections.length===0&&<Alert color="gray">No Netatmo connections configured.</Alert>}
    {connections.length>0&&<Group gap="xs" wrap="wrap">{connections.map(c=><Button key={c.id} size="sm" variant={active?.id===c.id?"filled":"light"} onClick={()=>{setSelected(c.id);setResult(null);setConfirm(null);}}>{c.name}</Button>)}</Group>}
    {active&&<>
      <Card withBorder radius="md" padding="md">
        <Group justify="space-between" align="center" wrap="wrap">
          <Box><Text fw={700}>{active.name}</Text><Text size="xs" c="dimmed">Connection {active.id} · Last successful collection: {timeLabel(active.lastSuccessAt)}</Text></Box>
          <Group gap="xs">
            <Badge color={active.enabled?"green":"gray"}>{active.enabled?"Enabled":"Disabled"}</Badge>
            <Badge color={active.permissions.read==="granted"?"green":active.permissions.read==="missing"?"red":"gray"}>Read: {active.permissions.read}</Badge>
            <Badge color={active.permissions.write==="granted"?"green":active.permissions.write==="missing"?"red":"gray"}>Write: {active.permissions.write}</Badge>
          </Group>
        </Group>
        {active.lastError&&<Text size="xs" c="red" mt="xs">Last collection error: {active.lastError}</Text>}
      </Card>
      <Grid gutter="md">
        {thermostats.map(device=>{
          const latest=metricTimestamp(device.metrics);
          const state=status(device,active,now);
          const measured=numberMetric(device.metrics.temperature);
          const target=numberMetric(device.metrics.setpoint);
          const heating=booleanMetric(device.metrics.heating);
          const modeCurrent=textMetric(device.metrics.mode);
          const battery=numberMetric(device.metrics.battery);
          const stale=state.label==="Stale data"||state.label==="No telemetry"||state.label==="Unreachable";
          const mayControl=controlAllowed&&!stale;
          return <Grid.Col span={{base:12,lg:8}} key={device.id}>
            <Card withBorder radius="md" padding="lg"><Stack gap="md">
              <Group justify="space-between" align="start"><Box><Title order={3}>{device.name}</Title><Text size="xs" c="dimmed">Thermostat · {active.id}</Text></Box><Badge color={state.color}>{state.label}</Badge></Group>
              <Grid gutter="sm">
                <Grid.Col span={6}><Box p="md" bg="var(--mantine-color-default-hover)" style={{borderRadius:12}}><Text size="xs" c="dimmed">Measured temperature</Text><Title order={1}>{degrees(measured)}</Title></Box></Grid.Col>
                <Grid.Col span={6}><Box p="md" bg="var(--mantine-color-default-hover)" style={{borderRadius:12}}><Text size="xs" c="dimmed">Active setpoint</Text><Title order={1}>{degrees(target)}</Title></Box></Grid.Col>
              </Grid>
              <Group justify="space-between" wrap="wrap">
                <Box><Text size="xs" c="dimmed">Heating demand (thermostat)</Text><Badge color={heating===true?"orange":heating===false?"gray":"gray"}>{heating===true?"Active":heating===false?"Inactive":"Unknown"}</Badge></Box>
                <Box><Text size="xs" c="dimmed">Current mode</Text><Text fw={600}>{modeLabel(modeCurrent)}</Text></Box>
                <Box><Text size="xs" c="dimmed">Battery</Text><Text fw={600}>{battery===null?"Unknown":`${battery}%`}</Text></Box>
              </Group>
              <Text size="xs" c="dimmed">Last recorded measurement: {timeLabel(latest)}{latest?` · ${age(latest,now)} min ago`:""}. Heating demand does not confirm that the boiler is running.</Text>
              <Divider/>
              <Title order={4}>Thermostat control</Title>
              <SegmentedControl fullWidth data={modeOptions} value={mode} onChange={v=>{setMode(v as Mode);setResult(null);}}/>
              {mode==="manual"&&<Group align="end" gap="sm" wrap="wrap">
                <Button variant="light" size="md" disabled={!mayControl||busy||typeof temperature!=="number"||temperature<=7} onClick={()=>setTemperature(v=>Math.max(7,Number(v)-0.5))}>− 0.5 °C</Button>
                <NumberInput label="Setpoint (°C)" aria-label="Manual temperature" min={7} max={30} step={0.5} decimalScale={1} w={140} value={temperature} onChange={setTemperature}/>
                <Button variant="light" size="md" disabled={!mayControl||busy||typeof temperature!=="number"||temperature>=30} onClick={()=>setTemperature(v=>Math.min(30,Number(v)+0.5))}>+ 0.5 °C</Button>
                <Select label="Override duration" value={duration} onChange={v=>setDuration(v??"3600")} data={[{value:"1800",label:"30 minutes"},{value:"3600",label:"1 hour"},{value:"7200",label:"2 hours"},{value:"14400",label:"4 hours"}]} w={150}/>
              </Group>}
              <Group justify="space-between" align="center" wrap="wrap">
                <Text size="xs" c={mayControl?"dimmed":"orange"}>{!controlAllowed?"Read-only: write scope missing, unverified, or connection not approved for control.":stale?"Control unavailable until fresh reachable telemetry is recorded.":"SIM-02 simulator only · confirmation required before sending."}</Text>
                <Button disabled={!mayControl||busy||(mode==="manual"&&(!Number.isFinite(Number(temperature))||Number(temperature)<7||Number(temperature)>30||Number(temperature)%0.5!==0))} onClick={()=>setConfirm(mode==="manual"?{mode,temperature:Number(temperature),durationSeconds:Number(duration)}:{mode})}>Review command</Button>
              </Group>
              {result&&<Alert color={result.returnedState?.mode===resultMode?"green":"orange"} title={result.returnedState?.mode===resultMode?"API accepted · readback matches":"API accepted · readback differs"}>
                Returned mode: {modeLabel(result.returnedState?.mode??null)} · Setpoint: {degrees(result.returnedState?.setpoint??null)} · Measured: {degrees(result.returnedState?.measuredTemperature??null)}. This is an immediate API readback, not a subsequent telemetry collection.
              </Alert>}
              <Group gap="xs"><Button size="xs" variant="light" onClick={()=>onOpenAssets?.(active.id)} disabled={!onOpenAssets}>View assets</Button><Button size="xs" variant="subtle" onClick={()=>onOpenDevice?.(device.id)} disabled={!onOpenDevice}>Device registry</Button><Button size="xs" variant="subtle" onClick={onOpenHistory} disabled={!onOpenHistory}>History</Button></Group>
            </Stack></Card>
          </Grid.Col>;
        })}
        <Grid.Col span={{base:12,lg:4}}>
          <Stack gap="md">
            {relays.map(relay=><Card withBorder radius="md" padding="lg" key={relay.id}><Stack gap="sm">
              <Group justify="space-between" align="start"><Box><Title order={4}>{relay.name}</Title><Text size="xs" c="dimmed">Relay · gateway</Text></Box><Badge color="gray">Status not verified</Badge></Group>
              <Text size="sm">Linked thermostats: {thermostats.filter(d=>d.parentId===relay.id).length}</Text>
              <Text size="xs" c="dimmed">Last registry contact: {timeLabel(relay.lastSeenAt)}</Text>
              <Alert color="gray">No independent live relay or boiler feedback is currently collected. Thermostat heating demand must not be presented as boiler activity.</Alert>
              <Button variant="subtle" size="xs" onClick={()=>onOpenDevice?.(relay.id)} disabled={!onOpenDevice}>Open in Device Registry</Button>
            </Stack></Card>)}
            {relays.length===0&&<Alert color="gray">No relay discovered for this connection.</Alert>}
          </Stack>
        </Grid.Col>
      </Grid>
      {thermostats.length===0&&<Alert color="orange">No thermostat discovered. Run discovery and collection from connection settings.</Alert>}
    </>}
    <Modal opened={Boolean(confirm)} onClose={()=>!busy&&setConfirm(null)} title="Confirm thermostat command" centered closeOnClickOutside={!busy} closeOnEscape={!busy}>
      <Stack gap="md">
        <Text>Send this command to <strong>{active?.name}</strong> (SIM-02 simulator only)?</Text>
        <Card withBorder><Stack gap={4}><Text fw={700}>{modeLabel(confirm?.mode??null)}</Text>{confirm?.mode==="manual"&&<Text>Setpoint: {degrees(confirm.temperature??null)} · Duration: {(confirm.durationSeconds??0)/60} minutes</Text>}</Stack></Card>
        <Text size="xs" c="dimmed">The request changes the simulated thermostat. It does not control a physical boiler.</Text>
        <Group justify="end"><Button variant="subtle" disabled={busy} onClick={()=>setConfirm(null)}>Cancel</Button><Button loading={busy} onClick={()=>void submit()}>Send command</Button></Group>
      </Stack>
    </Modal>
  </Stack>;
}
