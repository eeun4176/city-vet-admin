import { registryIntake } from '../../server/registryIntake';
import { logOwnerLink } from '../../server/ownerHistory';
import { PET_BREEDS,BREED_CLASSES,HEALTH_STATUSES } from '../../shared/petReferences';
import { randomUUID } from 'node:crypto';
import { SignJWT,jwtVerify } from 'jose';
import { z } from 'zod';
import { route,ok,parse } from '../../server/http';
import { requireAuth,type Session } from '../../server/auth';
import { sql,tx } from '../../server/db';
import { config } from '../../server/config';
import { conflict,unprocessable } from '../../server/errors';
import { registryRow,registryOutput,registryHash,registryLock,normalizeIdentity,publicRegistryData,registryListProjection } from '../../server/registry';
import { likePattern } from '../../server/listing';
import type { RegistryDraft } from '../../shared/registry';
import { jsonValue } from '../../server/dashboard';
import { syncCensusRegistry } from '../../server/censusRegistryBridge';
import { optionalMobile } from '../../server/phone';

const text=(max:number)=>z.string().trim().max(max);
const ownerSchema=z.object({name:text(120).min(1),address:text(300),contact:optionalMobile(),barangayId:z.number().int().positive()}).strict();
const petSchema=z.object({name:text(80).min(1),species:z.enum(['Dog','Cat']),sex:z.enum(['','Male','Female']),ageMonths:z.number().int().min(0).max(600).nullable(),breed:text(100),breedClass:z.enum(BREED_CLASSES).default('Unknown'),vaccinationStatus:z.enum(HEALTH_STATUSES).default('Unknown'),sterilizationStatus:z.enum(HEALTH_STATUSES).default('Unknown'),vaccineType:text(100).default(''),vaccinationDate:text(10).default('').refine(v=>!v||(/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v&&v<=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'})),'Enter a valid past vaccination date.'),color:text(100),remarks:text(300)}).strict();
const draftSchema=z.object({intake:z.object({source:z.enum(['interest','stub','attendance']),id:z.number().int().positive()}).optional(),requestId:z.string().uuid(),mode:z.enum(['create-owner','add-pets','edit-owner','edit-pet','link-owner']),ownerId:text(100).min(1).optional(),petId:text(100).min(1).optional(),owner:ownerSchema.optional(),pets:z.array(petSchema).max(30).optional(),reason:text(1000).default('')}).strict().superRefine((d,c)=>{
 const fail=(message:string)=>c.addIssue({code:z.ZodIssueCode.custom,message});
 if(['create-owner','edit-owner'].includes(d.mode)&&!d.owner)fail('Owner details are required.');
 if(['create-owner','add-pets'].includes(d.mode)&&!d.pets?.length)fail('Add at least one pet.');
 if(['edit-owner','add-pets','link-owner'].includes(d.mode)&&!d.ownerId)fail('Select an owner by record ID.');
 if(['edit-pet','link-owner'].includes(d.mode)&&!d.petId)fail('Select a pet by record ID.');
 if(d.mode==='edit-pet'&&d.pets?.length!==1)fail('Edit one pet at a time.');
 if(['edit-owner','edit-pet','link-owner'].includes(d.mode)&&d.reason.length<3)fail('Explain this change in at least three characters.');
 if(d.mode==='link-owner'&&(d.owner||d.pets?.length))fail('The link correction only changes the selected owner link.');
 if(d.mode==='create-owner'&&(d.ownerId||d.petId))fail('New owners cannot specify an existing owner or pet ID.');
 if(d.mode==='edit-owner'&&d.petId)fail('Edit owner details separately from an existing pet.');
 if(d.mode==='add-pets'&&(d.owner||d.petId))fail('Select an existing owner and add new pets only.');
 if(d.mode==='edit-pet'&&(d.owner||d.ownerId))fail('Edit pet details separately from ownership.');
});
const writeSchema=z.object({action:z.enum(['preview','save']),draft:draftSchema,token:z.string().max(3000).optional(),acknowledgeMatches:z.boolean().default(false),matchReason:text(1000).default('')});
const secret=()=>new TextEncoder().encode(config().jwtSecret);
const sample=(r:any)=>r?.record_data?._sampleData===true;

async function state(q:any,d:RegistryDraft,session:Session,lock=false){
 let owner:any=null,pet:any=null,previousOwner:any=null;
 const intake=d.intake?await registryIntake(q,d.intake):null;
 if(intake&&(d.mode!=='create-owner'||intake.linkedOwnerId))throw conflict('INTAKE_ALREADY_LINKED','This intake already has an owner link, or needs the new-owner review workflow. Open its existing owner instead.');
 if(d.petId)pet=await registryRow(q,'pets',d.petId,session,lock);
 if(d.ownerId)owner=await registryRow(q,'owners',d.ownerId,session,lock);
 if(pet?.record_data.owner_id){
  const [old]=await q.unsafe(`select * from ekapon.dashboard_records where dataset='owners' and record_id=$1 ${lock?'for update':''}`,[String(pet.record_data.owner_id)]);previousOwner=old;
  if(d.mode==='edit-pet')owner=old;
 }
 if((owner?.archived||pet?.archived)||sample(owner)||sample(pet))throw conflict('ACTIVE_REGISTRY_REQUIRED','Use active live registry records for this workflow.');
 if(d.mode==='edit-pet'&&!owner)throw conflict('OWNER_LINK_REVIEW_REQUIRED','Confirm this pet’s owner link before editing its details.');
 let barangay:any=null;
 if(d.owner){[barangay]=await q`select id,name from ekapon.barangays where id=${d.owner.barangayId}`;if(!barangay)throw unprocessable('BARANGAY_REQUIRED','Choose an official barangay.');}
 const linked=owner?await q.unsafe(`select * from ekapon.dashboard_records where dataset='pets' and record_data->>'owner_id'=$1 order by id ${lock?'for update':''}`,[owner.record_id]):[];
 const matches:any[]=[];
 if(d.owner){
  const digits=d.owner.contact.replace(/\D/g,'');
  const owners=await q`select * from ekapon.dashboard_records where dataset='owners' and not archived and coalesce(record_data->>'_sampleData','false')<>'true' and record_id<>${owner?.record_id??''}
    and lower(btrim(record_data->>'barangay'))=lower(${barangay.name})
    and (lower(regexp_replace(btrim(coalesce(record_data->>'name',record_data->>'owner_name','')),'[[:space:]]+',' ','g'))=${normalizeIdentity(d.owner.name)}
      or (${digits}<>'' and regexp_replace(coalesce(nullif(record_data->>'contact',''),record_data->>'mobile',record_data->>'phone',''),'[^0-9]','','g')=${digits})) order by id`;
  matches.push(...owners);
 }
 const incoming=d.mode==='link-owner'?[{name:String(pet.record_data.petName??pet.record_data.pet_name??pet.record_data.name??''),species:pet.record_data.species,sex:pet.record_data.sex}]:d.pets??[];
 for(const p of incoming){for(const existing of linked){if(existing.record_id===d.petId)continue;const r=existing.record_data;
  if(!existing.archived&&normalizeIdentity(r.petName??r.pet_name??r.name)===normalizeIdentity(p.name)&&r.species===p.species&&(!p.sex||!r.sex||r.sex===p.sex))matches.push(existing);
 }}
 const warnings:string[]=[];
 const batch=d.pets??[];
 if(batch.some((p,i)=>batch.slice(0,i).some(v=>normalizeIdentity(v.name)===normalizeIdentity(p.name)&&v.species===p.species&&(!v.sex||!p.sex||v.sex===p.sex))))warnings.push('Some pets in this entry have matching names and species. Confirm they are different pets.');
 if(d.mode==='link-owner'){
  if(String(pet.record_data.owner_id??'')===owner.record_id)throw conflict('OWNER_LINK_UNCHANGED','This pet is already linked to that owner.');
  warnings.push('This changes the current registry link only. Previous owner information and program attendance history will be retained.');
 }
 const unique=[...new Map(matches.map(r=>[r.id,r])).values()];
 const capture=[owner,pet,previousOwner,...linked,...unique].filter(Boolean).sort((a,b)=>a.id-b.id).map(r=>[r.id,r.record_data,r.archived]);
 return {owner,pet,previousOwner,linked,matches:unique,warnings,barangay,fingerprint:registryHash({capture,intake}),needsAcknowledgement:unique.length>0||warnings.some(w=>w.startsWith('Some pets'))};
}

export default route({GET:async(c)=>{
 const session=await requireAuth(c.req,{roles:['Admin','SuperAdmin','Paravet']});
 if(c.query.intakeSource){if(session.type==='Paravet')throw unprocessable('STAFF_REVIEW_REQUIRED','An Admin must verify this intake.');const input=parse(z.object({intakeSource:z.enum(['interest','stub','attendance']),intakeId:z.coerce.number().int().positive()}),c.query);return ok(await registryIntake(sql(),{source:input.intakeSource,id:input.intakeId}));}
 const f=parse(z.object({kind:z.enum(['owners','pets']).default('owners'),id:text(100).min(1).optional(),q:text(120).default(''),page:z.coerce.number().int().min(1).max(100000).default(1)}),c.query);
 return ok(await sql().begin(async(q)=>{
  await q`set transaction isolation level repeatable read, read only`;
  if(!f.id){
   const args=[f.kind,session.type!=='Paravet',session.barangay??'',f.q,likePattern(f.q)];
   const where=`dataset=$1 and not archived and coalesce(record_data->>'_sampleData','false')<>'true' and ($2::boolean or lower(btrim(record_data->>'barangay'))=lower($3)) and ($4='' or coalesce(record_data->>'name',record_data->>'petName',record_data->>'pet_name','') ilike $5 or record_id ilike $5 or coalesce(record_data->>'address','') ilike $5 or coalesce(record_data->>'contact',record_data->>'mobile','') ilike $5)`;
   const [count]=await q.unsafe(`select count(*)::int as total from ekapon.dashboard_records where ${where}`,args);
   const rows=await q.unsafe(`select record_id,dataset,archived,${registryListProjection(f.kind,'d')} as record_data from ekapon.dashboard_records d where ${where} order by d.record_data->>'name',d.id limit 12 offset ${(f.page-1)*12}`,args);
   return {data:rows.map(registryOutput),total:Number(count.total)};
  }
  const row=await registryRow(q,f.kind,f.id,session);
  const owner=f.kind==='owners'?row:row.record_data.owner_id?await registryRow(q,'owners',String(row.record_data.owner_id),session).catch(()=>null):null;
  const pets=owner?await q`select * from ekapon.dashboard_records where dataset='pets' and record_data->>'owner_id'=${owner.record_id} and (${session.type!=='Paravet'} or lower(btrim(record_data->>'barangay'))=lower(${session.barangay??''})) order by archived,id`:[];
  const possible=f.kind==='owners'?await q`select * from ekapon.dashboard_records where dataset='pets' and not archived and coalesce(record_data->>'owner_id','')<>${row.record_id} and lower(btrim(coalesce(record_data->>'owner',record_data->>'owner_name','')))=lower(btrim(${String(row.record_data.name??'')})) and lower(btrim(record_data->>'barangay'))=lower(${String(row.record_data.barangay??'')}) order by id`:[];
  const history=await q`select a.id,a.action,a.reason,a.before_data as before,a.after_data as after,a.created_at as "createdAt",u.full_name as actor from ekapon.registry_activity a join ekapon.accounts u on u.id=a.actor_id where a.record_id=${row.id} order by a.id desc limit 100`;
  const imports=await q`select b.batch_id,b.label,b.created_at as "createdAt",b.undone_at,u.full_name as actor,i.before_data as before,i.after_data as after from ekapon.dashboard_import_items i join ekapon.dashboard_import_batches b on b.batch_id=i.batch_id join ekapon.accounts u on u.id=b.actor_id where b.dataset=${f.kind} and i.record_id=${row.record_id} order by b.created_at desc limit 30`;
  for(const entry of imports)history.push({id:`import:${entry.batch_id}`,action:entry.undone_at?'import-undone':'record-imported',reason:entry.label,actor:entry.actor,createdAt:entry.createdAt,before:entry.before,after:entry.after});
  history.sort((a:any,b:any)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
  const record=registryOutput(row);
  if(f.kind==='owners'){const [area]=await q`select id from ekapon.barangays where lower(name)=lower(${String(row.record_data.barangay??'')})`;record.data.barangayId=area?.id??0;}
  return {record,owner:owner?registryOutput(owner):null,pets:pets.map(registryOutput),possiblePets:possible.map(registryOutput),history};
 }));
},POST:async(c)=>{
 const session=await requireAuth(c.req,{roles:['Admin','SuperAdmin']});
 const b=parse(writeSchema,c.body),d=b.draft;
 return ok(await tx(session.id,async(q)=>{
  await registryLock(q);
  const hash=registryHash(d);
  const [prior]=await q`select actor_id,payload_hash,result from ekapon.registry_requests where request_id=${d.requestId}::uuid`;
  if(prior){if(prior.actor_id!==session.id||prior.payload_hash!==hash)throw conflict('REQUEST_REUSED','This save reference was used for a different request.');return {...prior.result,replayed:true};}
  for(const p of d.pets??[]){if(p.breed&&!PET_BREEDS[p.species].includes(p.breed as never)){const [ref]=await q`select name from ekapon.pet_breed_references where species=${p.species} and name=${p.breed} and active`;if(!ref)throw unprocessable('BREED_REQUIRED','Select a standardized breed from the list.');}}
  const s=await state(q,d,session,b.action==='save');
  if(b.action==='preview'){
   const token=await new SignJWT({purpose:'registry-review',draft:hash,state:s.fingerprint}).setProtectedHeader({alg:'HS256'}).setSubject(String(session.id)).setIssuedAt().setExpirationTime('10m').sign(secret());
   return {draft:d,token,barangay:s.barangay,owner:s.owner?registryOutput(s.owner):null,previousOwner:s.previousOwner?registryOutput(s.previousOwner):null,pet:s.pet?registryOutput(s.pet):null,linkedPets:s.linked.map(registryOutput),matches:s.matches.slice(0,20).map(registryOutput),matchCount:s.matches.length,warnings:s.warnings,needsAcknowledgement:s.needsAcknowledgement};
  }
  let claim:any;
  try{claim=(await jwtVerify(b.token??'',secret(),{algorithms:['HS256']})).payload;}catch{throw conflict('REVIEW_REQUIRED','Review the current records again before saving.');}
  if(claim.purpose!=='registry-review'||claim.sub!==String(session.id)||claim.draft!==hash||claim.state!==s.fingerprint)throw conflict('REVIEW_CHANGED','The form, owner, pets, or possible matches changed. Review the latest information before saving.');
  if(s.needsAcknowledgement&&(!b.acknowledgeMatches||b.matchReason.length<3))throw conflict('MATCH_REVIEW_REQUIRED','Confirm the possible matches and explain why these are separate records.');
  const ownerId=s.owner?.record_id??randomUUID(),petIds:string[]=d.mode==='link-owner'?[s.pet.record_id]:(d.pets??[]).map(()=>d.mode==='edit-pet'?s.pet.record_id:randomUUID());
  const result={saved:true,ownerId,petIds,mode:d.mode};
  await q`insert into ekapon.registry_requests(request_id,actor_id,payload_hash,result) values(${d.requestId}::uuid,${session.id},${hash},${q.json(result)})`;
  const reason=[d.reason,s.needsAcknowledgement?b.matchReason:''].filter(Boolean).join(' · ')||null;
  const save=async(kind:string,id:string,previous:any,data:Record<string,unknown>,action:string)=>{
   const [r]=previous?await q`update ekapon.dashboard_records set record_data=${q.json(jsonValue(data))},updated_at=now() where id=${previous.id} returning id`:
    await q`insert into ekapon.dashboard_records(dataset,record_id,record_data) values(${kind},${id},${q.json(jsonValue(data))}) returning id`;
   await q`insert into ekapon.registry_activity(request_id,record_id,actor_id,action,reason,before_data,after_data) values(${d.requestId}::uuid,${r.id},${session.id},${action},${reason},${previous?q.json(jsonValue(publicRegistryData(previous.record_data))):null},${q.json(jsonValue(publicRegistryData(data)))})`;
   await syncCensusRegistry(q,kind,id,data);
  };
  let ownerData=s.owner?.record_data;
  if(d.owner){const digits=d.owner.contact.replace(/\D/g,'');ownerData={...(ownerData??{}),id:ownerId,name:d.owner.name,address:d.owner.address,contact:digits,barangay:s.barangay.name,barangayId:s.barangay.id};
   if(d.intake)ownerData.source=`Verified ${d.intake.source} intake`;
   if('mobile' in ownerData)ownerData.mobile=ownerData.contact;if('owner_name' in ownerData)ownerData.owner_name=ownerData.name;
   await save('owners',ownerId,s.owner,ownerData,s.owner?'owner-updated':'owner-created');
   if(s.owner&&(s.owner.record_data.name!==ownerData.name||s.owner.record_data.barangay!==ownerData.barangay))for(const p of s.linked){const data={...p.record_data,owner:ownerData.name,barangay:ownerData.barangay};if('owner_name'in data)data.owner_name=ownerData.name;if('barangayId'in data)data.barangayId=ownerData.barangayId;await save('pets',p.record_id,p,data,'owner-details-synced');}
  }
  if(d.mode==='link-owner'){
   const data={...s.pet.record_data,owner_id:ownerId,owner:ownerData.name,barangay:ownerData.barangay};if('owner_name'in data)data.owner_name=ownerData.name;if('barangayId'in data)data.barangayId=ownerData.barangayId;
   await save('pets',s.pet.record_id,s.pet,data,'owner-link-corrected');
  }else for(const [index,p] of (d.pets??[]).entries()){
   const previous=d.mode==='edit-pet'?s.pet:null,id=petIds[index];
   const data={...(previous?.record_data??{}),id,petName:p.name,species:p.species,sex:p.sex,age_months:p.ageMonths,breed:p.breed||'Unknown',breedClass:p.breedClass,vaccinationStatus:p.vaccinationStatus,sterilizationStatus:p.sterilizationStatus,vaccineType:p.vaccineType,vaccinationDate:p.vaccinationDate,color:p.color,remarks:p.remarks,owner_id:ownerId,owner:ownerData.name,barangay:ownerData.barangay};
   if('name'in data)data.name=p.name;if('pet_name'in data)data.pet_name=p.name;if('owner_name'in data)data.owner_name=ownerData.name;
   if('ageMonths'in data)data.ageMonths=p.ageMonths;
   // Legacy `age` has no reliable unit. Preserve it; confirmed months are stored separately.
   await save('pets',id,previous,data,previous?'pet-updated':'pet-created');
  }
  if(['add-pets','link-owner'].includes(d.mode)){
   const [area]=await q`select id from ekapon.barangays where lower(name)=lower(${ownerData.barangay})`;
   await logOwnerLink(q,session,ownerId,'pets-linked',`${d.mode==='add-pets'?'Added pets':'Corrected pet owner link'} in reviewed save ${d.requestId}`,{name:ownerData.name,barangayId:area.id});
   if(d.mode==='link-owner'&&s.previousOwner&&!s.previousOwner.archived){const previous=s.previousOwner.record_data;const [oldArea]=await q`select id from ekapon.barangays where lower(name)=lower(${previous.barangay})`;if(oldArea)await logOwnerLink(q,session,s.previousOwner.record_id,'pets-unlinked',`Pet ownership corrected in reviewed save ${d.requestId}`,{name:previous.name,barangayId:oldArea.id});}
  }
  if(d.intake){await q`insert into ekapon.registry_intake_links(source,source_id,owner_record_id,actor_id) values(${d.intake.source},${d.intake.id},${ownerId},${session.id})`;await logOwnerLink(q,session,ownerId,d.intake.source==='interest'?'interest-linked':d.intake.source==='stub'?'stub-linked':'attendance-linked',`Verified ${d.intake.source} intake ${d.intake.id}`,{name:ownerData.name,barangayId:ownerData.barangayId});}
  return result;
 }));
}});
