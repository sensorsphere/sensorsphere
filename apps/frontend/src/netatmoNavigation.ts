/** Parse connection IDs from scoped Netatmo identities, never from display names. */
export function connectionFromNetatmoAsset(externalId:string):string|null {
  const separator=externalId.indexOf(':netatmo:');
  return separator>0?externalId.slice(0,separator):null;
}
export function connectionFromNetatmoIdentity(identities:readonly {identityType:string;value:string}[]):string|null {
  const identity=identities.find(i=>i.identityType==='NETATMO_MODULE_ID'&&i.value.includes(':'));
  return identity?identity.value.slice(0,identity.value.indexOf(':')):null;
}
