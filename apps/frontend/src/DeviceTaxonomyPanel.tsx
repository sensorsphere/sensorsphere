import React from "react";
import { Badge, Button, Card, Checkbox, Group, Modal, NumberInput, Select, Stack, Table, Tabs, Text, TextInput } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createDeviceTaxonomyClass, createDeviceTaxonomyTechnology, createDeviceTaxonomyType,
  deleteDeviceTaxonomyClass, deleteDeviceTaxonomyTechnology, deleteDeviceTaxonomyType,
  getDeviceTaxonomyClasses, getDeviceTaxonomyTechnologies, getDeviceTaxonomyTypes,
  updateDeviceTaxonomyClass, updateDeviceTaxonomyTechnology, updateDeviceTaxonomyType
} from "./api";
import type { DeviceClassReference, DeviceTechnologyReference, DeviceTypeReference } from "./types";
import { DeleteActionIcon, EditActionIcon } from "./TableActionIcons";
import { DEVICE_ICON_OPTIONS, DeviceGlyph } from "./DeviceGlyph";

const COLOR_OPTIONS = ["gray","red","pink","grape","violet","indigo","blue","cyan","teal","green","lime","yellow","orange"].map(value => ({ value, label: value }));

type Kind = "class" | "type" | "technology";
interface FormState { code: string; label: string; description: string; deviceClass: string; category: string; icon: string; color: string; enabled: boolean; sortOrder: number | string; }
const emptyForm = (): FormState => ({ code:"", label:"", description:"", deviceClass:"", category:"", icon:"device", color:"gray", enabled:true, sortOrder:100 });

