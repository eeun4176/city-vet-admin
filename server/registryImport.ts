import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Session } from './auth';
import { conflict,unprocessable,forbidden } from './errors';
import { registryLock,assertRegistryUnmanaged,normalizeIdentity } from './registry';
import { normalizeRecordInputs,jsonValue } from './dashboard';
import { PET_BREEDS,BREED_CLASSES,HEALTH_STATUSES } from '../shared/petReferences';
const pet=z.object({id:z.string().min(1).max(100).optional(),petName:z.string().trim().min(1).max(80),species:z.enum(['Dog','Cat']),sex:z.enum(['','Male','Female']).default(''),breed:z.string().trim().max(100).default('Unknown'),breedClass:z.enum(BREED_CLASSES).default('Unknown'),vaccinationStatus:z.enum(HEALTH_STATUSES).default('Unknown'),sterilizationStatus:z.enum(HEALTH_STATUSES).default('Unknown'),vaccineType:z.string().max(100).default(''),vaccinationDate:z.string().max(10).default(''),age_months:z.coerce.number().int().min(0).max(600).nullable().optional(),color:z.string().max(100).default(''),remarks:z.string().max(300).default('')});
export async function importOwnerPets(q:any,s:Session,b:{batchId:string;label:string;records:Record<string,unknown>[];confirmDistinctOwners?:boolean;matchReason?:string}){
 await registryLock(q);
 const ids=b.records.map(r=>String(r.id));await assertRegistryUnmanaged(q,'owners',ids);
 await q`insert into ekapon.dashboard_import_batches(batch_id,dataset,actor_id,label,linked_batch_id) values(${b.batchId}::uuid,'owners',${s.id},${b.label},${randomUUID()}::uuid) on conflict(batch_id) do nothing`;
 const [parent]=await q`select * from ekapon.dashboard_import_batches where batch_id=${b.batchId}::uuid for update`;
 if(parent.actor_id!==s.id||parent.dataset!=='owners'||parent.undone_at)throw forbidden('This import batch is unavailable.');
 if(!parent.linked_batch_id)throw conflict('IMPORT_DATASET_MISMATCH','Start a new paired owner/pet import batch.');
 const child=parent.linked_batch_id;
 await q`insert into ekapon.dashboard_import_batches(batch_id,dataset,actor_id,label) values(${child}::uuid,'pets',${s.id},${b.label}) on conflict do nothing`;
 const save=async(kind:string,batch:string,data:Record<string,unknown>)=>{
  const id=String(data.id);await assertRegistryUnmanaged(q,kind,[id]);
  const [before]=await q`select * from ekapon.dashboard_records where dataset=${kind} and record_id=${id} for update`;
  await q`insert into ekapon.dashboard_import_items(batch_id,record_id,existed_before,before_data,before_archived,after_data) values(${batch}::uuid,${id},${!!before},${before?q.json(before.record_data):null},${before?.archived??null},${q.json(jsonValue(data))}) on conflict(batch_id,record_id) do update set after_data=excluded.after_data`;
  await q`insert into ekapon.dashboard_records(dataset,record_id,record_data) values(${kind},${id},${q.json(jsonValue(data))}) on conflict(dataset,record_id) do update set record_data=excluded.record_data,archived=false,updated_at=now()`;
 };
 let petCount=0;
 for(const input of b.records){
  if(!Array.isArray(input.pets)||!input.pets.length||input.pets.length>30)throw unprocessable('OWNER_IMPORT_REQUIRES_PETS','Each imported owner needs 1–30 pet records. Map the owner and pet fields first.');
  const [area]=await q`select id,name from ekapon.barangays where lower(name)=lower(${String(input.barangay??'').trim()})`;
  if(!area)throw unprocessable('BARANGAY_REQUIRED',`Choose an official barangay for ${String(input.name??input.id)}.`);
  const name=String(input.name??'').trim();if(!name||name.length>120)throw unprocessable('OWNER_REQUIRED','Owner name is required (up to 120 characters).');
  const [match]=await q`select record_id from ekapon.dashboard_records where dataset='owners' and not archived and record_id<>${String(input.id)} and lower(btrim(record_data->>'barangay'))=lower(${area.name}) and lower(regexp_replace(btrim(record_data->>'name'),'[[:space:]]+',' ','g'))=${normalizeIdentity(name)} limit 1`;
  if(match&&(!b.confirmDistinctOwners||!b.matchReason||b.matchReason.trim().length<3))throw conflict('OWNER_MATCH_REVIEW_REQUIRED','Similar owner names exist. Review them in Owners; select stable existing IDs or confirm separate people with a reason.');
  const {pets:_pets,...owner}=normalizeRecordInputs(input,'owners');owner.name=name;owner.barangay=area.name;owner.barangayId=area.id;owner.recordOrigin='Reviewed owner/pet import';if(match)owner.distinctOwnerReason=b.matchReason;
  await save('owners',b.batchId,owner);
  for(const [index,raw] of input.pets.entries()){
   const parsed=pet.safeParse(raw);if(!parsed.success)throw unprocessable('PET_DETAILS_REQUIRED',`Owner ${name}, pet ${index+1}: ${parsed.error.issues.map(i=>i.message).join('; ')}`);
   const p=parsed.data;
   if(p.breed&&!PET_BREEDS[p.species].includes(p.breed as never)){const [ref]=await q`select name from ekapon.pet_breed_references where species=${p.species} and name=${p.breed} and active`;if(!ref)throw unprocessable('BREED_REQUIRED',`Choose a standardized breed for ${p.petName}.`);}
   const petId=p.id??`${String(input.id).slice(0,85)}-pet-${index+1}`;
   const [prior]=await q`select record_data from ekapon.dashboard_records where dataset='pets' and record_id=${petId}`;
   if(prior&&prior.record_data.owner_id!==String(input.id))throw conflict('OWNER_LINK_REVIEW_REQUIRED','An imported pet belongs to a different owner. Correct that link in the registry first.');
   const extra=Object.fromEntries(Object.entries(raw as Record<string,unknown>).filter(([key])=>!(key in pet.shape)&&!/(password|secret|token|credential|image|photo)/i.test(key)));
   const data=normalizeRecordInputs({...p,sourceDetails:extra,id:petId,owner_id:String(input.id),owner:name,barangay:area.name,recordOrigin:'Reviewed owner/pet import'},'pets');
   if(p.vaccinationDate&&p.vaccinationDate>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'}))throw unprocessable('INVALID_VACCINATION_DATE','Vaccination dates cannot be in the future.');
   await save('pets',child,data);petCount++;
  }
 }
 return {saved:b.records.length,petsSaved:petCount,batchId:b.batchId};
}
