import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { route, ok, parse } from '../../server/http';
import { requireAuth, type Session } from '../../server/auth';
import { sql, tx } from '../../server/db';
import { config } from '../../server/config';
import { conflict, forbidden, notFound } from '../../server/errors';
import { registryHash, registryLock, publicRegistryData } from '../../server/registry';
import { fieldSourceSql } from '../../server/fieldRecords';
import { realDateSchema, todayManila } from '../../server/stubWorkflow';
import { PROGRAM_PROCESSES } from '../../shared/programs';
import { SERVICE_OUTCOMES, type StandaloneDraft } from '../../shared/fieldRecords';
import { likePattern } from '../../server/listing';
import { jsonValue } from '../../server/dashboard';
import { invalidateSummaries } from '../../server/summaryCache';

const text=(max:number)=>z.string().trim().max(max);
const reason=text(1000).min(3);
const draftSchema=z.object({requestId:z.string().uuid(),ownerId:text(100).min(1),servedOn:realDateSchema.refine(v=>v<=todayManila(),'Actual service dates cannot be in the future.'),location:text(300).min(1),provider:text(120).min(1),note:text(1000),pets:z.array(z.object({petId:text(100).min(1),procedures:z.array(z.object({process:z.enum(PROGRAM_PROCESSES),outcome:z.enum(SERVICE_OUTCOMES)}).strict()).min(1).max(3).refine(v=>new Set(v.map(p=>p.process)).size===v.length,'Select each procedure once.')} ).strict()).min(1).max(30).refine(v=>new Set(v.map(p=>p.petId)).size===v.length,'Select each pet once.')}).strict();
const writeSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('preview'),draft:draftSchema}),
 z.object({action:z.literal('save'),draft:draftSchema,token:text(4000),duplicateReason:text(1000).default('')}),
 z.object({action:z.literal('void'),id:z.string().uuid(),reason}),
]);
const secret=()=>new TextEncoder().encode(config().jwtSecret);
async function requireRegistry(session:Session,q:any){
 if(session.type==='SuperAdmin')return;
 const [off]=await q`select 1 from ekapon.role_feature_access where account_type=${session.type} and feature_key='registry' and enabled=false`;
 if(off)throw forbidden('The registry feature is currently unavailable for your role.');
}
async function reviewState(q:any,d:StandaloneDraft){
 const [owner]=await q`select record_id,record_data from ekapon.dashboard_records where dataset='owners' and record_id=${d.ownerId} and not archived and coalesce(record_data->>'_sampleData','false')<>'true' for share`;
 if(!owner)throw conflict('ACTIVE_OWNER_REQUIRED','Select an active owner from the registry.');
 const pets=await q`select record_id,record_data from ekapon.dashboard_records where dataset='pets' and record_data->>'owner_id'=${d.ownerId} and not archived and coalesce(record_data->>'_sampleData','false')<>'true' order by record_id for share`;
 const selected=d.pets.map(p=>{const pet=pets.find((r:any)=>r.record_id===p.petId);if(!pet||!['Dog','Cat'].includes(pet.record_data.species))throw conflict('PET_OWNER_CHANGED','A selected pet is unavailable or its owner link changed. Review the registry first.');return {...publicRegistryData(pet.record_data),id:pet.record_id,procedures:p.procedures} as Record<string,unknown>&{id:string;procedures:typeof p.procedures};});
 const previous=await q`select id,served_on::text as date,provider,pets_snapshot from ekapon.standalone_services where owner_record_id=${d.ownerId} and served_on=${d.servedOn}::date and status='Submitted' order by id`;
 const duplicates=previous.filter((s:any)=>s.pets_snapshot.some((p:any)=>d.pets.some(v=>v.petId===p.id&&v.procedures.some(proc=>p.procedures.some((old:any)=>old.process===proc.process)))));
 const snapshot:Record<string,unknown>&{id:string}={...publicRegistryData(owner.record_data),id:owner.record_id};
 return {owner:snapshot,pets:selected,duplicates:duplicates.map((s:any)=>({id:s.id,date:s.date,provider:s.provider})),fingerprint:registryHash([owner.record_data,pets.map((p:any)=>[p.record_id,p.record_data]),duplicates])};
}

