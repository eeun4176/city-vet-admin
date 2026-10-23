import { randomBytes,randomUUID } from 'node:crypto';
import { beforeAll,afterAll,describe,it,expect } from 'vitest';
import { startServer,client,type Resp } from './harness';
import { sql,closeDb } from '../server/db';
import { sessionCookie } from '../server/auth';
import { approvalToken } from './census-review-helpers';
import { searchRecords,searchSources,sourceSql,searchArgs,searchInputSql,searchItem } from '../server/search';
import type { Session } from '../server/auth';
import { likePattern } from '../server/listing';
const tag=`Search${randomUUID().slice(0,8)}`;
let call:ReturnType<typeof client>,close:()=>Promise<void>,admin:string,superAdmin:string,field:string,invited:string,outside:string;
let area:any,remote:any,third:any,programId:number,campaign:number,batchId:number,otherBatchId:number,ticketId:number,attendanceId:number,otherAttendance:number,submissionId:string,respondentId:string;
const actors:number[]=[],records:string[]=[];const standaloneId=randomUUID(),voidVisit=randomUUID();let qrCode:string;
const ownerId=`${tag}-owner`,petId=`${tag}-pet`,archivedId=`${tag}-archived`,remoteId=`${tag}-remote`;
const yes=(r:Resp)=>{expect(r.status,JSON.stringify(r.json)).toBe(200);return r.json;};
const get=(path:string,cookie=admin)=>call('GET',`/api/v1${path}`,{cookie});
const search=async(term:string,cookie=admin,history=false)=>yes(await get(`/search?q=${encodeURIComponent(term)}&includeHistory=${history}`,cookie));
const preview=(source:string,id:string|number,cookie=admin)=>get(`/record-preview?source=${source}&id=${encodeURIComponent(id)}`,cookie);
async function record(dataset:string,id:string,data:Record<string,unknown>,archived=false){records.push(id);const [r]=await sql()`insert into ekapon.dashboard_records(dataset,record_id,record_data,archived) values(${dataset},${id},${sql().json({id,...data})},${archived}) returning id`;return r.id;}
beforeAll(async()=>{
 const s=await startServer();call=client(s.base);close=s.close;[area,remote,third]=await sql()`select id,name from ekapon.barangays order by id limit 3`;
 for(const [type,barangay] of [['Admin',null],['SuperAdmin',null],['Paravet',area.id],['Paravet',remote.id],['Paravet',third.id],['Paravet',area.id]] as const){const [a]=await sql()`insert into ekapon.accounts(username,account_type,first_name,last_name,barangay_id) values(${type==='Paravet'?null:`${tag}${actors.length}`},${type},${tag},${`${type}${actors.length}`},${barangay}) returning id`;actors.push(a.id);const cookie=(await sessionCookie({id:a.id,type},'full')).split(';')[0];if(actors.length===1)admin=cookie;else if(actors.length===2)superAdmin=cookie;else if(actors.length===3)field=cookie;else if(actors.length===4)invited=cookie;else if(actors.length===5)outside=cookie;}
 await record('owners',ownerId,{name:`${tag} Owner`,address:'Synthetic address',barangay:area.name,id_image:'PRIVATE-IMAGE-CANARY',private_token:'PRIVATE-TOKEN-CANARY'});
 await record('pets',petId,{petName:`${tag} Mochi`,owner_id:ownerId,owner:`${tag} Owner`,barangay:area.name,species:'Cat',sex:null,age_months:0});
 await record('owners',archivedId,{name:`${tag} Archived owner`,barangay:area.name},true);
 await record('owners',remoteId,{name:`${tag} Remote owner`,barangay:remote.name});
 for(const kind of ['respondents','participants','services','stubs','households','animals'])await record(kind,`${tag}-legacy-${kind}`,{name:`${tag} Historical ${kind}`,barangay:area.name,sourceFile:'old.csv'});
 programId=await record('programs',`${tag}-program`,{title:`${tag} Program`,date:'2026-10-18',barangay:area.name,barangayId:area.id,status:'Open',processes:['Microchipping']});
 const [c]=await sql()`insert into ekapon.program_interest_campaigns(reference,campaign_type,host_barangay_id,program_record_id,processes,status,created_by) values(${tag},'program_day',${area.id},${programId},${['Microchipping']},'scheduled',${actors[0]}) returning id`;campaign=c.id;
 await sql()`insert into ekapon.program_interest_allowed_barangays(campaign_id,barangay_id,added_by) values(${campaign},${remote.id},${actors[0]})`;
 for(const [suffix,barangay] of [['Own interest',area.id],['Remote interest',remote.id]] as const)await sql()`insert into ekapon.program_interest_people(campaign_id,owner_name,residence_barangay_id,pets,created_by) values(${campaign},${`${tag} ${suffix}`},${barangay},'[]'::jsonb,${actors[2]})`;
 const snap={title:`${tag} Program`,date:'2026-10-18',hostBarangay:area.name};
 for(const [suffix,recipient] of [['Own',actors[2]],['Other',actors[5]]] as const){const [b]=await sql()`insert into ekapon.stub_batches(reference,campaign_id,recipient_id,recipient_name,barangay_id,requested_quantity,status,program_snapshot,requested_by) values(${`${tag}-${suffix}-batch`},${campaign},${recipient},${`${tag} Paravet`},${area.id},3,'Requested',${sql().json(snap)},${recipient}) returning id`;if(suffix==='Own')batchId=b.id;else otherBatchId=b.id;}
 qrCode=`CVS1.${randomBytes(16).toString('base64url')}`;
 const [t]=await sql()`insert into ekapon.stub_tickets(batch_id,code,status,owner_snapshot,pets_snapshot,owner_barangay_id,issued_at) values(${batchId},${qrCode},'Issued',${sql().json({name:`${tag} Stub owner`,mobile:'',address:'Synthetic',barangayId:area.id})},${sql().json([{name:'Stub pet',species:'Cat',processes:['Microchipping']}])},${area.id},now()) returning id`;ticketId=t.id;
 for(const [suffix,barangay] of [['Own attendance',area.id],['Remote attendance',remote.id]] as const){const [a]=await sql()`insert into ekapon.program_attendance(request_id,payload_hash,campaign_id,source,owner_snapshot,owner_identity,owner_barangay_id,pets_snapshot,program_snapshot,attended_on,encoded_by,encoded_by_name) values(${randomUUID()}::uuid,${'a'.repeat(64)},${campaign},'Walk-in',${sql().json({name:`${tag} ${suffix}`,mobile:'',address:'Synthetic',barangayId:barangay})},${`${tag}-${suffix}`},${barangay},${sql().json([{name:`${tag} Attendance pet`,species:'Cat',processes:['Microchipping'],outcome:'Completed'}])},${sql().json(snap)},'2026-10-18',${actors[2]},'Synthetic Paravet') returning id`;if(suffix==='Own attendance')attendanceId=a.id;else otherAttendance=a.id;}
 await record('services',`QRATT-${tag}`,{workflow:'qr-stubs-v1',attendanceId,name:`${tag} Mirror-only procedure`,barangay:area.name});
 for(const [id,status] of [[standaloneId,'Submitted'],[voidVisit,'Voided']] as const)await sql()`insert into ekapon.standalone_services(id,actor_id,payload_hash,owner_record_id,owner_snapshot,pets_snapshot,served_on,location,provider,status,voided_by,voided_at,void_reason) values(${id}::uuid,${actors[0]},${'b'.repeat(64)},${ownerId},${sql().json({name:`${tag} Deferred-only visit`,barangay:area.name})},${sql().json([{id:petId,petName:`${tag} Deferred pet`,species:'Cat',age_months:0,sex:null,procedures:[{process:'Microchipping',outcome:'Deferred'}]}])},'2026-10-18','Synthetic clinic','Synthetic veterinarian',${status},${status==='Voided'?actors[0]:null},${status==='Voided'?new Date():null},${status==='Voided'?'Synthetic correction':null})`;
 const made=await call('POST','/api/v1/census/submissions',{cookie:field,json:{label:`${tag} Census`,source:'csv',censusDate:'2026-10-18',householdsVisited:1,owners:[{ownerName:`${tag} Approved respondent`,address:'Synthetic',pets:[{petName:`${tag} Census pet`,species:'Cat',sex:'Female',ageMonths:0,vaccine1st:null}]}]}});expect([200,201],JSON.stringify(made.json)).toContain(made.status);submissionId=made.json.submission.id;
 const detail=yes(await get(`/census/submissions/${submissionId}`));respondentId=`CENSUSRESP-${detail.owners[0].id}`;
 yes(await call('PUT',`/api/v1/census/submissions/${submissionId}/decisions`,{cookie:admin,json:{decisions:[{ownerId:detail.owners[0].id,decision:'new'}]}}));
 yes(await call('POST',`/api/v1/census/submissions/${submissionId}/review`,{cookie:admin,json:{decision:'approve',reviewToken:await approvalToken(call,submissionId,admin)}}));
});
afterAll(async()=>{
 await sql()`delete from ekapon.registry_activity where actor_id=any(${actors}::bigint[])`;
 if(submissionId)await sql()`delete from ekapon.census_submissions where id=${submissionId}::uuid`;
 await sql()`delete from ekapon.registry_owners where owner_name like ${`${tag}%`}`;
 await sql()`delete from ekapon.registry_source_links l using ekapon.dashboard_records d where l.dataset=d.dataset and l.record_id=d.record_id and (d.record_data->>'name' like ${`${tag}%`} or d.record_data->>'owner' like ${`${tag}%`})`;
 await sql()`delete from ekapon.standalone_services where actor_id=any(${actors}::bigint[])`;
 if(campaign){await sql()`delete from ekapon.stub_tickets where batch_id in(select id from ekapon.stub_batches where campaign_id=${campaign})`;await sql()`delete from ekapon.stub_batches where campaign_id=${campaign}`;await sql()`delete from ekapon.program_attendance where campaign_id=${campaign}`;await sql()`delete from ekapon.program_interest_people where campaign_id=${campaign}`;await sql()`delete from ekapon.program_interest_campaigns where id=${campaign}`;}
 await sql()`delete from ekapon.dashboard_records where record_id=any(${records}::text[]) or record_data->>'name' like ${`${tag}%`} or record_data->>'owner' like ${`${tag}%`}`;
 await sql()`delete from ekapon.accounts where id=any(${actors}::bigint[])`;await close();await closeDb();
});
describe('source-aware search and navigation',()=>{
 it('preserves complete result ordering and hasMore when sources are bounded before merging',async()=>{
  for(const role of ['Admin','Paravet'] as const){
   const session:Session={id:role==='Admin'?actors[0]:actors[2],type:role,scope:'full',key:null,username:null,name:tag,barangayId:role==='Paravet'?area.id:null,barangay:role==='Paravet'?area.name:null,locale:'en',grants:[]};
   for(const history of [false,true])for(const term of ['',tag,`${tag} Owner`,'%_ literal',qrCode]){
    await sql().begin(async q=>{
     const sources=await searchSources(q,session),limit=3;
     const args=[...searchArgs(session),term,likePattern(term),history,likePattern(term).slice(1)];
     const expected=await q.unsafe(`${searchInputSql} select * from (${sources.map(s=>sourceSql(s)).join(' union all ')}) results where ($7::boolean or not history) and ($5='' or id=$5 or search_text ilike $6) and ($5<>'' or source_key<>'stub' or status<>'Available') order by case when $5='' then 0 when lower(label)=lower($5) or id=$5 then 0 when label ilike $8 then 1 else 2 end,updated_at desc,source_key,id limit ${limit+1}`,args);
     const actual=await searchRecords(q,session,term,history,limit);
     expect(actual.data).toEqual(expected.slice(0,limit).map(searchItem));expect(actual.hasMore).toBe(expected.length>limit);
    });
   }
  }
 });
 it('finds canonical census, attendance, interest, stubs, and deferred-only visits without legacy/mirror duplicates',async()=>{
  const result=await search(tag);const sources=new Set(result.data.map((r:any)=>r.sourceKey));
  for(const source of ['owner','pet','respondent','census','program','campaign','interest','attendance','stub-batch','stub','standalone','account'])expect(sources.has(source),source).toBe(true);
  expect(result.data.some((r:any)=>r.sourceKey.startsWith('legacy-'))).toBe(false);
  expect(result.data.some((r:any)=>r.id===`QRATT-${tag}`)).toBe(false);
  expect(result.data.some((r:any)=>r.id===voidVisit||r.id===archivedId)).toBe(false);
  expect(new Set(result.data.map((r:any)=>r.key)).size).toBe(result.data.length);
  expect((await search(respondentId)).data).toContainEqual(expect.objectContaining({id:respondentId,sourceKey:'respondent'}));
  expect(yes(await preview('standalone',standaloneId)).groups[1].records[0]).toMatchObject({age_months:0,sex:null,procedures:[{process:'Microchipping',outcome:'Deferred'}]});
 });
 it('only includes legacy, archived, and voided entries after the explicit history option',async()=>{
  const result=await search(tag,admin,true);
  for(const source of ['legacy-respondent','legacy-participant','legacy-service','legacy-stub','legacy-household','legacy-animal'])expect(result.data.some((r:any)=>r.sourceKey===source&&r.history)).toBe(true);
  expect((await search(`${tag} Archived`,admin,true)).data).toContainEqual(expect.objectContaining({id:archivedId,history:true}));
  expect((await search(voidVisit,admin,true)).data).toContainEqual(expect.objectContaining({id:voidVisit,history:true,status:'Voided'}));
  expect(yes(await preview('legacy-household',`${tag}-legacy-households`)).workspace).toBeNull();
 });
 it('keeps previews scoped by current assignment, owner residence, batch recipient, and program eligibility',async()=>{
  const own=await search(tag,field);expect(own.data.some((r:any)=>r.id===ownerId)).toBe(true);expect(own.data.some((r:any)=>r.id===remoteId)).toBe(false);
  for(const source of ['program','campaign','interest','attendance','stub-batch','stub'])expect(own.data.some((r:any)=>r.sourceKey===source),source).toBe(true);
  expect(own.data.some((r:any)=>['standalone','account','respondent'].includes(r.sourceKey))).toBe(false);
  expect((await preview('owner',remoteId,field)).status).toBe(404);expect((await preview('attendance',otherAttendance,field)).status).toBe(404);
  expect((await preview('stub-batch',otherBatchId,field)).status).toBe(404);
  expect((await preview('program',`${tag}-program`,outside)).status).toBe(404);
  expect((await preview('program',`${tag}-program`,invited)).status).toBe(200);
  expect((await preview('census',submissionId,invited)).status).toBe(404);expect((await preview('census',submissionId,field)).status).toBe(200);
  await sql()`delete from ekapon.program_interest_allowed_barangays where campaign_id=${campaign} and barangay_id=${remote.id}`;
  expect((await preview('program',`${tag}-program`,invited)).status).toBe(404);
  await sql()`insert into ekapon.program_interest_allowed_barangays(campaign_id,barangay_id,added_by) values(${campaign},${remote.id},${actors[0]})`;
 });
 it('rechecks disabled features on searches, recent updates, and old preview URLs',async()=>{
  const [prior]=await sql()`select enabled from ekapon.role_feature_access where account_type='Admin' and feature_key='operations'`;
  try{
   await sql()`insert into ekapon.role_feature_access(account_type,feature_key,enabled) values('Admin','operations',false) on conflict(account_type,feature_key) do update set enabled=false`;
   const found=await search(tag);expect(found.data.every((r:any)=>!['program','campaign','interest','attendance','stub-batch','stub','standalone','respondent'].includes(r.sourceKey))).toBe(true);
   expect((await preview('attendance',attendanceId)).status).toBe(404);
   const recent=yes(await get('/recently-added?includeHistory=true'));expect(recent.data.every((r:any)=>!['program','campaign','interest','attendance','stub-batch','stub','standalone'].includes(r.sourceKey))).toBe(true);
   expect((await preview('attendance',attendanceId,superAdmin)).status).toBe(200);
  }finally{if(prior)await sql()`update ekapon.role_feature_access set enabled=${prior.enabled} where account_type='Admin' and feature_key='operations'`;else await sql()`delete from ekapon.role_feature_access where account_type='Admin' and feature_key='operations'`;}
 });
 it('keeps QR tokens and private image/credential fields out of matching, summaries, and previews',async()=>{
  expect((await search(qrCode)).data).toHaveLength(0);expect((await search('PRIVATE-IMAGE-CANARY')).data).toHaveLength(0);
  const summaries=JSON.stringify(await search(tag));expect(summaries).not.toMatch(/PRIVATE-|CVS1\.|owner_snapshot|pets_snapshot|record_data|search_text/);expect(summaries.length).toBeLessThan(24000);
  expect(JSON.stringify(yes(await preview('owner',ownerId)))).not.toMatch(/PRIVATE-IMAGE|PRIVATE-TOKEN/);
  expect(JSON.stringify(yes(await preview('stub',ticketId)))).not.toContain(qrCode);
 });
 it('resolves specific records independent of list pagination and retains exact workspace destinations',async()=>{
  for(const [source,id,expected] of [['owner',ownerId,'/registry/owners?recordId='],['respondent',respondentId,'/registry/respondents?recordId='],['program',`${tag}-program`,`/program-day?program=${programId}`],['attendance',attendanceId,`/program-day?program=${programId}&tab=attendance`],['campaign',campaign,`/program-interest?campaignId=${campaign}`],['stub-batch',batchId,`/stubs?batchId=${batchId}`],['standalone',standaloneId,`/services?view=standalone&recordId=${standaloneId}`]] as const){const result=yes(await preview(source,id));expect(result.workspace.to).toContain(expected);expect(result.item.id).toBe(String(id));}
 });
 it('bounds results, ranks exact names first, and treats wildcard characters literally',async()=>{
  for(let i=0;i<34;i++)await record('owners',`${tag}-more-${i}`,{name:`${tag} Many ${i}`,barangay:area.name});
  const many=await search(`${tag} Many`);expect(many.data).toHaveLength(30);expect(many.hasMore).toBe(true);
  const exact=await search(`${tag} Many 1`);expect(exact.data[0].label).toBe(`${tag} Many 1`);
  const literal=`${tag} %_ literal`;await record('owners',`${tag}-literal`,{name:literal,barangay:area.name});
  expect((await search(literal)).data).toHaveLength(1);
 });
 it('uses the same canonical sources for recent updates, including a visit with no completed procedure',async()=>{
  await sql()`update ekapon.standalone_services set created_at=now()+interval '1 minute' where id=${standaloneId}::uuid`;
  const recent=yes(await get('/recently-added'));expect(recent.data).toHaveLength(10);expect(recent.data[0]).toMatchObject({sourceKey:'standalone',id:standaloneId,history:false});expect(recent.data.every((r:any)=>!r.history)).toBe(true);
  expect(recent.data.every((r:any)=>r.to.startsWith('/records/view?'))).toBe(true);
 });
 it('does not offer a source link that would resurrect or open an archived program as active',async()=>{
  await sql()`update ekapon.dashboard_records set archived=true where id=${programId}`;
  expect((await search(`${tag} Program`)).data.some((r:any)=>r.sourceKey==='program')).toBe(false);
  expect(yes(await preview('program',`${tag}-program`)).workspace).toBeNull();
  expect(yes(await preview('attendance',attendanceId)).workspace).toBeNull();
 });
});
