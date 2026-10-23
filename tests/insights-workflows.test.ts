import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { startServer,client,type Resp } from './harness';
import { sql,closeDb } from '../server/db';
import { sessionCookie } from '../server/auth';
import { invalidateSummaries } from '../server/summaryCache';
import { basketIdentity,basketValues } from '../shared/reportBasket';

const tag=`Insights${randomUUID().slice(0,8)}`,today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'}),year=today.slice(0,4);
let call:ReturnType<typeof client>,close:()=>Promise<void>,admin:string,field:string,other:string;
let adminId:number,fieldId:number,campaignId:number,batchId:number,ticketId:number;
let a:{id:number;name:string},b:{id:number;name:string};
const accounts:number[]=[],records:number[]=[];
const submissions:string[]=[];
let left:number,right:number,remote:number,pet:number,pet2:number;
const ownerId=`${tag}-owner`,otherOwnerId=`${tag}-other`,petId=`${tag}-pet`;
const success=(r:Resp)=>{expect([200,201],JSON.stringify(r.json)).toContain(r.status);return r.json;};
const get=(path:string,cookie=admin)=>call('GET',`/api/v1${path}`,{cookie});
const post=(path:string,json:unknown,cookie=admin)=>call('POST',`/api/v1${path}`,{cookie,json});
async function record(dataset:string,id:string,data:Record<string,unknown>){const [r]=await sql()`insert into ekapon.dashboard_records(dataset,record_id,record_data) values(${dataset},${id},${sql().json({id,...data})}) returning id`;records.push(r.id);return r.id as number;}
beforeAll(async()=>{
  const server=await startServer();call=client(server.base);close=server.close;
  [a,b]=await sql()`select id,name from ekapon.barangays order by id limit 2` as unknown as [typeof a,typeof b];
  const staff=await sql()`insert into ekapon.accounts(username,account_type,first_name,last_name,barangay_id) values(${tag},'Admin',${tag},'Admin',null),(null,'Paravet',${tag},'Field',${a.id}),(null,'Paravet',${tag},'Other',${b.id}) returning id,account_type::text as type,last_name`;
  accounts.push(...staff.map(r=>r.id));adminId=staff[0].id;fieldId=staff[1].id;
  [admin,field,other]=await Promise.all(staff.map(async r=>(await sessionCookie({id:r.id,type:r.type},'full')).split(';')[0]));
  const bulk=await sql()`insert into ekapon.dashboard_records(dataset,record_id,record_data) select 'owners',${tag}::text||'-filler-'||i,jsonb_build_object('id',${tag}::text||'-filler-'||i,'name',${tag}::text||' Filler '||i,'barangay',${a.name}::text,'mobile','09171234567') from generate_series(1,105) i returning id`;records.push(...bulk.map(r=>r.id));
  left=await record('owners',ownerId,{name:`${tag} Same Owner`,barangay:a.name,mobile:'09171234567',address:'Synthetic address',id_image:'PRIVATE-ID-CANARY'});
  right=await record('owners',`${tag}-match`,{name:` ${tag.toLowerCase()}  same owner `,barangay:a.name,mobile:'',address:'Different synthetic address'});
  remote=await record('owners',otherOwnerId,{name:`${tag} Same Owner`,barangay:b.name,mobile:''});
  pet=await record('pets',petId,{petName:`${tag} Milo`,owner_id:ownerId,owner:`${tag} Same Owner`,barangay:a.name,species:'Dog',sex:'Male',age_months:0});
  pet2=await record('pets',`${tag}-pet-match`,{petName:`${tag} Milo`,owner_id:ownerId,barangay:a.name,species:'Dog',sex:'Male'});
  await record('pets',`${tag}-unlinked`,{petName:`${tag} Luna`,barangay:a.name,species:'Cat',sex:'Female',age_months:12});
  await record('owners',`${tag}-sample`,{name:`${tag} Same Owner`,barangay:a.name,_sampleData:true});
  const program=await record('programs',`${tag}-program`,{title:`${tag} Program`,date:today,barangay:a.name,status:'Completed'});
  const [campaign]=await sql()`insert into ekapon.program_interest_campaigns(reference,campaign_type,host_barangay_id,program_record_id,processes,status,created_by) values(${tag},'program_day',${a.id},${program},array['Microchipping','Anti-Rabies Vaccine','Neuter/Spay'],'scheduled',${adminId}) returning id`;campaignId=campaign.id;
  await sql()`insert into ekapon.program_interest_allowed_barangays(campaign_id,barangay_id,added_by) values(${campaignId},${b.id},${adminId})`;
  const snapshot={title:`${tag} Program`,date:today};
  const [batch]=await sql()`insert into ekapon.stub_batches(reference,campaign_id,recipient_id,recipient_name,barangay_id,requested_quantity,approved_quantity,status,program_snapshot,requested_by) values(${tag},${campaignId},${fieldId},'Synthetic Field',${a.id},1,1,'Approved',${sql().json(snapshot)},${adminId}) returning id`;batchId=batch.id;
  const owner={name:`${tag} Same Owner`,mobile:'09171234567',address:'Synthetic',barangayId:a.id};
  const pets=[{name:'Milo',species:'Dog',processes:['Microchipping','Anti-Rabies Vaccine'],outcome:'Completed',processOutcomes:{Microchipping:'Completed','Anti-Rabies Vaccine':'Deferred'}},{name:'Luna',species:'Cat',processes:['Neuter/Spay'],outcome:'Completed'}];
  const [ticket]=await sql()`insert into ekapon.stub_tickets(batch_id,code,status,owner_snapshot,pets_snapshot,owner_barangay_id,issued_at,redeemed_at) values(${batchId},${`CVS1.${randomUUID().replaceAll('-','').slice(0,22)}`},'Redeemed',${sql().json(owner)},${sql().json([pets[1]])},${a.id},now(),now()) returning id`;ticketId=ticket.id;
  for(const [source,animals,status,area,stub] of [['Walk-in',pets,'Submitted',a.id,null],['Stub',[pets[1]],'Submitted',a.id,ticketId],['Walk-in',[pets[1]],'Voided',a.id,null],['Walk-in',[{...pets[1],outcome:'Not eligible'}],'Submitted',b.id,null]] as const){
    await sql()`insert into ekapon.program_attendance(request_id,payload_hash,campaign_id,source,stub_id,owner_snapshot,owner_identity,owner_barangay_id,pets_snapshot,program_snapshot,attended_on,encoded_by,encoded_by_name,status,voided_by,voided_at,void_reason)
      values(${randomUUID()},${'a'.repeat(64)},${campaignId},${source},${stub},${sql().json({...owner,barangayId:area})},${tag},${area},${sql().json(animals)},${sql().json(snapshot)},${today},${adminId},'Synthetic Admin',${status},${status==='Voided'?adminId:null},${status==='Voided'?new Date():null},${status==='Voided'?'Synthetic correction':null})`;
  }
  // A mirrored service record must not inflate canonical program outcomes.
  await record('services',`${tag}-mirror`,{date:today,service:'Neuter/Spay',status:'Completed',barangay:a.name,workflow:'qr-stubs-v1',attendanceId:'synthetic'});
  invalidateSummaries();
});
afterAll(async()=>{
  if(submissions.length){await sql()`delete from ekapon.census_pets where owner_id in(select id from ekapon.census_owners where submission_id=any(${submissions}::uuid[]))`;await sql()`delete from ekapon.census_owners where submission_id=any(${submissions}::uuid[])`;await sql()`delete from ekapon.census_submissions where id=any(${submissions}::uuid[])`;}
  await sql()`delete from ekapon.data_quality_activity where actor_id=any(${accounts})`;
  if(records.length)await sql()`delete from ekapon.data_quality_reviews where left_record_id=any(${records}) or right_record_id=any(${records})`;
  if(campaignId){await sql()`delete from ekapon.program_attendance where campaign_id=${campaignId}`;await sql()`delete from ekapon.stub_tickets where batch_id=${batchId}`;await sql()`delete from ekapon.stub_batches where id=${batchId}`;await sql()`delete from ekapon.program_interest_allowed_barangays where campaign_id=${campaignId}`;await sql()`delete from ekapon.program_interest_campaigns where id=${campaignId}`;}
  if(records.length)await sql()`delete from ekapon.dashboard_records where id=any(${records})`;
  if(accounts.length)await sql()`delete from ekapon.accounts where id=any(${accounts})`;
  invalidateSummaries();if(close)await close();await closeDb();
});

