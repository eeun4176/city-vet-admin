import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {startServer,client,type Resp} from './harness';
import {sql,tx,closeDb} from '../server/db';
import {sessionCookie} from '../server/auth';
import {readSummary} from '../server/summaryCache';
const tag=`Nav${randomUUID().slice(0,8)}`;
let call:ReturnType<typeof client>,close:()=>Promise<void>,staff:string,writer:string,field:string,remoteField:string,supervisor:string;
let area:any,remote:any,third:any,campaign:number,programId:number,recordId:string;
const actors:number[]=[],submissions:string[]=[],records:string[]=[];
const good=(r:Resp)=>{expect([200,201],JSON.stringify(r.json)).toContain(r.status);return r.json;};
const badges=async(cookie=staff)=>good(await call('GET','/api/v1/navigation-badges',{cookie})).badges;
async function read(node:string,path:string,cookie=staff){const r=await call('GET',`/api/v1${path}`,{cookie,headers:{'X-Nav-Node':node}});good(r);return r.headers.get('X-Nav-Receipt')!;}
const seen=(node:string,token:string,cookie=staff)=>call('POST','/api/v1/navigation-badges',{cookie,json:{node,token}});
const clear=async(node='owners',cookie=staff)=>seen(node,await read(node,`/records/${node}`,cookie),cookie);
async function owner(suffix:string,barangay=area,actor=actors[1]){const id=`${tag}-${suffix}`;records.push(id);await tx(actor,q=>q`insert into ekapon.dashboard_records(dataset,record_id,record_data) values('owners',${id},${q.json({id,name:`${tag} ${suffix}`,barangay:barangay.name,address:'Synthetic address'})})`);return id;}
async function change(id:string,actor=actors[1]){await tx(actor,q=>q`update ekapon.dashboard_records set record_data=record_data||jsonb_build_object('address',${randomUUID()}::text) where dataset='owners' and record_id=${id}`);}
beforeAll(async()=>{
 const server=await startServer();call=client(server.base);close=server.close;
 [area,remote,third]=await sql()`select id,name from ekapon.barangays order by id limit 3`;
 for(const [role,brg] of [['Admin',null],['Admin',null],['Paravet',area.id],['Paravet',remote.id],['SuperAdmin',null]] as const){
  const [a]=await sql()`insert into ekapon.accounts(username,account_type,first_name,last_name,barangay_id) values(${role==='Paravet'?null:`${tag}${actors.length}`},${role},${tag},${role},${brg}) returning id`;
  actors.push(a.id);const cookie=(await sessionCookie({id:a.id,type:role},'full')).split(';')[0];[staff,writer,field,remoteField,supervisor]=[staff,writer,field,remoteField,supervisor].map((v,i)=>i===actors.length-1?cookie:v);
 }
 recordId=await owner('First');
});
afterAll(async()=>{
 await sql()`delete from ekapon.census_submissions where id=any(${submissions}::uuid[])`;
 if(campaign){await sql()`delete from ekapon.stub_batches where campaign_id=${campaign}`;await sql()`delete from ekapon.program_interest_campaigns where id=${campaign}`;}
 await sql()`delete from ekapon.permission_requests where requester_id=any(${actors}::bigint[])`;
 await sql()`delete from ekapon.issue_reports where reporter_id=any(${actors}::bigint[])`;
 await sql()`delete from ekapon.data_quality_reviews where updated_by=any(${actors}::bigint[])`;
 await sql()`delete from ekapon.dashboard_records where record_id=any(${records}::text[])`;
 await sql()`delete from ekapon.navigation_changes where actor_id=any(${actors}::bigint[])`;
 await sql()`delete from ekapon.accounts where id=any(${actors}::bigint[])`;await close();await closeDb();
});
describe('scoped sidebar badges',()=>{
 it('requires a current staff session and returns compact counts without record payloads',async()=>{
  expect((await call('GET','/api/v1/navigation-badges')).status).toBe(401);
  const result=await badges();expect(result.owners.updated).toBe(true);expect(result).not.toHaveProperty('access');
  const scoped=await badges(field);expect(scoped).not.toHaveProperty('accounts');expect(scoped).not.toHaveProperty('census-pending');
  expect(JSON.stringify(result)).not.toContain('Synthetic address');expect(JSON.stringify(result)).not.toContain(recordId);
  expect(JSON.stringify(result).length).toBeLessThan(5000);
 });
 it('clears seen dots per account, persists them across reads, and excludes the reader’s own edits',async()=>{
  good(await clear());expect((await badges()).owners.updated).toBe(false);
  good(await clear('owners',writer));
  expect((await badges(writer)).owners.updated).toBe(false);
  await change(recordId,actors[0]);expect((await badges()).owners.updated).toBe(false);
  expect((await badges(writer)).owners.updated).toBe(true);
  await change(recordId);expect((await badges()).owners.updated).toBe(true);
  good(await clear());expect((await badges()).owners.updated).toBe(false);
 });
 it('limits barangay markers and invalidates old receipts when assignment or feature access changes',async()=>{
  good(await clear('owners',field));await owner('Elsewhere',remote);
  expect((await badges(field)).owners.updated).toBe(false);
  expect((await badges(remoteField)).owners.updated).toBe(true);
  const token=await read('owners','/records/owners',field);
  await sql()`update ekapon.accounts set barangay_id=${third.id} where id=${actors[2]}`;
  expect((await seen('owners',token,field)).status).toBe(409);
  await sql()`update ekapon.accounts set barangay_id=${area.id} where id=${actors[2]}`;
  const [old]=await sql()`select enabled from ekapon.role_feature_access where account_type='Paravet' and feature_key='registry'`;
  await sql()`insert into ekapon.role_feature_access(account_type,feature_key,enabled) values('Paravet','registry',false) on conflict(account_type,feature_key) do update set enabled=false`;
  try{expect(await badges(field)).not.toHaveProperty('owners');expect((await seen('owners',token,field)).status).toBe(403);}
  finally{if(old)await sql()`update ekapon.role_feature_access set enabled=${old.enabled} where account_type='Paravet' and feature_key='registry'`;else await sql()`delete from ekapon.role_feature_access where account_type='Paravet' and feature_key='registry'`;}
 });
 it('issues acknowledgement receipts only for successful relevant data reads and binds them to the account and section',async()=>{
  const wrong=await call('GET','/api/v1/health',{cookie:staff,headers:{'X-Nav-Node':'owners'}});expect(wrong.headers.get('X-Nav-Receipt')).toBeNull();
  const mismatched=await call('GET','/api/v1/records/pets',{cookie:staff,headers:{'X-Nav-Node':'owners'}});expect(mismatched.headers.get('X-Nav-Receipt')).toBeNull();
  const failed=await call('GET',`/api/v1/registry-workspace?kind=owners&id=${tag}-missing`,{cookie:staff,headers:{'X-Nav-Node':'owners'}});expect(failed.status).toBe(404);expect(failed.headers.get('X-Nav-Receipt')).toBeNull();
  const token=await read('owners','/records/owners');
  expect((await seen('owners',token,writer)).status).toBe(409);expect((await seen('pets',token)).status).toBe(409);expect((await seen('owners','forged')).status).toBe(409);
 });
 it('keeps changes arriving after a successful read and prevents an older acknowledgement replacing a newer one',async()=>{
  const old=await read('owners','/records/owners');await change(recordId);good(await seen('owners',old));
  expect((await badges()).owners.updated).toBe(true);
  good(await clear());expect((await badges()).owners.updated).toBe(false);
  good(await seen('owners',old));expect((await badges()).owners.updated).toBe(false);
 });
 it('keeps a pending census count after the update dot is cleared, then removes it when reviewed',async()=>{
  const baseline=(await badges())['census-pending'].pending;
  const created=good(await call('POST','/api/v1/census/submissions',{cookie:field,json:{label:tag,censusDate:'2026-10-18',source:'form',owners:[{ownerName:tag,address:'Synthetic census address',pets:[{petName:'Bantay',species:'Dog',sex:'Male'}]}]}}));
  const id=created.submission.id;submissions.push(id);
  expect((await badges())['census-pending']).toMatchObject({pending:baseline+1,updated:true});
  const receipt=await read('census-pending','/census/submissions?status=pending');good(await seen('census-pending',receipt));
  expect((await badges())['census-pending']).toMatchObject({pending:baseline+1,updated:false});
  good(await call('POST',`/api/v1/census/submissions/${id}/review`,{cookie:staff,json:{decision:'reject',note:'Synthetic review is complete'}}));
  expect((await badges())['census-pending'].pending).toBe(baseline);
  expect((await badges(field))['census-mine'].updated).toBe(true);
 });
 it('counts actual program, stub, access and issue work and honors current approved program barangays',async()=>{
  const before=await badges(supervisor),baseStaff=await badges();
  const record=`${tag}-program`;records.push(record);
  await tx(actors[1],async(q)=>{
   const [d]=await q`insert into ekapon.dashboard_records(dataset,record_id,record_data) values('programs',${record},${q.json({id:record,title:tag,date:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'}),barangay:area.name,status:'Open',processes:['Microchipping']})}) returning id`;programId=d.id;
   const [c]=await q`insert into ekapon.program_interest_campaigns(reference,campaign_type,host_barangay_id,program_record_id,processes,status,created_by) values(${tag},'program_day',${area.id},${programId},array['Microchipping'],'scheduled',${actors[1]}) returning id`;campaign=c.id;
   await q`insert into ekapon.program_interest_allowed_barangays(campaign_id,barangay_id,added_by) values(${campaign},${remote.id},${actors[1]})`;
   await q`insert into ekapon.stub_batches(reference,campaign_id,recipient_id,recipient_name,barangay_id,requested_quantity,requested_by,program_snapshot) values(${tag},${campaign},${actors[2]},'Synthetic staff',${area.id},2,${actors[2]},'{}'::jsonb)`;
  });
  expect((await badges()).stubs.pending).toBe(baseStaff.stubs.pending+1);expect((await badges(field)).stubs.pending).toBe(0);
  expect((await badges(remoteField))['program-day'].updated).toBe(true);
  await tx(actors[1],q=>q`delete from ekapon.program_interest_allowed_barangays where campaign_id=${campaign} and barangay_id=${remote.id}`);
  expect((await badges(remoteField))['program-day'].updated).toBe(false);
  await tx(actors[1],q=>q`update ekapon.dashboard_records set record_data=record_data||'{"status":"Cancelled"}'::jsonb where id=${programId}`);
  expect((await badges()).stubs.pending).toBe(baseStaff.stubs.pending);
  good(await call('POST','/api/v1/access/requests',{cookie:staff,json:{permission:'archive',reason:'Synthetic request for badge testing'}}));
  good(await call('POST','/api/v1/issues',{cookie:staff,json:{title:tag,description:'Synthetic issue for navigation badge verification'}}));
  const after=await badges(supervisor);expect(after.access.pending).toBe(before.access.pending+1);expect(after.issues.pending).toBe(before.issues.pending+1);
 });
 it('does not flush report summary reuse when acknowledging a visit and includes marker state in protected backups',async()=>{
  const token=await read('owners','/records/owners');let loads=0;
  await readSummary(tag,false,async()=>++loads);good(await seen('owners',token));await readSummary(tag,false,async()=>++loads);expect(loads).toBe(1);
  const backup=good(await call('GET','/api/v1/admin/backup',{cookie:supervisor}));expect(backup.data.navigationChanges.length).toBeGreaterThan(0);expect(backup.data.navigationSeen.some((r:any)=>r.account_id===actors[0])).toBe(true);
 });
});
