import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { startServer,client,type Resp } from './harness';
import { sql,closeDb } from '../server/db';
import { sessionCookie } from '../server/auth';
import { approvalToken } from './census-review-helpers';
import type { StandaloneDraft } from '../shared/fieldRecords';
const tag=`Field${randomUUID().slice(0,8)}`;
let call:ReturnType<typeof client>,close:()=>Promise<void>,admin:string,superAdmin:string,field:string,area:any;
const actors:number[]=[],submissions:string[]=[];let visitId:string,campaign:number;
const ownerId=`${tag}-owner`,petId=`${tag}-pet`,otherPet=`${tag}-other-pet`;
const yes=(r:Resp)=>{expect([200,201],JSON.stringify(r.json)).toContain(r.status);return r.json;};
const get=(path:string,cookie=admin)=>call('GET',`/api/v1${path}`,{cookie});
const post=(json:unknown,cookie=admin)=>call('POST','/api/v1/field-records',{cookie,json});
const draft=(patch:Partial<StandaloneDraft>={}):StandaloneDraft=>({requestId:randomUUID(),ownerId,servedOn:'2026-10-18',location:'Synthetic clinic',provider:'Synthetic veterinarian',note:'Synthetic reviewed visit',pets:[{petId,procedures:[{process:'Microchipping',outcome:'Completed'},{process:'Anti-Rabies Vaccine',outcome:'Deferred'}]}],...patch});
const preview=async(d:StandaloneDraft)=>yes(await post({action:'preview',draft:d}));
const save=async(d:StandaloneDraft,duplicateReason='')=>{const r=await preview(d);return post({action:'save',draft:d,token:r.token,duplicateReason});};
beforeAll(async()=>{
 const s=await startServer();call=client(s.base);close=s.close;[area]=await sql()`select id,name from ekapon.barangays order by id limit 1`;
 for(const type of ['Admin','SuperAdmin','Paravet']){const [r]=await sql()`insert into ekapon.accounts(username,account_type,first_name,last_name,barangay_id) values(${type==='Paravet'?null:`${tag}${type}`},${type},${tag},${type},${type==='Paravet'?area.id:null}) returning id`;actors.push(r.id);const cookie=(await sessionCookie({id:r.id,type},'full')).split(';')[0];if(type==='Admin')admin=cookie;else if(type==='SuperAdmin')superAdmin=cookie;else field=cookie;}
 for(const [kind,id,data] of [['owners',ownerId,{name:`${tag} Owner`,barangay:area.name,address:'Synthetic address',contact:'',id_image:'PRIVATE-IMAGE'}],['pets',petId,{petName:'Field Mochi',species:'Cat',sex:null,age_months:null,owner_id:ownerId,barangay:area.name}],['pets',otherPet,{petName:'Different owner pet',species:'Dog',owner_id:'another-owner',barangay:area.name}],...['respondents','participants','services'].map(kind=>[kind,`${tag}-history-${kind}`,{name:`${tag} Historical`,barangay:area.name,date:'2025-01-02',status:'Recorded',private_photo:'PRIVATE-IMAGE'}])] as [string,string,Record<string,unknown>][]){await sql()`insert into ekapon.dashboard_records(dataset,record_id,record_data) values(${kind},${id},${sql().json({id,...data})})`;}
 const [r]=await sql()`insert into ekapon.dashboard_records(dataset,record_id,record_data) values('programs',${`${tag}-program`},${sql().json({id:`${tag}-program`,title:tag,date:'2026-10-18',status:'Open',barangay:area.name,processes:['Microchipping']})}) returning id`;
 const [c]=await sql()`insert into ekapon.program_interest_campaigns(reference,campaign_type,host_barangay_id,program_record_id,processes,status,created_by) values(${tag},'program_day',${area.id},${r.id},${['Microchipping']},'scheduled',${actors[0]}) returning id`;campaign=c.id;
 await sql()`insert into ekapon.program_interest_allowed_barangays(campaign_id,barangay_id,added_by) values(${campaign},${area.id},${actors[0]})`;
});
afterAll(async()=>{
 await sql()`delete from ekapon.dashboard_records where record_data->>'visitId' in(select id::text from ekapon.standalone_services where actor_id=any(${actors}::bigint[])) or record_data->>'campaignId'=${String(campaign)}`;
 await sql()`delete from ekapon.standalone_services where actor_id=any(${actors}::bigint[])`;
 await sql()`delete from ekapon.stub_activity where campaign_id=${campaign}`;await sql()`delete from ekapon.program_attendance where campaign_id=${campaign}`;
 await sql()`delete from ekapon.program_interest_campaigns where id=${campaign}`;
 await sql()`delete from ekapon.census_submissions where id=any(${submissions}::uuid[])`;
 await sql()`delete from ekapon.registry_owners where owner_name like ${`${tag}%`}`;
 await sql()`delete from ekapon.registry_source_links l using ekapon.dashboard_records d where l.dataset=d.dataset and l.record_id=d.record_id and (d.record_data->>'name' like ${`${tag}%`} or d.record_data->>'owner' like ${`${tag}%`})`;
 await sql()`delete from ekapon.dashboard_records where record_id like ${`${tag}%`} or record_data->>'name' like ${`${tag}%`} or record_data->>'owner' like ${`${tag}%`}`;
 await sql()`delete from ekapon.accounts where id=any(${actors}::bigint[])`;await close();await closeDb();
});
describe('field record sources and reviewed standalone services',()=>{
 it('keeps all legacy rows separate and blocks generic new respondents, participants, and services',async()=>{
  for(const kind of ['respondents','participants','services']){
   expect(yes(await get(`/field-records?kind=${kind}&q=${tag}`)).data).toHaveLength(0);
   const old=yes(await get(`/field-records?kind=${kind}&view=history&q=${tag}`));expect(old.data).toHaveLength(1);expect(JSON.stringify(old)).not.toContain('PRIVATE-IMAGE');
   expect((await call('POST',`/api/v1/records/${kind}`,{cookie:admin,json:{records:[{id:`${tag}-bypass`,name:'Bypass'}]}})).json.error.code).toBe('FIELD_WORKFLOW_REQUIRED');
  }
  for(const kind of ['respondents','participants'])expect((await call('POST',`/api/v1/records/${kind}/import`,{cookie:admin,json:{batchId:randomUUID(),label:'Bypass',records:[{id:`${tag}-import`} ]}})).status).toBe(409);
 });
 it('projects only approved accepted census respondents, preserves unknowns, and revalidates basket access after undo',async()=>{
  const created=yes(await call('POST','/api/v1/census/submissions',{cookie:field,json:{label:tag,censusDate:'2026-10-18',source:'csv',householdsVisited:2,owners:[{ownerName:`${tag} Accepted census`,address:'Synthetic',pets:[{petName:'Census cat',species:'Cat',sex:'Female',vaccine1st:null}]},{ownerName:`${tag} Rejected census`,address:'Synthetic',pets:[{petName:'Rejected cat',species:'Cat',sex:'Male'}]}]}}));
  const id=created.submission.id;submissions.push(id);
  expect(yes(await get(`/field-records?kind=respondents&q=${tag}`)).data).toHaveLength(0);
  const d=yes(await get(`/census/submissions/${id}`));
  yes(await call('PUT',`/api/v1/census/submissions/${id}/decisions`,{cookie:admin,json:{decisions:d.owners.map((o:any,i:number)=>({ownerId:o.id,decision:i?'reject':'new',...(i?{reason:'Synthetic rejected entry'}:{})}))}}));
  yes(await call('POST',`/api/v1/census/submissions/${id}/review`,{cookie:admin,json:{decision:'approve',reviewToken:await approvalToken(call,id,admin)}}));
  const rows=yes(await get(`/field-records?kind=respondents&q=${tag}`)).data;expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({name:`${tag} Accepted census`,source:'Approved census',petCount:1});expect(rows[0].ownerId).toBeTruthy();
  const detail=yes(await get(`/field-records?kind=respondents&id=${rows[0].id}`));expect(detail.pets[0].vaccine_1st).toBeNull();expect(detail.history).toHaveLength(2);
  const item={key:'census',source:'Respondents',id:rows[0].id};const basket=()=>call('POST','/api/v1/report-basket-preview',{cookie:admin,json:{items:[item]}});
  expect(yes(await basket()).items).toHaveLength(1);
  yes(await call('POST',`/api/v1/census/submissions/${id}/status`,{cookie:admin,json:{action:'undo'}}));
  expect(yes(await get(`/field-records?kind=respondents&q=${tag}`)).data).toHaveLength(0);expect(yes(await basket()).unavailable).toEqual(['census']);
 });
 it('requires current explicit owner/pet review and rejects changed form, dates, cross-owner pets, and stale links',async()=>{
  let d=draft();const r=await preview(d);expect(JSON.stringify(r)).not.toContain('PRIVATE-IMAGE');expect(r.pets[0].sex).toBeNull();
  expect((await post({action:'save',draft:d,token:''})).status).toBe(409);
  expect((await post({action:'save',draft:{...d,location:'Changed'},token:r.token})).status).toBe(409);
  expect((await post({action:'preview',draft:draft({servedOn:'2099-01-01'})})).status).toBe(400);
  expect((await post({action:'preview',draft:draft({servedOn:'2026-02-30'})})).status).toBe(400);
  expect((await post({action:'preview',draft:draft({pets:[{petId:otherPet,procedures:d.pets[0].procedures}]})})).status).toBe(409);
  await sql()`update ekapon.dashboard_records set record_data=record_data||'{"remarks":"Changed after preview"}'::jsonb where record_id=${petId}`;
  expect((await post({action:'save',draft:d,token:r.token})).status).toBe(409);
 });
 it('saves once across concurrent retries and projects only completed procedures',async()=>{
  const d=draft(),r=await preview(d);
  const results=await Promise.all([post({action:'save',draft:d,token:r.token}),post({action:'save',draft:d,token:r.token})]);results.forEach(yes);visitId=d.requestId;
  expect(results.some(v=>v.json.replayed)).toBe(true);
  const rows=await sql()`select record_id,record_data from ekapon.dashboard_records where record_data->>'visitId'=${visitId}`;expect(rows).toHaveLength(1);expect(rows[0].record_data.process).toBe('Microchipping');
  const detail=yes(await get(`/field-records?kind=services&view=standalone&id=${visitId}`));expect(detail.pets[0].procedures).toHaveLength(2);expect(detail.history[0].action).toContain('review');
  const basket=yes(await call('POST','/api/v1/report-basket-preview',{cookie:admin,json:{items:[{key:'visit',source:'Standalone visits',id:visitId}]}}));expect(basket.items).toHaveLength(1);
  for(const action of ['POST','import','archive']){const path=action==='POST'?'/api/v1/records/services':`/api/v1/records/services/${action}`;const body=action==='archive'?{ids:[rows[0].record_id],archived:true}:{records:[{id:rows[0].record_id,name:'Overwrite'}],batchId:randomUUID(),label:'Bypass'};expect((await call('POST',path,{cookie:superAdmin,json:body})).status).toBe(409);}
 });
 it('requires a repeat-visit reason without merging identities, and allows later participation',async()=>{
  const d=draft(),r=await preview(d);expect(r.duplicates).toHaveLength(1);
  expect((await post({action:'save',draft:d,token:r.token})).json.error.code).toBe('DUPLICATE_REVIEW_REQUIRED');
  yes(await post({action:'save',draft:d,token:r.token,duplicateReason:'Verified a separate actual visit'}));
  yes(await save(draft({servedOn:'2026-10-17'})));
 });
 it('rolls back the visit when a completed procedure insert fails',async()=>{
  const name=`field_fail_${tag.toLowerCase()}`;const d=draft({location:'Atomic failure'}),r=await preview(d);
  await sql().unsafe(`create function ekapon.${name}() returns trigger language plpgsql as $$ begin if NEW.record_data->>'location'='Atomic failure' then raise exception 'Synthetic failure' using errcode='23514';end if;return NEW;end $$;create trigger ${name} before insert on ekapon.dashboard_records for each row execute function ekapon.${name}()`);
  try{expect((await post({action:'save',draft:d,token:r.token,duplicateReason:'Atomic fixture separate visit'})).status).toBe(422);expect(await sql()`select id from ekapon.standalone_services where id=${d.requestId}::uuid`).toHaveLength(0);}finally{await sql().unsafe(`drop trigger ${name} on ekapon.dashboard_records;drop function ekapon.${name}()`);}
 });
 it('retains deferred-only visits without inventing completed procedures and still marks Services updated',async()=>{
  const d=draft({servedOn:'2026-10-16',pets:[{petId,procedures:[{process:'Anti-Rabies Vaccine',outcome:'Deferred'}]}]});
  const saved=yes(await save(d));
  expect(await sql()`select record_id from ekapon.dashboard_records where record_data->>'visitId'=${saved.id}`).toHaveLength(0);
  expect(yes(await get(`/field-records?kind=services&view=standalone&id=${saved.id}`)).pets[0].procedures[0].outcome).toBe('Deferred');
  expect(yes(await get('/navigation-badges',superAdmin)).badges.services.updated).toBe(true);
 });
 it('voids with a reason and keeps snapshots and history after current registry changes',async()=>{
  await sql()`update ekapon.dashboard_records set record_data=record_data||'{"name":"Current renamed owner"}'::jsonb where record_id=${ownerId}`;
  expect((await post({action:'void',id:visitId,reason:''})).status).toBe(400);
  yes(await post({action:'void',id:visitId,reason:'Synthetic visit was entered in error'}));
  const detail=yes(await get(`/field-records?kind=services&view=standalone&id=${visitId}`));expect(detail.owner.name).toBe(`${tag} Owner`);expect(detail.history).toHaveLength(2);expect(detail.record.status).toBe('Voided');
  expect(await sql()`select 1 from ekapon.dashboard_records where record_data->>'visitId'=${visitId} and not archived`).toHaveLength(0);
  expect(yes(await get(`/field-records?kind=services&view=standalone&id=${visitId}&includeVoided=true`)).record.status).toBe('Voided');
  const backup=yes(await get('/admin/backup',superAdmin));expect(backup.data.standaloneServices.some((s:any)=>s.id===visitId)).toBe(true);
 });
 it('shows canonical program participants/services and their void history separately from historical records',async()=>{
  const r=yes(await call('POST','/api/v1/stub-workflow',{cookie:admin,json:{action:'walk-in',campaignId:campaign,requestId:randomUUID(),attendedOn:'2026-10-18',owner:{name:`${tag} Program owner`,address:'Synthetic',mobile:'',barangayId:area.id},pets:[{name:'Program Mochi',species:'Cat',processes:['Microchipping'],outcome:'Completed'}]}}));
  const p=yes(await get(`/field-records?kind=participants&q=${tag}`)).data;expect(p).toHaveLength(1);expect(p[0].source).toBe('Program · Walk-in');
  const [program]=await sql()`select program_record_id from ekapon.program_interest_campaigns where id=${campaign}`;expect(p[0].programId).toBe(program.program_record_id);
  expect(yes(await get(`/field-records?kind=services&q=${tag}`)).data).toHaveLength(1);
  expect(yes(await get(`/field-records?kind=participants&id=${p[0].id}`)).history).toHaveLength(1);
  yes(await call('POST','/api/v1/stub-workflow',{cookie:admin,json:{action:'void-attendance',attendanceId:p[0].attendanceId,reason:'Synthetic duplicate attendance'}}));
  expect(yes(await get(`/field-records?kind=participants&q=${tag}`)).data).toHaveLength(0);
  expect(yes(await get(`/field-records?kind=participants&id=${p[0].id}&includeVoided=true`)).history).toHaveLength(2);
 });
 it('enforces roles and current registry/operations features and binds sidebar read receipts to the right section',async()=>{
  expect((await get('/field-records?kind=respondents',field)).status).toBe(403);expect((await post({action:'preview',draft:draft()},field)).status).toBe(403);
  const response=await call('GET','/api/v1/field-records?kind=services',{cookie:admin,headers:{'X-Nav-Node':'participants'}});expect(response.headers.get('x-nav-receipt')).toBeNull();
  const correct=await call('GET','/api/v1/field-records?kind=services',{cookie:admin,headers:{'X-Nav-Node':'services'}});expect(correct.headers.get('x-nav-receipt')).toBeTruthy();
  for(const feature of ['registry','operations']){
   const [prior]=await sql()`select enabled from ekapon.role_feature_access where account_type='Admin' and feature_key=${feature}`;
   try{await sql()`insert into ekapon.role_feature_access(account_type,feature_key,enabled) values('Admin',${feature},false) on conflict(account_type,feature_key) do update set enabled=false`;expect((await get('/field-records?kind=services')).status).toBe(403);expect((await post({action:'void',id:visitId,reason:'Hidden feature attempt'})).status).toBe(403);}finally{if(prior)await sql()`update ekapon.role_feature_access set enabled=${prior.enabled} where account_type='Admin' and feature_key=${feature}`;else await sql()`delete from ekapon.role_feature_access where account_type='Admin' and feature_key=${feature}`;}
  }
 });
});
