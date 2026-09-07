import React from "react";
import { Button, Card, Checkbox, Group, Modal, NumberInput, Select, Stack, Table, Tabs, Text, TextInput } from "@mantine/core";
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
import { usePersistentState } from "./preferences/usePersistentState";
import { ResetFiltersAction } from "./ResetFiltersAction";
import { SortableTableHeader, compareTableValues, type SortDirection } from "./SortableTableHeader";

const COLOR_OPTIONS = ["gray","red","pink","grape","violet","indigo","blue","cyan","teal","green","lime","yellow","orange"].map(value => ({ value, label: value }));

type Kind = "class" | "type" | "technology";
type TaxonomySortKey = "label" | "code" | "description" | "class" | "category" | "enabled" | "sortOrder";
interface FormState { code: string; label: string; description: string; deviceClass: string; category: string; icon: string; color: string; enabled: boolean; sortOrder: number | string; }
const emptyForm = (): FormState => ({ code:"", label:"", description:"", deviceClass:"", category:"", icon:"device", color:"gray", enabled:true, sortOrder:100 });

export function DeviceTaxonomyPanel() {
  const qc = useQueryClient();
  const classes = useQuery({ queryKey:["device-registry","taxonomy","classes"], queryFn:getDeviceTaxonomyClasses });
  const types = useQuery({ queryKey:["device-registry","taxonomy","types"], queryFn:getDeviceTaxonomyTypes });
  const technologies = useQuery({ queryKey:["device-registry","taxonomy","technologies"], queryFn:getDeviceTaxonomyTechnologies });
  const [tab,setTab]=usePersistentState<string|null>("device-registry.taxonomy.tab","classes");
  const [kind,setKind]=React.useState<Kind>("class");
  const [editingCode,setEditingCode]=React.useState<string|null>(null);
  const [form,setForm]=React.useState<FormState>(emptyForm());
  const [opened,setOpened]=React.useState(false);
  const [error,setError]=React.useState<string|null>(null);

  const [classFilter,setClassFilter]=usePersistentState("device-registry.taxonomy.classes.filter.text","");
  const [classEnabledFilter,setClassEnabledFilter]=usePersistentState<string|null>("device-registry.taxonomy.classes.filter.enabled",null);
  const [classSortKey,setClassSortKey]=usePersistentState<TaxonomySortKey>("device-registry.taxonomy.classes.sort.key","label");
  const [classSortDirection,setClassSortDirection]=usePersistentState<SortDirection>("device-registry.taxonomy.classes.sort.direction","asc");
  const [typeFilter,setTypeFilter]=usePersistentState("device-registry.taxonomy.types.filter.text","");
  const [typeClassFilter,setTypeClassFilter]=usePersistentState<string|null>("device-registry.taxonomy.types.filter.class",null);
  const [typeEnabledFilter,setTypeEnabledFilter]=usePersistentState<string|null>("device-registry.taxonomy.types.filter.enabled",null);
  const [typeSortKey,setTypeSortKey]=usePersistentState<TaxonomySortKey>("device-registry.taxonomy.types.sort.key","label");
  const [typeSortDirection,setTypeSortDirection]=usePersistentState<SortDirection>("device-registry.taxonomy.types.sort.direction","asc");
  const [technologyFilter,setTechnologyFilter]=usePersistentState("device-registry.taxonomy.technologies.filter.text","");
  const [technologyEnabledFilter,setTechnologyEnabledFilter]=usePersistentState<string|null>("device-registry.taxonomy.technologies.filter.enabled",null);
  const [technologySortKey,setTechnologySortKey]=usePersistentState<TaxonomySortKey>("device-registry.taxonomy.technologies.sort.key","label");
  const [technologySortDirection,setTechnologySortDirection]=usePersistentState<SortDirection>("device-registry.taxonomy.technologies.sort.direction","asc");

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

  const openCreate=(next:Kind)=>{setKind(next);setEditingCode(null);const f=emptyForm(); if(next==="type") f.icon="device"; if(next==="technology") { f.icon="link"; f.color="blue"; } setForm(f);setError(null);setOpened(true);};
  const openClass=(item:DeviceClassReference)=>{setKind("class");setEditingCode(item.code);setForm({code:item.code,label:item.label,description:item.description??"",deviceClass:"",category:"",icon:item.icon,color:item.color,enabled:item.enabled,sortOrder:item.sortOrder});setOpened(true);};
  const openType=(item:DeviceTypeReference)=>{setKind("type");setEditingCode(item.code);setForm({code:item.code,label:item.label,description:"",deviceClass:item.deviceClass,category:item.category,icon:item.icon,color:item.color,enabled:item.enabled,sortOrder:item.sortOrder});setOpened(true);};
  const openTechnology=(item:DeviceTechnologyReference)=>{setKind("technology");setEditingCode(item.code);setForm({code:item.code,label:item.label,description:"",deviceClass:"",category:item.category,icon:item.icon,color:item.color,enabled:item.enabled,sortOrder:item.sortOrder});setOpened(true);};
  const askDelete=(next:Kind,code:string,label:string)=>{if(window.confirm(`Delete ${next} "${label}"? Referenced items cannot be deleted.`)) remove.mutate({kind:next,code});};
  const enabledMatches=(enabled:boolean, filter:string|null)=>!filter || (filter==="enabled" ? enabled : !enabled);
  const enabledValue=(enabled:boolean)=>enabled ? "Yes" : "No";
  const toggleSort=(key:TaxonomySortKey,current:TaxonomySortKey,setKey:(value:TaxonomySortKey)=>void,setDirection:React.Dispatch<React.SetStateAction<SortDirection>>)=>{
    if(current===key) setDirection(direction=>direction==="asc"?"desc":"asc"); else { setKey(key); setDirection("asc"); }
  };
  const classRows=(classes.data??[]).filter(item=>{
    const needle=classFilter.trim().toLowerCase();
    return (!needle || `${item.label} ${item.code} ${item.description??""}`.toLowerCase().includes(needle)) && enabledMatches(item.enabled,classEnabledFilter);
  }).sort((left,right)=>{
    const value=(item:DeviceClassReference)=>classSortKey==="label"?item.label:classSortKey==="code"?item.code:classSortKey==="description"?item.description:classSortKey==="enabled"?item.enabled:item.sortOrder;
    return compareTableValues(value(left),value(right),classSortDirection);
  });
  const typeRows=(types.data??[]).filter(item=>{
    const needle=typeFilter.trim().toLowerCase();
    return (!needle || `${item.label} ${item.code} ${item.deviceClass} ${item.category}`.toLowerCase().includes(needle)) && (!typeClassFilter || item.deviceClass===typeClassFilter) && enabledMatches(item.enabled,typeEnabledFilter);
  }).sort((left,right)=>{
    const value=(item:DeviceTypeReference)=>typeSortKey==="label"?item.label:typeSortKey==="code"?item.code:typeSortKey==="class"?item.deviceClass:typeSortKey==="category"?item.category:typeSortKey==="enabled"?item.enabled:item.sortOrder;
    return compareTableValues(value(left),value(right),typeSortDirection);
  });
  const technologyRows=(technologies.data??[]).filter(item=>{
    const needle=technologyFilter.trim().toLowerCase();
    return (!needle || `${item.label} ${item.code} ${item.category}`.toLowerCase().includes(needle)) && enabledMatches(item.enabled,technologyEnabledFilter);
  }).sort((left,right)=>{
    const value=(item:DeviceTechnologyReference)=>technologySortKey==="label"?item.label:technologySortKey==="code"?item.code:technologySortKey==="category"?item.category:technologySortKey==="enabled"?item.enabled:item.sortOrder;
    return compareTableValues(value(left),value(right),technologySortDirection);
  });
  const enabledOptions=[{value:"enabled",label:"Enabled"},{value:"disabled",label:"Disabled"}];

  return <Stack gap="sm">
    {error && <Text c="red" size="sm">{error}</Text>}
    <Tabs value={tab} onChange={setTab}>
      <Tabs.List><Tabs.Tab value="classes">Classes</Tabs.Tab><Tabs.Tab value="types">Types</Tabs.Tab><Tabs.Tab value="technologies">Technologies</Tabs.Tab></Tabs.List>
      <Tabs.Panel value="classes" pt="sm"><Stack gap="sm">
        <Group justify="space-between" wrap="wrap"><Group gap="xs"><ResetFiltersAction active={Boolean(classFilter||classEnabledFilter)} onReset={()=>{setClassFilter("");setClassEnabledFilter(null);}}/><TextInput size="xs" placeholder="Filter class / code / description" value={classFilter} onChange={e=>setClassFilter(e.currentTarget.value)} w={250}/><Select size="xs" clearable placeholder="Enabled" data={enabledOptions} value={classEnabledFilter} onChange={setClassEnabledFilter} w={130}/><Text size="xs" c="dimmed">{classRows.length}/{(classes.data??[]).length}</Text></Group><Button size="compact-sm" onClick={()=>openCreate("class")}>+ Add class</Button></Group>
        <Card withBorder padding={0}><Table striped highlightOnHover><Table.Thead><Table.Tr><SortableTableHeader active={classSortKey==="label"} direction={classSortDirection} onClick={()=>toggleSort("label",classSortKey,setClassSortKey,setClassSortDirection)}>Class</SortableTableHeader><SortableTableHeader active={classSortKey==="code"} direction={classSortDirection} onClick={()=>toggleSort("code",classSortKey,setClassSortKey,setClassSortDirection)}>Code</SortableTableHeader><SortableTableHeader active={classSortKey==="description"} direction={classSortDirection} onClick={()=>toggleSort("description",classSortKey,setClassSortKey,setClassSortDirection)}>Description</SortableTableHeader><SortableTableHeader active={classSortKey==="enabled"} direction={classSortDirection} onClick={()=>toggleSort("enabled",classSortKey,setClassSortKey,setClassSortDirection)}>Enabled</SortableTableHeader><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{classRows.map(item=><Table.Tr key={item.code}><Table.Td><Group gap="xs"><DeviceGlyph icon={item.icon} color={item.color}/><Text fw={600} size="sm">{item.label}</Text></Group></Table.Td><Table.Td><Text ff="monospace" size="sm">{item.code}</Text></Table.Td><Table.Td>{item.description??"—"}</Table.Td><Table.Td>{enabledValue(item.enabled)}</Table.Td><Table.Td><Group gap={4}><EditActionIcon onClick={()=>openClass(item)}/><DeleteActionIcon onClick={()=>askDelete("class",item.code,item.label)}/></Group></Table.Td></Table.Tr>)}</Table.Tbody></Table></Card>
      </Stack></Tabs.Panel>
      <Tabs.Panel value="types" pt="sm"><Stack gap="sm">
        <Group justify="space-between" wrap="wrap"><Group gap="xs"><ResetFiltersAction active={Boolean(typeFilter||typeClassFilter||typeEnabledFilter)} onReset={()=>{setTypeFilter("");setTypeClassFilter(null);setTypeEnabledFilter(null);}}/><TextInput size="xs" placeholder="Filter type / code / category" value={typeFilter} onChange={e=>setTypeFilter(e.currentTarget.value)} w={230}/><Select size="xs" clearable searchable placeholder="Class" data={(classes.data??[]).map(item=>({value:item.code,label:item.label}))} value={typeClassFilter} onChange={setTypeClassFilter} w={150}/><Select size="xs" clearable placeholder="Enabled" data={enabledOptions} value={typeEnabledFilter} onChange={setTypeEnabledFilter} w={130}/><Text size="xs" c="dimmed">{typeRows.length}/{(types.data??[]).length}</Text></Group><Button size="compact-sm" onClick={()=>openCreate("type")}>+ Add type</Button></Group>
        <Card withBorder padding={0}><Table striped highlightOnHover><Table.Thead><Table.Tr><SortableTableHeader active={typeSortKey==="label"} direction={typeSortDirection} onClick={()=>toggleSort("label",typeSortKey,setTypeSortKey,setTypeSortDirection)}>Type</SortableTableHeader><SortableTableHeader active={typeSortKey==="class"} direction={typeSortDirection} onClick={()=>toggleSort("class",typeSortKey,setTypeSortKey,setTypeSortDirection)}>Class</SortableTableHeader><SortableTableHeader active={typeSortKey==="category"} direction={typeSortDirection} onClick={()=>toggleSort("category",typeSortKey,setTypeSortKey,setTypeSortDirection)}>Category</SortableTableHeader><SortableTableHeader active={typeSortKey==="code"} direction={typeSortDirection} onClick={()=>toggleSort("code",typeSortKey,setTypeSortKey,setTypeSortDirection)}>Code</SortableTableHeader><SortableTableHeader active={typeSortKey==="enabled"} direction={typeSortDirection} onClick={()=>toggleSort("enabled",typeSortKey,setTypeSortKey,setTypeSortDirection)}>Enabled</SortableTableHeader><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{typeRows.map(item=><Table.Tr key={item.code}><Table.Td><Group gap="xs"><DeviceGlyph icon={item.icon} color={item.color}/><Text fw={600} size="sm">{item.label}</Text></Group></Table.Td><Table.Td>{item.deviceClass}</Table.Td><Table.Td>{item.category}</Table.Td><Table.Td><Text ff="monospace" size="sm">{item.code}</Text></Table.Td><Table.Td>{enabledValue(item.enabled)}</Table.Td><Table.Td><Group gap={4}><EditActionIcon onClick={()=>openType(item)}/><DeleteActionIcon onClick={()=>askDelete("type",item.code,item.label)}/></Group></Table.Td></Table.Tr>)}</Table.Tbody></Table></Card>
      </Stack></Tabs.Panel>
      <Tabs.Panel value="technologies" pt="sm"><Stack gap="sm">
        <Group justify="space-between" wrap="wrap"><Group gap="xs"><ResetFiltersAction active={Boolean(technologyFilter||technologyEnabledFilter)} onReset={()=>{setTechnologyFilter("");setTechnologyEnabledFilter(null);}}/><TextInput size="xs" placeholder="Filter technology / code / category" value={technologyFilter} onChange={e=>setTechnologyFilter(e.currentTarget.value)} w={260}/><Select size="xs" clearable placeholder="Enabled" data={enabledOptions} value={technologyEnabledFilter} onChange={setTechnologyEnabledFilter} w={130}/><Text size="xs" c="dimmed">{technologyRows.length}/{(technologies.data??[]).length}</Text></Group><Button size="compact-sm" onClick={()=>openCreate("technology")}>+ Add technology</Button></Group>
        <Card withBorder padding={0}><Table striped highlightOnHover><Table.Thead><Table.Tr><SortableTableHeader active={technologySortKey==="label"} direction={technologySortDirection} onClick={()=>toggleSort("label",technologySortKey,setTechnologySortKey,setTechnologySortDirection)}>Technology</SortableTableHeader><SortableTableHeader active={technologySortKey==="category"} direction={technologySortDirection} onClick={()=>toggleSort("category",technologySortKey,setTechnologySortKey,setTechnologySortDirection)}>Category</SortableTableHeader><SortableTableHeader active={technologySortKey==="code"} direction={technologySortDirection} onClick={()=>toggleSort("code",technologySortKey,setTechnologySortKey,setTechnologySortDirection)}>Code</SortableTableHeader><SortableTableHeader active={technologySortKey==="enabled"} direction={technologySortDirection} onClick={()=>toggleSort("enabled",technologySortKey,setTechnologySortKey,setTechnologySortDirection)}>Enabled</SortableTableHeader><Table.Th>Actions</Table.Th></Table.Tr></Table.Thead><Table.Tbody>{technologyRows.map(item=><Table.Tr key={item.code}><Table.Td><Group gap="xs"><DeviceGlyph icon={item.icon} color={item.color}/><Text fw={600} size="sm">{item.label}</Text></Group></Table.Td><Table.Td>{item.category}</Table.Td><Table.Td><Text ff="monospace" size="sm">{item.code}</Text></Table.Td><Table.Td>{enabledValue(item.enabled)}</Table.Td><Table.Td><Group gap={4}><EditActionIcon onClick={()=>openTechnology(item)}/><DeleteActionIcon onClick={()=>askDelete("technology",item.code,item.label)}/></Group></Table.Td></Table.Tr>)}</Table.Tbody></Table></Card>
      </Stack></Tabs.Panel>
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
