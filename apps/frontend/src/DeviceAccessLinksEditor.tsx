import React from "react";
import { ActionIcon, Button, Checkbox, Group, Modal, NumberInput, Select, Stack, Table, Text, Textarea, TextInput, Tooltip } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import type { DeviceAccessLink, DeviceIdentity } from "./types";
import { DeleteActionIcon, EditActionIcon } from "./TableActionIcons";
import { DEVICE_ICON_OPTIONS, DeviceGlyph } from "./DeviceGlyph";
import { getServiceClassReferences, getServiceTypeReferences } from "./api";

export interface DeviceAccessContext {
  deviceName: string;
  macAddress: string;
  ipAddress: string;
  ieeeAddress: string;
  fqdn: string;
  manufacturer: string;
  model: string;
  deviceClass: string;
  deviceType: string;
  location: string;
  identities: DeviceIdentity[];
}

interface LinkForm {
  name: string; linkType: string; urlTemplate: string; username: string; port: number | string;
  parametersText: string; icon: string; color: string; enabled: boolean; sortOrder: number | string;
  publishAsService: boolean; publishedServiceName: string; publishedServiceClass: string; publishedServiceType: string; publishedServiceDescription: string;
}

const LINK_TYPES = ["WEB","SSH","RDP","VNC","API","DOCUMENTATION","CUSTOM"].map(value=>({value,label:value}));
const ACCESS_COLORS = ["blue", "cyan", "grape", "green", "indigo", "lime", "orange", "pink", "red", "teal", "violet", "yellow"].map(value => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }));
const emptyLink=():LinkForm=>({name:"",linkType:"WEB",urlTemplate:"https://{{IP_or_FQDN}}/",username:"",port:"",parametersText:"",icon:"globe",color:"blue",enabled:true,sortOrder:100,publishAsService:false,publishedServiceName:"",publishedServiceClass:"",publishedServiceType:"",publishedServiceDescription:""});

function parametersFromText(text:string):Record<string,string>{
  const result:Record<string,string>={};
  for(const line of text.split(/\r?\n/).map(v=>v.trim()).filter(Boolean)){
    const idx=line.indexOf("="); if(idx<=0) continue; result[line.slice(0,idx).trim()]=line.slice(idx+1).trim();
  }
  return result;
}
function parametersToText(parameters:Record<string,string>):string{return Object.entries(parameters??{}).map(([k,v])=>`${k}=${v}`).join("\n");}

export function openDeviceAccessUrl(url: string, target: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = target;
  anchor.rel = "noopener noreferrer";
  anchor.referrerPolicy = "no-referrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function resolveDeviceAccessUrl(link: DeviceAccessLink, context: DeviceAccessContext): { url: string; unresolved: string[] } {
  const base:Record<string,string>={
    device_name:context.deviceName, username:link.username??"", port:link.port==null?"":String(link.port),
    IP:context.ipAddress, FQDN:context.fqdn, IP_or_FQDN:context.fqdn||context.ipAddress,
    MAC:context.macAddress, IEEE:context.ieeeAddress, manufacturer:context.manufacturer, model:context.model,
    class:context.deviceClass, type:context.deviceType, location:context.location
  };
  for(const identity of context.identities) {
    if (base[`identity:${identity.identityType}`] == null || identity.isPrimary) base[`identity:${identity.identityType}`]=identity.value;
    if (identity.label) base[`identity:${identity.identityType}:${identity.label}`]=identity.value;
  }
  for(const [key,value] of Object.entries(link.parameters??{})) base[`param:${key}`]=value;
  const unresolved=new Set<string>();
  const url=link.urlTemplate.replace(/\{\{([^{}]+)\}\}/g,(_all,key:string)=>{
    const value=base[key]; if(value==null||value==="") unresolved.add(key); return value??"";
  });
  return {url,unresolved:[...unresolved]};
}