export function DeviceTaxonomyPanel() {
  const qc = useQueryClient();
  const classes = useQuery({ queryKey:["device-registry","taxonomy","classes"], queryFn:getDeviceTaxonomyClasses });
  const types = useQuery({ queryKey:["device-registry","taxonomy","types"], queryFn:getDeviceTaxonomyTypes });
  const technologies = useQuery({ queryKey:["device-registry","taxonomy","technologies"], queryFn:getDeviceTaxonomyTechnologies });
  const [tab,setTab]=React.useState<string|null>("classes");
  const [kind,setKind]=React.useState<Kind>("class");
  const [editingCode,setEditingCode]=React.useState<string|null>(null);
  const [form,setForm]=React.useState<FormState>(emptyForm());
  const [opened,setOpened]=React.useState(false);
  const [error,setError]=React.useState<string|null>(null);

  const refresh=async()=>{ await Promise.all([
    qc.invalidateQueries({queryKey:["device-registry","taxonomy"]}),
    qc.invalidateQueries({queryKey:["device-registry","classes"]}),
    qc.invalidateQueries({queryKey:["device-registry","types"]}),
    qc.invalidateQueries({queryKey:["device-registry","technologies"]}),
    qc.invalidateQueries({queryKey:["device-registry","devices"]})
  ]); };

  const save=useMutation({ mutationFn: async()=>{
    const sortOrder=typeof form.sortOrder === "number" ? form.sortOrder : Number(form.sortOrder)||100;
    if(kind==="class") {
      const input={code:form.code.trim(),label:form.label.trim(),description:form.description.trim()||null,icon:form.icon,color:form.color,enabled:form.enabled,sortOrder};
      if (editingCode) { const { code: _code, ...update } = input; return updateDeviceTaxonomyClass(editingCode, update); }
      return createDeviceTaxonomyClass(input);
    }
    if(kind==="type") {
      const input={code:form.code.trim(),label:form.label.trim(),deviceClass:form.deviceClass,category:form.category.trim()||"Other",icon:form.icon,color:form.color,enabled:form.enabled,sortOrder};
      if (editingCode) { const { code: _code, ...update } = input; return updateDeviceTaxonomyType(editingCode, update); }
      return createDeviceTaxonomyType(input);
    }
    const input={code:form.code.trim(),label:form.label.trim(),category:form.category.trim()||"Other",icon:form.icon,color:form.color,enabled:form.enabled,sortOrder};
    if (editingCode) { const { code: _code, ...update } = input; return updateDeviceTaxonomyTechnology(editingCode, update); }
    return createDeviceTaxonomyTechnology(input);
  }, onSuccess:async()=>{setOpened(false);setError(null);await refresh();}, onError:e=>setError(e instanceof Error?e.message:"Unable to save taxonomy item") });

  const remove=useMutation({ mutationFn: async({kind,code}:{kind:Kind;code:string})=>{
    if(kind==="class") return deleteDeviceTaxonomyClass(code);
    if(kind==="type") return deleteDeviceTaxonomyType(code);
    return deleteDeviceTaxonomyTechnology(code);
  }, onSuccess:refresh, onError:e=>setError(e instanceof Error?e.message:"Unable to delete taxonomy item") });

  const openCreate=(next:Kind)=>{setKind(next);setEditingCode(null);const f=emptyForm(); if(next==="type") f.icon="device"; if(next==="technology") f.icon="link"; setForm(f);setError(null);setOpened(true);};
  const openClass=(item:DeviceClassReference)=>{setKind("class");setEditingCode(item.code);setForm({code:item.code,label:item.label,description:item.description??"",deviceClass:"",category:"",icon:item.icon,color:item.color,enabled:item.enabled,sortOrder:item.sortOrder});setOpened(true);};
  const openType=(item:DeviceTypeReference)=>{setKind("type");setEditingCode(item.code);setForm({code:item.code,label:item.label,description:"",deviceClass:item.deviceClass,category:item.category,icon:item.icon,color:item.color,enabled:item.enabled,sortOrder:item.sortOrder});setOpened(true);};
  const openTechnology=(item:DeviceTechnologyReference)=>{setKind("technology");setEditingCode(item.code);setForm({code:item.code,label:item.label,description:"",deviceClass:"",category:item.category,icon:item.icon,color:item.color,enabled:item.enabled,sortOrder:item.sortOrder});setOpened(true);};
  const askDelete=(next:Kind,code:string,label:string)=>{if(window.confirm(`Delete ${next} "${label}"? Referenced items cannot be deleted.`)) remove.mutate({kind:next,code});};

  return <Stack gap="sm">
    {error && <Text c="red" size="sm">{error}</Text>}
    <Tabs value={tab} onChange={setTab}>
      <Tabs.List><Tabs.Tab value="classes">Classes</Tabs.Tab><Tabs.Tab value="types">Types</Tabs.Tab><Tabs.Tab value="technologies">Technologies</Tabs.Tab></Tabs.List>
      <Tabs.Panel value="classes" pt="sm"><Stack gap="sm"><Group justify="flex-end"><Button size="compact-sm" onClick={()=>openCreate("class")}>+ Add class</Button></Group><Card withBorder padding={0}><Table striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>Class</Table.Th><Table.Th>Code</Table.Th><Table.Th>Description</Table.Th><Table.Th>Enabled</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{(classes.data??[]).map(item=><Table.Tr key={item.code}><Table.Td><Group gap="xs"><DeviceGlyph icon={item.icon} color={item.color}/><Badge color={item.color} variant="light">{item.label}</Badge></Group></Table.Td><Table.Td><Text ff="monospace" size="sm">{item.code}</Text></Table.Td><Table.Td>{item.description??"—"}</Table.Td><Table.Td>{item.enabled?"Yes":"No"}</Table.Td><Table.Td><Group gap={4}><EditActionIcon onClick={()=>openClass(item)}/><DeleteActionIcon onClick={()=>askDelete("class",item.code,item.label)}/></Group></Table.Td></Table.Tr>)}</Table.Tbody></Table></Card></Stack></Tabs.Panel>
      <Tabs.Panel value="types" pt="sm"><Stack gap="sm"><Group justify="flex-end"><Button size="compact-sm" onClick={()=>openCreate("type")}>+ Add type</Button></Group><Card withBorder padding={0}><Table striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>Type</Table.Th><Table.Th>Class</Table.Th><Table.Th>Category</Table.Th><Table.Th>Code</Table.Th><Table.Th>Enabled</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{(types.data??[]).map(item=><Table.Tr key={item.code}><Table.Td><Group gap="xs"><DeviceGlyph icon={item.icon} color={item.color}/><Text fw={600} size="sm">{item.label}</Text></Group></Table.Td><Table.Td>{item.deviceClass}</Table.Td><Table.Td>{item.category}</Table.Td><Table.Td><Text ff="monospace" size="sm">{item.code}</Text></Table.Td><Table.Td>{item.enabled?"Yes":"No"}</Table.Td><Table.Td><Group gap={4}><EditActionIcon onClick={()=>openType(item)}/><DeleteActionIcon onClick={()=>askDelete("type",item.code,item.label)}/></Group></Table.Td></Table.Tr>)}</Table.Tbody></Table></Card></Stack></Tabs.Panel>
      <Tabs.Panel value="technologies" pt="sm"><Stack gap="sm"><Group justify="flex-end"><Button size="compact-sm" onClick={()=>openCreate("technology")}>+ Add technology</Button></Group><Card withBorder padding={0}><Table striped highlightOnHover><Table.Thead><Table.Tr><Table.Th>Technology</Table.Th><Table.Th>Category</Table.Th><Table.Th>Code</Table.Th><Table.Th>Enabled</Table.Th><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{(technologies.data??[]).map(item=><Table.Tr key={item.code}><Table.Td><Group gap="xs"><DeviceGlyph icon={item.icon} color={item.color}/><Text fw={600} size="sm">{item.label}</Text></Group></Table.Td><Table.Td>{item.category}</Table.Td><Table.Td><Text ff="monospace" size="sm">{item.code}</Text></Table.Td><Table.Td>{item.enabled?"Yes":"No"}</Table.Td><Table.Td><Group gap={4}><EditActionIcon onClick={()=>openTechnology(item)}/><DeleteActionIcon onClick={()=>askDelete("technology",item.code,item.label)}/></Group></Table.Td></Table.Tr>)}</Table.Tbody></Table></Card></Stack></Tabs.Panel>
    </Tabs>
    <Modal opened={opened} onClose={()=>setOpened(false)} title={`${editingCode?"Edit":"Add"} ${kind}`} size="lg">
      <Stack gap="sm">{error&&<Text c="red" size="sm">{error}</Text>}
        <Group grow><TextInput label="Code" required disabled={!!editingCode} value={form.code} onChange={e=>setForm(f=>({...f,code:e.currentTarget.value}))}/><TextInput label="Label" required autoFocus value={form.label} onChange={e=>setForm(f=>({...f,label:e.currentTarget.value}))}/></Group>
        {kind==="class"&&<TextInput label="Description" value={form.description} onChange={e=>setForm(f=>({...f,description:e.currentTarget.value}))}/>}
        {kind==="type"&&<Group grow><Select label="Class" required searchable data={(classes.data??[]).map(c=>({value:c.code,label:c.label}))} value={form.deviceClass||null} onChange={value=>setForm(f=>({...f,deviceClass:value??""}))}/><TextInput label="Category" required value={form.category} onChange={e=>setForm(f=>({...f,category:e.currentTarget.value}))}/></Group>}
        {kind==="technology"&&<TextInput label="Category" required value={form.category} onChange={e=>setForm(f=>({...f,category:e.currentTarget.value}))}/>}
        <Group grow><Select label="Icon" searchable data={DEVICE_ICON_OPTIONS} value={form.icon} onChange={value=>setForm(f=>({...f,icon:value??"device"}))}/><Select label="Color" data={COLOR_OPTIONS} value={form.color} onChange={value=>setForm(f=>({...f,color:value??"gray"}))}/><NumberInput label="Sort order" min={0} value={form.sortOrder} onChange={value=>setForm(f=>({...f,sortOrder:value}))}/></Group>
        <Group><DeviceGlyph icon={form.icon} color={form.color} size={24}/><Text size="sm" c="dimmed">Preview</Text><Checkbox label="Enabled" checked={form.enabled} onChange={e=>setForm(f=>({...f,enabled:e.currentTarget.checked}))}/></Group>
        <Group justify="flex-end"><Button variant="default" onClick={()=>setOpened(false)}>Cancel</Button><Button loading={save.isPending} disabled={!form.code.trim()||!form.label.trim()||(kind==="type"&&!form.deviceClass)} onClick={()=>save.mutate()}>Save</Button></Group>
      </Stack>
    </Modal>
  </Stack>;
}
