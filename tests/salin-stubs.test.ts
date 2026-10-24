import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { startServer,client,type Resp } from './harness';
import { sql,closeDb } from '../server/db';
import { sessionCookie } from '../server/auth';

const tag=`SalinStub${randomUUID().slice(0,8)}`;
let call:ReturnType<typeof client>,close:()=>Promise<void>,area:{id:number;name:string},remote:{id:number;name:string};
let admin:string,p1:string,p3:string,campaignId:number,batchId:number;
const accounts:number[]=[],programs:number[]=[];
const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});
const good=(r:Resp)=>{expect([200,201],JSON.stringify(r.json)).toContain(r.status);return r.json;};
const post=(path:string,json:unknown,cookie=admin)=>call('POST',`/api/v1${path}`,{json,cookie});
const get=(path:string,cookie=admin)=>call('GET',`/api/v1${path}`,{cookie});
const pet=(name:string)=>({name,species:'Dog',processes:['Neuter/Spay','Anti-Rabies Vaccine']});
const tickets=()=>sql()`select t.id,t.status,t.owner_snapshot,t.pets_snapshot,t.details_updated_at,t.interest_person_id from ekapon.stub_tickets t where t.batch_id=${batchId} order by t.id`;
beforeAll(async()=>{
 const server=await startServer();call=client(server.base);close=server.close;
 [area,remote]=await sql()`select id,name from ekapon.barangays order by id desc limit 2` as unknown as [typeof area,typeof remote];
 const rows=await sql()`insert into ekapon.accounts(username,account_type,first_name,last_name,barangay_id) values(${tag},'Admin',${tag},'Admin',null),(null,'Paravet',${tag},'First',${area.id}),(null,'Paravet',${tag},'Remote',${remote.id}) returning id,account_type::text as type`;
 accounts.push(...rows.map(r=>r.id));
 [admin,p1,p3]=await Promise.all(rows.map(async r=>(await sessionCookie({id:r.id,type:r.type},'full')).split(';')[0]));
 const created=good(await post('/program-workspace',{action:'create',schedule:{title:`${tag} Program`,date:today,location:'Covered court',hostBarangayId:area.id,startTime:'08:00',endTime:'12:00',slots:100,processes:['Neuter/Spay','Anti-Rabies Vaccine','Microchipping'],status:'Open'}}));
 programs.push(created.programId);campaignId=created.campaignId;
});
afterAll(async()=>{
 await sql()`delete from ekapon.stub_activity where campaign_id=${campaignId}`;
 await sql()`delete from ekapon.stub_tickets where batch_id in(select id from ekapon.stub_batches where campaign_id=${campaignId})`;
 await sql()`delete from ekapon.stub_batches where campaign_id=${campaignId}`;
 await sql()`delete from ekapon.program_interest_activity where campaign_id=${campaignId}`;
 await sql()`delete from ekapon.program_interest_people where campaign_id=${campaignId}`;
 await sql()`delete from ekapon.program_interest_allowed_barangays where campaign_id=${campaignId}`;
 await sql()`delete from ekapon.program_interest_campaigns where id=${campaignId}`;
 await sql()`delete from ekapon.program_workspace_activity where program_record_id=any(${programs}::bigint[])`;
 await sql()`delete from ekapon.program_runtime where program_record_id=any(${programs}::bigint[])`;
 await sql()`delete from ekapon.dashboard_records where id=any(${programs}::bigint[])`;
 await sql()`delete from ekapon.notifications where recipient_id=any(${accounts}::bigint[])`;
 await sql()`delete from ekapon.accounts where id=any(${accounts}::bigint[])`;
 if(close)await close();await closeDb();
});