export default route({GET:async c=>{
 const session=await requireAuth(c.req,{roles:['Admin','SuperAdmin']});
 const f=parse(z.object({kind:z.enum(['respondents','participants','services']),view:z.enum(['primary','standalone','history']).default('primary'),q:text(120).default(''),page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(25),includeVoided:z.enum(['true','false']).default('false'),id:text(120).optional()}),c.query);
 if(f.view==='standalone'&&f.kind!=='services')throw notFound();
 return ok(await sql().begin(async q=>{
  await q`set transaction isolation level repeatable read, read only`;
  await requireRegistry(session,q);
  if(f.kind==='respondents'&&f.view==='primary'&&session.type!=='SuperAdmin'){
   const [off]=await q`select 1 from ekapon.role_feature_access where account_type=${session.type} and feature_key='census' and enabled=false`;
   if(off)throw forbidden('Census access is required to view approved census respondents.');
  }
  if(f.id&&f.view==='standalone'){
   const [s]=await q`select s.*,u.full_name as encoder,v.full_name as voider from ekapon.standalone_services s join ekapon.accounts u on u.id=s.actor_id left join ekapon.accounts v on v.id=s.voided_by where s.id::text=${f.id}`;
   if(!s)throw notFound();
   return {record:{id:s.id,name:s.owner_snapshot.name,date:s.served_on,barangay:s.owner_snapshot.barangay,status:s.status,source:'Standalone visit',provider:s.provider,location:s.location,note:s.note,ownerId:s.owner_record_id},owner:s.owner_snapshot,pets:s.pets_snapshot,history:[{action:'Recorded after review',actor:s.encoder,at:s.created_at,reason:s.note||null},...(s.status==='Voided'?[{action:'Voided',actor:s.voider,at:s.voided_at,reason:s.void_reason}]:[])],duplicateReason:s.duplicate_reason};
  }
  const source=fieldSourceSql(f.kind,f.view,f.includeVoided==='true');
  const where=`($1='' or record_data::text ilike $2) and ($3='' or record_id=$3)`;
  const args=[f.q,likePattern(f.q),f.id??''];
  const [{total}]=await q.unsafe(`select count(*)::int as total from (${source}) x where ${where}`,args);
  const rows=await q.unsafe(`select * from (${source}) x where ${where} order by updated_at desc,record_id limit ${f.pageSize} offset ${(f.page-1)*f.pageSize}`,args);
  if(f.id&&rows.length){
   const row=rows[0].record_data;
   if(f.kind==='respondents'&&f.view==='primary'){
    const ownerId=f.id.slice('CENSUSRESP-'.length);
    const pets=await q`select pet_name,species,sex,age_months,breed_type,color,sterilized,confinement,vaccine_1st,vaccine_2nd,vaccine_3rd,vaccine_other,remarks from ekapon.census_pets where owner_id::text=${ownerId} order by line_no`;
    const [s]=await q`select submitter_name,created_at,reviewer_name,reviewed_at from ekapon.census_submissions where id::text=${row.submissionId}`;
    return {record:row,pets,history:[{action:'Census submitted',actor:s.submitter_name,at:s.created_at},{action:'Census approved',actor:s.reviewer_name,at:s.reviewed_at}]};
   }
   if(f.view==='primary'&&row.attendanceId){
    const [a]=await q`select a.*,v.full_name as voider from ekapon.program_attendance a left join ekapon.accounts v on v.id=a.voided_by where a.id=${Number(row.attendanceId)}`;
    return {record:row,history:[{action:`${a.source} attendance recorded`,actor:a.encoded_by_name,at:a.created_at},...(a.status==='Voided'?[{action:'Attendance voided',actor:a.voider,at:a.voided_at,reason:a.void_reason}]:[])]};
   }
  }
  return {data:rows.map((r:any)=>({...((f.view==='history')?publicRegistryData(r.record_data):r.record_data),id:r.record_id,_archived:r.archived})),page:f.page,pageSize:f.pageSize,total};
 }));
},POST:async c=>{
 const session=await requireAuth(c.req,{roles:['Admin','SuperAdmin']});
 const b=parse(writeSchema,c.body);
 const result=await tx(session.id,async q=>{
  await requireRegistry(session,q);
  if(b.action==='void'){
   const [s]=await q`select * from ekapon.standalone_services where id=${b.id}::uuid for update`;
   if(!s)throw notFound();
   if(s.status==='Voided')return {saved:true,id:s.id,replayed:true};
   await q`update ekapon.standalone_services set status='Voided',voided_by=${session.id},voided_at=now(),void_reason=${b.reason} where id=${b.id}::uuid`;
   await q`update ekapon.dashboard_records set archived=true,updated_at=now() where dataset='services' and record_data->>'workflow'='standalone-services-v1' and record_data->>'visitId'=${b.id}`;
   return {saved:true,id:s.id};
  }
  await registryLock(q);
  const d=b.draft,hash=registryHash(d);
  const [prior]=await q`select id,actor_id,payload_hash from ekapon.standalone_services where id=${d.requestId}::uuid`;
  if(prior){if(b.action==='preview'||prior.actor_id!==session.id||prior.payload_hash!==hash)throw conflict('REQUEST_REUSED','This save reference was already used. Open a new standalone service form.');return {saved:true,id:prior.id,replayed:true};}
  const s=await reviewState(q,d);
  if(b.action==='preview'){
   const token=await new SignJWT({purpose:'standalone-review',draft:hash,state:s.fingerprint}).setProtectedHeader({alg:'HS256'}).setSubject(String(session.id)).setIssuedAt().setExpirationTime('10m').sign(secret());
   return {token,owner:s.owner,pets:s.pets,duplicates:s.duplicates};
  }
  let claim:any;try{claim=(await jwtVerify(b.token,secret(),{algorithms:['HS256']})).payload;}catch{throw conflict('REVIEW_REQUIRED','Review the current details again before saving.');}
  if(claim.purpose!=='standalone-review'||claim.sub!==String(session.id)||claim.draft!==hash||claim.state!==s.fingerprint)throw conflict('REVIEW_CHANGED','The selected records or form changed. Review the latest details again.');
  if(s.duplicates.length&&b.duplicateReason.length<3)throw conflict('DUPLICATE_REVIEW_REQUIRED','Explain why this is a separate actual visit after checking the matching services.');
  await q`insert into ekapon.standalone_services(id,actor_id,payload_hash,owner_record_id,owner_snapshot,pets_snapshot,served_on,location,provider,note,duplicate_reason) values(${d.requestId}::uuid,${session.id},${hash},${d.ownerId},${q.json(jsonValue(s.owner))},${q.json(jsonValue(s.pets))},${d.servedOn}::date,${d.location},${d.provider},${d.note},${s.duplicates.length?b.duplicateReason:null})`;
  for(const [index,pet] of s.pets.entries())for(const [procIndex,p] of d.pets[index].procedures.entries()){
   if(p.outcome!=='Completed')continue;
   const id=`STANDALONE-${d.requestId}-${index+1}-${procIndex+1}`;
   const row={id,workflow:'standalone-services-v1',visitId:d.requestId,source:'Reviewed standalone service',date:d.servedOn,owner_id:d.ownerId,pet_id:pet.id,name:s.owner.name,owner:s.owner.name,clientName:s.owner.name,barangay:s.owner.barangay,address:s.owner.address,contact:s.owner.contact,petName:pet.petName??pet.name,species:pet.species,sex:pet.sex,provider:d.provider,location:d.location,service:p.process,process:p.process,procedureType:p.process,status:'Completed',outcome:'Completed'};
   await q`insert into ekapon.dashboard_records(dataset,record_id,record_data) values('services',${id},${q.json(jsonValue(row))})`;
  }
  return {saved:true,id:d.requestId};
 });
 if(b.action!=='preview')invalidateSummaries();
 return ok(result);
}},{invalidateSummaries:false});