export function DeviceAccessLinksEditor({ value, onChange, context, openAccessLinkId, onAccessLinkOpened }: { value: DeviceAccessLink[]; onChange:(value:DeviceAccessLink[])=>void; context:DeviceAccessContext; openAccessLinkId?: string | null; onAccessLinkOpened?: () => void }) {
  const serviceClasses=useQuery({queryKey:["service-registry","references","classes"],queryFn:getServiceClassReferences});
  const serviceTypes=useQuery({queryKey:["service-registry","references","types"],queryFn:getServiceTypeReferences});
  const [opened,setOpened]=React.useState(false); const [editIndex,setEditIndex]=React.useState<number|null>(null); const [form,setForm]=React.useState<LinkForm>(emptyLink());
  const openCreate=()=>{setEditIndex(null);setForm(emptyLink());setOpened(true);};
  const openEdit=(index:number)=>{const item=value[index]!;setEditIndex(index);setForm({name:item.name,linkType:item.linkType,urlTemplate:item.urlTemplate,username:item.username??"",port:item.port??"",parametersText:parametersToText(item.parameters),icon:item.icon,color:item.color??"blue",enabled:item.enabled,sortOrder:item.sortOrder,publishAsService:item.publishAsService??false,publishedServiceName:item.publishedServiceName??item.name,publishedServiceClass:item.publishedServiceClass??"",publishedServiceType:item.publishedServiceType??"",publishedServiceDescription:item.publishedServiceDescription??""});setOpened(true);};
  React.useEffect(()=>{if(!openAccessLinkId)return;const index=value.findIndex(item=>item.id===openAccessLinkId);if(index<0)return;openEdit(index);onAccessLinkOpened?.();},[openAccessLinkId,value]);
  const save=()=>{const item:DeviceAccessLink={name:form.name.trim(),linkType:form.linkType,urlTemplate:form.urlTemplate.trim(),username:form.username.trim()||null,port:typeof form.port==="number"?form.port:null,parameters:parametersFromText(form.parametersText),icon:form.icon,color:form.color,enabled:form.enabled,sortOrder:typeof form.sortOrder==="number"?form.sortOrder:100,publishAsService:form.publishAsService,publishedServiceName:form.publishAsService?(form.publishedServiceName.trim()||form.name.trim()):null,publishedServiceClass:form.publishAsService?(form.publishedServiceClass||null):null,publishedServiceType:form.publishAsService?(form.publishedServiceType||null):null,publishedServiceDescription:form.publishAsService?(form.publishedServiceDescription.trim()||null):null};const next=[...value];if(editIndex==null)next.push(item);else next[editIndex]=item;next.sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name));onChange(next);setOpened(false);};
  const previewLink:DeviceAccessLink={name:form.name,linkType:form.linkType,urlTemplate:form.urlTemplate,username:form.username||null,port:typeof form.port==="number"?form.port:null,parameters:parametersFromText(form.parametersText),icon:form.icon,color:form.color,enabled:form.enabled,sortOrder:typeof form.sortOrder==="number"?form.sortOrder:100,publishAsService:form.publishAsService,publishedServiceName:form.publishedServiceName||null,publishedServiceClass:form.publishedServiceClass||null,publishedServiceType:form.publishedServiceType||null,publishedServiceDescription:form.publishedServiceDescription||null};
  const preview=resolveDeviceAccessUrl(previewLink,context);
  return <Stack gap="xs">
    <Group justify="space-between"><div><Text fw={600} size="sm">Access links</Text><Text size="xs" c="dimmed">Multiple Web, SSH, RDP, API or custom launch URLs. Passwords should not be stored here.</Text></div><Button size="compact-xs" variant="light" onClick={openCreate}>+ Add access</Button></Group>
    {value.length>0&&<Table withTableBorder withColumnBorders={false}><Table.Thead><Table.Tr><Table.Th>Name</Table.Th><Table.Th>Type</Table.Th><Table.Th>Template</Table.Th><Table.Th>User</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{value.map((item,index)=>{const resolved=resolveDeviceAccessUrl(item,context);return <Table.Tr key={`${item.name}-${index}`}><Table.Td><Group gap="xs"><DeviceGlyph icon={item.icon} color={item.color}/><Text size="sm">{item.name}</Text></Group></Table.Td><Table.Td>{item.linkType}</Table.Td><Table.Td><Tooltip label={resolved.unresolved.length?`Missing: ${resolved.unresolved.join(", ")}`:resolved.url}><Text size="xs" ff="monospace" lineClamp={1}>{item.urlTemplate}</Text></Tooltip></Table.Td><Table.Td>{item.username??"—"}</Table.Td><Table.Td><Group gap={4}><ActionIcon variant="subtle" disabled={resolved.unresolved.length>0||!item.enabled} onClick={()=>openDeviceAccessUrl(resolved.url,`ss_device_${context.deviceName}_${index}`)} aria-label={`Open ${item.name}`}><DeviceGlyph icon={item.icon} color={item.color}/></ActionIcon><EditActionIcon onClick={()=>openEdit(index)}/><DeleteActionIcon onClick={()=>onChange(value.filter((_,i)=>i!==index))}/></Group></Table.Td></Table.Tr>;})}</Table.Tbody></Table>}
    {value.length===0&&<Text size="sm" c="dimmed">No access links configured.</Text>}
    <Modal opened={opened} onClose={()=>setOpened(false)} title={editIndex==null?"Add access link":"Edit access link"} size="lg"><Stack gap="sm">
      <Group grow><TextInput label="Name" required autoFocus value={form.name} onChange={e=>setForm(f=>({...f,name:e.currentTarget.value}))}/><Select label="Type" data={LINK_TYPES} value={form.linkType} onChange={v=>setForm(f=>({...f,linkType:v??"CUSTOM"}))}/></Group>
      <Textarea label="URL template" required minRows={2} value={form.urlTemplate} onChange={e=>setForm(f=>({...f,urlTemplate:e.currentTarget.value}))} description="Placeholders: {{username}}, {{IP}}, {{FQDN}}, {{IP_or_FQDN}}, {{port}}, {{MAC}}, {{IEEE}}, {{device_name}}, {{class}}, {{type}}, {{identity:TYPE}}, {{identity:TYPE:Label}}, {{param:key}}"/>
      <Group grow><TextInput label="Username" value={form.username} onChange={e=>setForm(f=>({...f,username:e.currentTarget.value}))}/><NumberInput label="Port" min={1} max={65535} value={form.port} onChange={v=>setForm(f=>({...f,port:v}))}/></Group>
      <Textarea label="Custom parameters" minRows={2} value={form.parametersText} onChange={e=>setForm(f=>({...f,parametersText:e.currentTarget.value}))} description="One per line: key=value; use as {{param:key}}"/>
      <Group grow>
        <Select
          label="Icon"
          searchable
          data={DEVICE_ICON_OPTIONS}
          value={form.icon}
          leftSection={<DeviceGlyph icon={form.icon} color={form.color} size={16} />}
          renderOption={({ option }) => <Group gap="xs" wrap="nowrap"><DeviceGlyph icon={option.value} color={form.color} size={16} /><Text size="sm">{option.label}</Text></Group>}
          onChange={v=>setForm(f=>({...f,icon:v??"link"}))}
        />
        <Select
          label="Color"
          data={ACCESS_COLORS}
          value={form.color}
          leftSection={<DeviceGlyph icon={form.icon} color={form.color} size={16} />}
          onChange={v=>setForm(f=>({...f,color:v??"blue"}))}
        />
        <NumberInput label="Sort order" min={0} value={form.sortOrder} onChange={v=>setForm(f=>({...f,sortOrder:v}))}/>
      </Group>
      <Checkbox label="Enabled" checked={form.enabled} onChange={e=>setForm(f=>({...f,enabled:e.currentTarget.checked}))}/>
      <Checkbox label="Publish as Service in Service Registry" checked={form.publishAsService} onChange={e=>setForm(f=>({...f,publishAsService:e.currentTarget.checked}))}/>
      {form.publishAsService&&<Stack gap="xs"><Group grow><TextInput label="Published service name" placeholder="Uses access link name when empty" value={form.publishedServiceName} onChange={e=>setForm(f=>({...f,publishedServiceName:e.currentTarget.value}))}/><Select label="Service class" data={[...(serviceClasses.data??[])].sort((a,b)=>a.label.localeCompare(b.label)).map(c=>({value:c.code,label:c.label}))} value={form.publishedServiceClass||null} onChange={v=>setForm(f=>({...f,publishedServiceClass:v??"",publishedServiceType:""}))}/><Select label="Service type" data={[...(serviceTypes.data??[])].filter(t=>t.serviceClass===form.publishedServiceClass).sort((a,b)=>a.label.localeCompare(b.label)).map(t=>({value:t.code,label:t.label}))} value={form.publishedServiceType||null} onChange={v=>setForm(f=>({...f,publishedServiceType:v??""}))}/></Group><Textarea label="Published service description" minRows={2} value={form.publishedServiceDescription} onChange={e=>setForm(f=>({...f,publishedServiceDescription:e.currentTarget.value}))}/></Stack>}
      <Stack gap={2}><Text size="xs" fw={600}>Preview</Text><Text size="xs" ff="monospace" c={preview.unresolved.length?"orange":"dimmed"}>{preview.url||"—"}</Text>{preview.unresolved.length>0&&<Text size="xs" c="orange">Unresolved placeholders: {preview.unresolved.join(", ")}</Text>}</Stack>
      <Group justify="flex-end"><Button variant="default" onClick={()=>setOpened(false)}>Cancel</Button><Button disabled={!form.name.trim()||!form.urlTemplate.trim()||(form.publishAsService&&(!form.publishedServiceClass||!form.publishedServiceType))} onClick={save}>Save</Button></Group>
    </Stack></Modal>
  </Stack>;
}
