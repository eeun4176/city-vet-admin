import { randomUUID } from 'node:crypto';
import { unprocessable } from './errors';
export async function censusWorkspaceSnapshot(q:any,ownerIds:string[]){
 if(!ownerIds.length)return [];
 return await q`select d.dataset||':'||d.record_id as id,d.record_data,d.archived from ekapon.registry_source_links l join ekapon.dashboard_records d on d.dataset=l.dataset and d.record_id=l.record_id where (l.dataset='owners' and exists(select 1 from ekapon.registry_owners o where o.id=l.source_id and o.id=any(${ownerIds}::uuid[]))) or (l.dataset='pets' and exists(select 1 from ekapon.registry_pets p where p.id=l.source_id and p.owner_id=any(${ownerIds}::uuid[]))) order by d.dataset,d.record_id`;
}
export async function censusWorkspaceEdited(q:any,ownerIds:string[]){
 const rows=await censusWorkspaceSnapshot(q,ownerIds);if(!rows.length)return false;
 const [found]=await q`select 1 from ekapon.registry_activity a join ekapon.dashboard_records d on d.id=a.record_id where d.dataset||':'||d.record_id=any(${rows.map((r:any)=>r.id)}::text[]) limit 1`;return Boolean(found);
}

async function sourceId(q:any,kind:string,id:string){const [r]=await q`select source_id from ekapon.registry_source_links where dataset=${kind} and record_id=${id}`;return r?.source_id as string|undefined;}
async function ensureOwner(q:any,id:string):Promise<string>{
 const existing=await sourceId(q,'owners',id);if(existing)return existing;
 const [r]=await q`select d.record_data,b.id as barangay_id from ekapon.dashboard_records d join ekapon.barangays b on lower(b.name)=lower(d.record_data->>'barangay') where d.dataset='owners' and d.record_id=${id} and not d.archived`;
 if(!r)throw unprocessable('OWNER_REQUIRED','Select a confirmed active owner in an official barangay.');
 const d=r.record_data;
 if(!String(d.address??'').trim()||String(d.address).length>240)throw unprocessable('CENSUS_OWNER_ADDRESS','Confirm the owner address (1–240 characters) before linking a census pet.');
 const uuid=randomUUID();await q`insert into ekapon.registry_source_links(dataset,source_id,record_id) values('owners',${uuid}::uuid,${id})`;
 await q`insert into ekapon.registry_owners(id,barangay_id,owner_name,address,contact) values(${uuid}::uuid,${r.barangay_id},${d.name},${d.address},${d.contact||d.mobile||null})`;
 return uuid;
}
/** Workspace changes write through to census registry rows; their audit snapshots then detect conflicts. */
export async function syncCensusRegistry(q:any,kind:string,id:string,d:Record<string,any>){
 let source=await sourceId(q,kind,id);
 if(kind==='owners'){
  if(!source)return;
  if(!String(d.address??'').trim()||String(d.address).length>240)throw unprocessable('CENSUS_OWNER_ADDRESS','Census-linked owners need an address of 1–240 characters.');
  const [area]=await q`select id from ekapon.barangays where lower(name)=lower(${d.barangay})`;
  if(!area)throw unprocessable('BARANGAY_REQUIRED','Choose an official barangay.');
  await q`update ekapon.registry_owners set owner_name=${d.name},address=${d.address},contact=${d.contact||d.mobile||null},barangay_id=${area.id} where id=${source}::uuid`;
  return;
 }
 const ownerSource=await sourceId(q,'owners',String(d.owner_id??''));
 if(!source&&!ownerSource)return;
 const ownerId=ownerSource??await ensureOwner(q,String(d.owner_id??''));
 if(d.sex&&!['Male','Female'].includes(d.sex))throw unprocessable('CENSUS_PET_SEX','Choose Male, Female, or Not recorded.');
 if(String(d.color??'').length>60)throw unprocessable('CENSUS_PET_COLOR','Census pet color must be 60 characters or fewer.');
 if(!source){source=randomUUID();await q`insert into ekapon.registry_source_links(dataset,source_id,record_id) values('pets',${source}::uuid,${id})`;
  await q`insert into ekapon.registry_pets(id,owner_id,pet_name,species,sex,age_months,breed_type,color,remarks) values(${source}::uuid,${ownerId}::uuid,${d.petName},${d.species},${d.sex||null},${d.age_months??null},${['Mongrel','Mix','Pure'].includes(d.breed_type)?d.breed_type:null},${d.color||null},${d.remarks||null})`;
 }else await q`update ekapon.registry_pets set owner_id=${ownerId}::uuid,pet_name=${d.petName},species=${d.species},sex=${d.sex||null},age_months=${d.age_months??null},color=${d.color||null},remarks=${d.remarks||null} where id=${source}::uuid`;
}

export async function syncCensusArchive(q:any){
 // Capture the intended cohort before owner triggers republish their linked pets.
 const desired=await q`select l.dataset,l.source_id,d.archived from ekapon.registry_source_links l join ekapon.dashboard_records d on d.dataset=l.dataset and d.record_id=l.record_id left join ekapon.registry_owners o on l.dataset='owners' and o.id=l.source_id left join ekapon.registry_pets p on l.dataset='pets' and p.id=l.source_id where coalesce(d.record_data->>'_censusWithdrawn','false')<>'true' and ((l.dataset='owners' and o.id is not null and (o.archived_at is not null) is distinct from d.archived) or (l.dataset='pets' and p.id is not null and (p.archived_at is not null) is distinct from d.archived)) order by l.dataset`;
 for(const r of desired){if(r.dataset==='owners')await q`update ekapon.registry_owners set archived_at=case when ${r.archived} then coalesce(archived_at,now()) else null end where id=${r.source_id}::uuid`;
 else await q`update ekapon.registry_pets set archived_at=case when ${r.archived} then coalesce(archived_at,now()) else null end where id=${r.source_id}::uuid`;}
}
