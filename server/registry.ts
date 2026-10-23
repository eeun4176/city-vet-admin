import { createHash } from 'node:crypto';
import type { Session } from './auth';
import { conflict,notFound,unprocessable } from './errors';
import type { RegistryRecord } from '../shared/registry';

export const registryLock=async(q:any)=>{await q`select pg_advisory_xact_lock(hashtext('registry-owner-pet-writes'))`;};
export const registryHash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const normalizeIdentity=(value:unknown)=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
export const publicRegistryData=(data:Record<string,unknown>)=>{
 const privateKey=/(password|secret|credential|token|image|photo|verification|accountkey|username)/i;
 const safe=Object.fromEntries(Object.entries(data).filter(([key,value])=>!privateKey.test(key)&&!key.startsWith('_')&&(value===null||['string','number','boolean'].includes(typeof value))));
 if(data.sourceDetails&&typeof data.sourceDetails==='object'&&!Array.isArray(data.sourceDetails)){
  const clean=Object.fromEntries(Object.entries(data.sourceDetails).filter(([key,value])=>!privateKey.test(key)&&!key.startsWith('_')&&(value===null||['string','number','boolean'].includes(typeof value))));
  if(Object.keys(clean).length)safe.sourceDetails=JSON.stringify(clean,null,2);
 }
 return safe;
};
export function registryOutput(row:any):RegistryRecord{return {id:row.record_id,kind:row.dataset,archived:row.archived,data:publicRegistryData(row.record_data)};}
/** Explicit list fields. Full details are fetched only on opening a record or adding it to a report. */
export function registryListProjection(kind:'owners'|'pets',alias='outer_record'){
 const keys=kind==='owners'?['name','owner_name','barangay','address','contact','mobile']:['petName','pet_name','name','barangay','species','sex','owner','owner_name','owner_id'];
 return `jsonb_build_object('id',${alias}.record_id,${keys.map(key=>`'${key}',${alias}.record_data->'${key}'`).join(',')})`;
}
/** Search documented registry fields, never private images/credentials or arbitrary stored JSON. */
export function registrySearchText(alias='outer_record'){
 const keys=['name','petName','pet_name','owner_name','owner','address','contact','mobile','phone','barangay','species','breed','color','remarks','sex'];
 return `concat_ws(' ',${alias}.record_id,${keys.map(key=>`${alias}.record_data->>'${key}'`).join(',')})`;
}
export async function registryRow(q:any,kind:string,id:string,session?:Session,lock=false){
 const [row]=await q.unsafe(`select * from ekapon.dashboard_records where dataset=$1 and record_id=$2 ${lock?'for update':''}`,[kind,id]);
 if(!row||(session?.type==='Paravet'&&normalizeIdentity(row.record_data.barangay)!==normalizeIdentity(session.barangay)))throw notFound('Record not found in your accessible registry.');
 return row;
}
export async function assertRegistryUnmanaged(q:any,kind:string,ids:string[]){
 if(!['owners','pets'].includes(kind)||!ids.length)return;
 const rows=await q`select d.id from ekapon.dashboard_records d where d.dataset=${kind} and d.record_id=any(${ids}::text[]) and (exists(select 1 from ekapon.registry_activity a where a.record_id=d.id) or exists(select 1 from ekapon.registry_source_links l where l.dataset=d.dataset and l.record_id=d.record_id))`;
 if(rows.length)throw conflict('REGISTRY_REVIEW_REQUIRED','Open this record in the owner/pet workspace to review and preserve its history.');
}
/** Legacy callers must supply the owner ID, or retain an existing confirmed link. */
export async function resolveRegistryOwner(q:any,record:Record<string,unknown>,existing?:Record<string,unknown>){
 const existingId=String(existing?.owner_id??'');
 const requestedId=String(record.owner_id??existingId);
 if(existing&&(!existingId||requestedId!==existingId))throw conflict('OWNER_LINK_REVIEW_REQUIRED','Use the separate owner-link correction action with a reason.');
 let owner:any;
 if(requestedId){[owner]=await q`select record_id,record_data from ekapon.dashboard_records where dataset='owners' and not archived and record_id=${requestedId} for share`;}
 else{
  const rows=await q`select record_id,record_data from ekapon.dashboard_records where dataset='owners' and not archived and lower(btrim(record_data->>'name'))=lower(${String(record.owner??record.owner_name??'').trim()}) and lower(btrim(coalesce(record_data->>'barangay','')))=lower(${String(record.barangay??'').trim()}) limit 2 for share`;
  if(rows.length>1)throw conflict('OWNER_AMBIGUOUS','Several owners match. Select the correct owner by record ID.');
  if(rows.length)throw conflict('OWNER_SELECTION_REQUIRED','Select the owner by record ID; a matching name does not confirm identity.');
 }
 if(!owner)throw unprocessable('OWNER_REQUIRED','Select an active existing owner by record ID.');
 if(existing&&record.owner!==undefined&&normalizeIdentity(record.owner)!==normalizeIdentity(owner.record_data.name))throw conflict('OWNER_LINK_REVIEW_REQUIRED','Use the separate owner-link correction action to change the owner.');
 record.owner_id=owner.record_id;record.owner=String(owner.record_data.name??'');record.barangay=String(owner.record_data.barangay??'');
 return owner;
}