describe('stubs for Salin: named from the request, following edits, sent to the barangay',()=>{
 let many:number,one:number;
 it('issues named stubs from the barangay’s interested owners, three pets a stub',async()=>{
  many=good(await post('/program-interest',{action:'add-interest',campaignId,ownerName:`${tag} Many`,residenceBarangayId:area.id,pets:[pet('A'),pet('B'),pet('C'),pet('D')]},p1)).personId;
  one=good(await post('/program-interest',{action:'add-interest',campaignId,ownerName:`${tag} One`,residenceBarangayId:area.id,pets:[pet('Solo')]},p1)).personId;
  good(await post('/program-interest',{action:'add-interest',campaignId,ownerName:`${tag} No pets`,residenceBarangayId:area.id,pets:[]},p1));
  batchId=good(await post('/stub-workflow',{action:'generate-batches',campaignId,barangayIds:[area.id],quantity:3})).batchIds[0];
  expect((await post('/stub-workflow',{action:'issue-from-interest',batchId},p1)).status).toBe(403);
  expect(good(await post('/stub-workflow',{action:'issue-from-interest',batchId}))).toEqual({issued:3,ownersWithoutPets:1,ownersNeedingMoreStubs:0});
  const issued=await tickets();
  expect(issued.map(t=>[t.status,t.interest_person_id,t.pets_snapshot.length])).toEqual([['Issued',many,3],['Issued',many,1],['Issued',one,1]]);
  expect(issued[0].owner_snapshot).toMatchObject({name:`${tag} Many`,barangayId:area.id});
  expect(good(await post('/stub-workflow',{action:'issue-from-interest',batchId}))).toMatchObject({issued:0});
 });

 it('updates issued stubs when the owner is edited, cancels extras and withdrawn owners, and prints services, not pets',async()=>{
  good(await post('/program-interest',{action:'update-interest',campaignId,personId:many,ownerName:`${tag} Renamed`,mobile:'0917-123-4567',residenceBarangayId:area.id,pets:[pet('A'),pet('B')]},p1));
  good(await post('/program-interest',{action:'withdraw-interest',campaignId,personId:one},p1));
  const [first,second,third]=await tickets();
  expect(first).toMatchObject({status:'Issued',owner_snapshot:{name:`${tag} Renamed`,mobile:'09171234567'}});
  expect(first.pets_snapshot.map((p:{name:string})=>p.name)).toEqual(['A','B']);
  expect(first.details_updated_at).not.toBeNull();
  expect([second.status,third.status]).toEqual(['Cancelled','Cancelled']);
  const printed=good(await get(`/stub-workflow?mode=print&batchId=${batchId}`));
  expect(printed.stubs.find((s:{id:number})=>s.id===first.id)).toMatchObject({ownerName:`${tag} Renamed`,ownerConfirmedAt:null});
  expect([...printed.stubs.find((s:{id:number})=>s.id===first.id).services].sort()).toEqual(['Anti-Rabies Vaccine','Neuter/Spay']);
  expect(JSON.stringify(printed)).not.toContain('"pets"');
  expect(printed.program).toMatchObject({startTime:'08:00',endTime:'12:00'});
 });

 it('lets Admin send the batch to its barangay, where the Paravet prints and confirms it',async()=>{
  expect((await post('/stub-workflow',{action:'send-to-barangay',batchId},p1)).status).toBe(403);
  good(await post('/stub-workflow',{action:'send-to-barangay',batchId}));
  const listed=good(await get(`/stub-workflow?campaignId=${campaignId}`,p1)).batches.find((b:{id:number})=>b.id===batchId);
  expect(listed.sentAt).toEqual(expect.any(String));
  good(await post('/stub-workflow',{action:'confirm-print',batchId},p1));
  expect((await sql()`select status from ekapon.stub_batches where id=${batchId}`)[0].status).toBe('Printed');
 });

 it('records the name the owner wrote on the stub, and keeps it through later request edits',async()=>{
  const [first]=await tickets();
  good(await post('/stub-workflow',{action:'confirm-owner',stubId:first.id,ownerName:`${tag}  Written`},p1));
  good(await post('/stub-workflow',{action:'confirm-owner',stubId:first.id,ownerName:`${tag} Written`},p1));
  expect((await post('/stub-workflow',{action:'confirm-owner',stubId:first.id,ownerName:'Other'},p3)).status).toBe(404);
  good(await post('/program-interest',{action:'update-interest',campaignId,personId:many,ownerName:`${tag} Renamed`,mobile:'0918-123-4567',residenceBarangayId:area.id,pets:[pet('A'),pet('B')]},p1));
  const [after]=await tickets();
  expect(after.owner_snapshot).toMatchObject({name:`${tag} Written`,mobile:'09181234567'});
  const printed=good(await get(`/stub-workflow?mode=print&batchId=${batchId}`,p1));
  expect(printed.stubs.find((s:{id:number})=>s.id===first.id)).toMatchObject({ownerName:`${tag} Written`,ownerConfirmedAt:expect.any(String)});
 });

 it('downloads the program’s stubs for offline scanning, only within the user’s barangay',async()=>{
  const pack=good(await get(`/stub-workflow?mode=day-pack&campaignId=${campaignId}`,p1));
  expect(pack.program.id).toBe(campaignId);
  expect(pack.stubs.map((s:{status:string})=>s.status).sort()).toEqual(['Issued']);
  expect(pack.stubs[0]).toMatchObject({code:expect.stringMatching(/^CVS1\./),owner:{name:`${tag} Written`},barangayId:area.id});
  expect((await get(`/stub-workflow?mode=day-pack&campaignId=${campaignId}`,p3)).status).toBe(404);
 });
});