describe('Insights program outcomes',()=>{
  it('counts actual visits and per-process outcomes without mirrored services or voided attendance',async()=>{
    const r=success(await get(`/program-outcomes?year=${year}&barangayId=${a.id}`));
    expect(r.totals).toMatchObject({ownerVisits:2,petVisits:3,completedProcedures:3,stubVisits:1,walkInVisits:1,programsWithAttendance:1});
    expect(r.breakdown.find((p:any)=>p.process==='Anti-Rabies Vaccine')).toMatchObject({requested:1,completed:0,deferred:1});
    expect(r.programs.find((p:any)=>p.recordId===`${tag}-program`)).toMatchObject({ownerVisits:2,petVisits:3,completedProcedures:3});
    expect((await get(`/program-outcomes?year=${year}`,field)).status).toBe(403);
    const outside=success(await get(`/program-outcomes?year=${year}&barangayId=${b.id}`));expect(outside.totals.ownerVisits).toBe(1);expect(outside.totals.completedProcedures).toBe(0);
  });
});
describe('Data Quality human review',()=>{
  it('checks beyond the first 100 records, normalizes spacing/case, and scopes Paravets',async()=>{
    const r=success(await get(`/data-quality?q=${tag}`,field));
    expect(r.counts.checkedRecords).toBe(110);expect(r.total).toBe(1);expect(r.rows[0]).toMatchObject({id:left,otherId:right,status:'Needs review'});
    expect(success(await get(`/data-quality?q=${tag}`,other)).total).toBe(0);
    expect((await get(`/data-quality?mode=pair&left=${left}&right=${remote}`,field)).status).toBe(404);
    const details=success(await get(`/data-quality?mode=pair&left=${left}&right=${right}`,field));
    expect(details.records[0].linkedPets).toHaveLength(2);expect(JSON.stringify(details)).not.toContain('PRIVATE-ID-CANARY');
    const ages=success(await get(`/data-quality?issue=missing-age&q=${tag}`,field));expect(ages.rows.map((p:any)=>p.id)).toContain(pet2);expect(ages.rows.map((p:any)=>p.id)).not.toContain(pet);
    expect(success(await get(`/data-quality?issue=duplicate-pets&q=${tag}`,field)).total).toBe(1);
  });
  it('lets a Paravet flag, requires Admin decisions and reasons, retains history, and rejects stale edits',async()=>{
    const detail=()=>get(`/data-quality?mode=pair&left=${left}&right=${right}`,field);
    const initial=success(await detail()),base={...initial.pair,reason:'Synthetic paper records need checking'};
    expect((await post('/data-quality',{...base,action:'review',status:'Distinct records'},field)).status).toBe(403);
    success(await post('/data-quality',{...base,action:'flag'},field));
    expect((await post('/data-quality',{...base,action:'review',status:'Distinct records'})).status).toBe(409);
    const current=success(await detail());
    expect((await post('/data-quality',{...current.pair,action:'review',status:'Distinct records',reason:' '})).status).toBe(400);
    success(await post('/data-quality',{...current.pair,action:'review',status:'Distinct records',reason:'Verified different addresses against synthetic paper records'}));
    const reviewed=success(await detail());expect(reviewed.pair.status).toBe('Distinct records');expect(reviewed.history).toHaveLength(2);
    expect(success(await get(`/data-quality?q=${tag}`,field)).total).toBe(0);
    await sql()`update ekapon.dashboard_records set record_data=record_data||' {"address":"Synthetic changed address"}'::jsonb where id=${left}`;
    expect((await post('/data-quality',{...reviewed.pair,action:'review',status:'Duplicate confirmed',reason:'Stale synthetic comparison'})).status).toBe(409);
    expect(success(await detail()).pair.status).toBe('Needs review');
    expect(success(await get(`/data-quality?q=${tag}`,field)).total).toBe(1);
    const withPets=success(await detail());
    await sql()`update ekapon.dashboard_records set record_data=record_data||'{"age_months":1}'::jsonb where id=${pet}`;
    expect((await post('/data-quality',{...withPets.pair,action:'review',status:'Duplicate confirmed',reason:'Stale linked-pet comparison'})).status).toBe(409);
  });
  it('honors current feature switches',async()=>{
    const [previous]=await sql()`select enabled from ekapon.role_feature_access where account_type='Paravet' and feature_key='data-quality'`;
    try{await sql()`insert into ekapon.role_feature_access(account_type,feature_key,enabled) values('Paravet','data-quality',false) on conflict(account_type,feature_key) do update set enabled=false`;expect((await get('/data-quality',field)).status).toBe(403);}
    finally{if(previous)await sql()`update ekapon.role_feature_access set enabled=${previous.enabled} where account_type='Paravet' and feature_key='data-quality'`;else await sql()`delete from ekapon.role_feature_access where account_type='Paravet' and feature_key='data-quality'`;}
  });
});
describe('Report basket preview',()=>{
  it('uses account visibility rules and keeps census selections private to their submitting Paravet',async()=>{
    const accountItems={items:[{key:'account',source:'Accounts',id:String(fieldId)},{key:'admin',source:'Accounts',id:String(adminId)}]};
    const adminPreview=success(await post('/report-basket-preview',accountItems));
    expect(adminPreview.items).toHaveLength(1);expect(adminPreview.unavailable).toEqual(['admin']);expect(adminPreview.items[0].values).not.toHaveProperty('accountKey');
    expect(success(await post('/report-basket-preview',accountItems,field)).items).toEqual([]);
    const created=success(await post('/census/submissions',{label:`${tag} Census`,censusDate:today,source:'form',owners:[{ownerName:'Synthetic census owner',address:'Synthetic address',pets:[{petName:'Synthetic pet',species:'Dog',sex:'Male'}]}]},field));
    const id=created.submission.id;submissions.push(id);
    const selection={items:[{key:'census',source:'Census submissions',id}]};
    expect(success(await post('/report-basket-preview',selection,field)).items[0].values).toMatchObject({ownerCount:1,petCount:1});
    expect(success(await post('/report-basket-preview',selection,other)).unavailable).toEqual(['census']);
  });
  it('checks current registry feature access for quality comparisons and basket values',async()=>{
    const [previous]=await sql()`select enabled from ekapon.role_feature_access where account_type='Paravet' and feature_key='registry'`;
    try{
      await sql()`insert into ekapon.role_feature_access(account_type,feature_key,enabled) values('Paravet','registry',false) on conflict(account_type,feature_key) do update set enabled=false`;
      expect((await get('/data-quality',field)).status).toBe(403);
      expect(success(await post('/report-basket-preview',{items:[{key:'owner',source:'Owners',id:ownerId}]},field)).items).toEqual([]);
    }finally{if(previous)await sql()`update ekapon.role_feature_access set enabled=${previous.enabled} where account_type='Paravet' and feature_key='registry'`;else await sql()`delete from ekapon.role_feature_access where account_type='Paravet' and feature_key='registry'`;}
  });
  it('fetches current values, rejects inaccessible and archived records, and strips private fields',async()=>{
    const preview=(id=ownerId)=>post('/report-basket-preview',{items:[{key:'owner',source:'Owners',id}]},field);
    let r=success(await preview());expect(r.items[0].values.address).toBe('Synthetic changed address');expect(r.items[0].values).not.toHaveProperty('id_image');expect(r.items[0].values).not.toHaveProperty('id');
    expect(success(await preview(otherOwnerId)).unavailable).toEqual(['owner']);
    await sql()`update ekapon.dashboard_records set archived=true where id=${left}`;
    expect(success(await preview()).items).toEqual([]);
    await sql()`update ekapon.dashboard_records set archived=false where id=${left}`;
    expect((await call('POST','/api/v1/report-basket-preview',{json:{items:[]}})).status).toBe(401);
  });
  it('uses stable dataset identities and excludes account keys and credentials',()=>{
    expect(basketIdentity('Owners','1',{})).toBe(basketIdentity('Analytics evidence','1',{dataset:'Owners'}));
    expect(basketIdentity('Owners','1',{})).not.toBe(basketIdentity('Pets','1',{}));
    expect(basketValues({name:'Synthetic',owner_id:'secret',accountKey:'secret',username:'secret',password_hash:'secret',image:'secret',mobile:'09171234567'})).toEqual({name:'Synthetic',mobile:'09171234567'});
  });
});
