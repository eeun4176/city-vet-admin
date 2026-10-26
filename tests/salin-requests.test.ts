import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { startServer,client,type Resp } from './harness';
import { sql,closeDb } from '../server/db';
import { sessionCookie } from '../server/auth';

const tag=`SalinReq${randomUUID().slice(0,8)}`;
let call:ReturnType<typeof client>,close:()=>Promise<void>,area:{id:number;name:string},remote:{id:number;name:string};
let admin:string,p1:string,p2:string,p3:string,target:{id:number;reference:string};
const accounts:number[]=[],campaigns:number[]=[],programs:number[]=[];
const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});
const good=(r:Resp)=>{expect([200,201],JSON.stringify(r.json)).toContain(r.status);return r.json;};
const post=(json:unknown,cookie=admin)=>call('POST','/api/v1/program-interest',{json,cookie});
const detail=(id:number,cookie=admin)=>call('GET',`/api/v1/program-interest?id=${id}`,{cookie}).then(good);
beforeAll(async()=>{
 const server=await startServer();call=client(server.base);close=server.close;
 [area,remote]=await sql()`select id,name from ekapon.barangays order by id limit 2` as unknown as [typeof area,typeof remote];
 const rows=await sql()`insert into ekapon.accounts(username,account_type,first_name,last_name,barangay_id) values(${tag},'Admin',${tag},'Admin',null),(null,'Paravet',${tag},'First',${area.id}),(null,'Paravet',${tag},'Second',${area.id}),(null,'Paravet',${tag},'Remote',${remote.id}) returning id,account_type::text as type`;
 accounts.push(...rows.map(r=>r.id));
 [admin,p1,p2,p3]=await Promise.all(rows.map(async r=>(await sessionCookie({id:r.id,type:r.type},'full')).split(';')[0]));
 // Other tests may leave a request open in these barangays; finish them so this file starts clean.
 await sql()`update ekapon.program_interest_campaigns set status='cancelled',closed_at=now() where campaign_type='program_request' and host_barangay_id in (${area.id},${remote.id}) and status in ('gathering','requested','approved','scheduled','merged')`;
});
afterAll(async()=>{
 await sql()`delete from ekapon.program_interest_activity where campaign_id=any(${campaigns}::bigint[])`;
 await sql()`delete from ekapon.program_interest_people where campaign_id=any(${campaigns}::bigint[])`;
 await sql()`delete from ekapon.program_interest_allowed_barangays where campaign_id=any(${campaigns}::bigint[])`;
 await sql()`update ekapon.program_interest_campaigns set merged_into_id=null where id=any(${campaigns}::bigint[]) and merged_into_id is not null`;
 await sql()`delete from ekapon.program_interest_campaigns where id=any(${campaigns}::bigint[])`;
 await sql()`delete from ekapon.program_workspace_activity where program_record_id=any(${programs}::bigint[])`;
 await sql()`delete from ekapon.program_runtime where program_record_id=any(${programs}::bigint[])`;
 await sql()`delete from ekapon.dashboard_records where id=any(${programs}::bigint[])`;
 await sql()`delete from ekapon.accounts where id=any(${accounts}::bigint[])`;
 if(close)await close();await closeDb();
});

describe('a barangay request shared by its Paravets (from Salin)',()=>{
 it('shows who filed, sent and edited it, refuses stale edits, and takes a resent entry once',async()=>{
  const created=good(await post({action:'create-demand',targetPeople:1,processes:['Microchipping']},p1));campaigns.push(created.campaignId);
  target={id:created.campaignId,reference:created.reference};
  const requestId=randomUUID();
  const entry={action:'add-interest',requestId,campaignId:target.id,ownerName:`${tag} Owner`,residenceBarangayId:area.id,pets:[]};
  const first=good(await post(entry,p2));
  expect(good(await post(entry,p2)).personId).toBe(first.personId);
  expect((await post(entry,p1)).json.error.code).toBe('REQUEST_ID_REUSED');
  const opened=(await detail(target.id,p1)).people[0];
  expect(opened).toMatchObject({id:first.personId,added_by_name:`${tag} Second`});
  const edit={action:'update-interest',campaignId:target.id,personId:first.personId,ownerName:`${tag} Owner`,mobile:'09171234567',residenceBarangayId:area.id,pets:[],expectedUpdatedAt:new Date(opened.updated_at).toISOString()};
  good(await post(edit,p2));
  expect((await post({...edit,mobile:'09181234567'},p1)).json.error.code).toBe('STALE_EDIT');
  expect((await post({action:'withdraw-interest',campaignId:target.id,personId:first.personId,expectedUpdatedAt:edit.expectedUpdatedAt},p1)).json.error.code).toBe('STALE_EDIT');
  good(await post({action:'submit-request',campaignId:target.id},p1));
  const shown=await detail(target.id);
  expect(shown.campaign).toMatchObject({createdByName:`${tag} First`,submittedByName:`${tag} First`,lastEditedBy:`${tag} First`,mergedInto:null});
  expect(shown.people[0]).toMatchObject({added_by_name:`${tag} Second`,updated_by_name:`${tag} Second`,mobile:'09171234567'});
  const again=await post({action:'create-demand',targetPeople:1,processes:['Microchipping']},p2);
  expect(again.json.error).toMatchObject({code:'ACTIVE_DEMAND_EXISTS',details:{campaignId:target.id,status:'requested',filedBy:`${tag} First`}});
 });

 it('lets Admin merge barangay requests into one, and the merged request ends with it',async()=>{
  const other=good(await post({action:'create-demand',targetPeople:1,processes:['Anti-Rabies Vaccine']},p3));campaigns.push(other.campaignId);
  good(await post({action:'add-interest',campaignId:other.campaignId,ownerName:`${tag} Remote owner`,residenceBarangayId:remote.id,pets:[]},p3));
  good(await post({action:'submit-request',campaignId:other.campaignId},p3));
  const merge={action:'merge-requests',targetId:target.id,expectedRevision:1,sources:[{id:other.campaignId,expectedRevision:1}]};
  expect((await post(merge,p1)).status).toBe(403);
  good(await post(merge));
  const merged=await detail(target.id);
  expect(merged.campaign.processes.sort()).toEqual(['Anti-Rabies Vaccine','Microchipping']);
  expect(merged.campaign).toMatchObject({requestedTargetPeople:2,ownerCount:2});
  expect(merged.campaign.allowedBarangays.map((b:{id:number})=>b.id)).toContain(remote.id);
  const remoteList=good(await call('GET','/api/v1/program-interest',{cookie:p3})).campaigns;
  expect(remoteList.find((c:{id:number})=>c.id===other.campaignId)).toMatchObject({status:'merged',mergedInto:{reference:target.reference,hostBarangay:area.name}});
  expect(remoteList.some((c:{id:number})=>c.id===target.id)).toBe(true);
  expect((await post({action:'create-demand',targetPeople:1,processes:['Microchipping']},p3)).json.error).toMatchObject({code:'ACTIVE_DEMAND_EXISTS',details:{status:'merged'}});
  expect((await post({...merge,expectedRevision:2,sources:[{id:other.campaignId,expectedRevision:2}]})).json.error.code).toBe('REQUEST_NOT_MERGEABLE');
  good(await post({action:'review-request',campaignId:target.id,decision:'reject',note:'Merged program postponed'}));
  expect((await detail(other.campaignId)).campaign.status).toBe('rejected');
  const fresh=good(await post({action:'create-demand',targetPeople:1,processes:['Microchipping']},p3));campaigns.push(fresh.campaignId);
 });

 it('keeps Paravets of a participating barangay from changing another barangay’s owners',async()=>{
  const created=good(await call('POST','/api/v1/program-workspace',{cookie:admin,json:{action:'create',schedule:{title:`${tag} Program`,date:today,location:'Covered court',hostBarangayId:area.id,startTime:'08:00',endTime:'12:00',slots:100,processes:['Microchipping'],status:'Open'}}}));
  programs.push(created.programId);campaigns.push(created.campaignId);
  good(await post({action:'update-program-access',campaignId:created.campaignId,allowedBarangayIds:[remote.id]}));
  const host=good(await post({action:'add-interest',campaignId:created.campaignId,ownerName:`${tag} Host owner`,residenceBarangayId:area.id,pets:[]},p1));
  const moved=await post({action:'update-interest',campaignId:created.campaignId,personId:host.personId,ownerName:`${tag} Taken`,residenceBarangayId:remote.id,pets:[]},p3);
  expect(moved.status).toBe(404);
  expect((await detail(created.campaignId)).people.find((p:{id:number})=>p.id===host.personId)).toMatchObject({owner_name:`${tag} Host owner`,residence_barangay_id:area.id});
 });
 it('lets a barangay start its next request once its program is Completed, not while the program runs',async()=>{
  const request=good(await post({action:'create-demand',targetPeople:1,processes:['Microchipping']},p1));campaigns.push(request.campaignId);
  const [record]=await sql()`insert into ekapon.dashboard_records(dataset,record_id,record_data) values('programs',${`${tag}-done`},${sql().json({id:`${tag}-done`,title:`${tag} Done`,date:today,status:'In progress',location:'Covered court'})}) returning id`;programs.push(record.id);
  await sql()`update ekapon.program_interest_campaigns set status='scheduled',program_record_id=${record.id} where id=${request.campaignId}`;
  expect((await post({action:'create-demand',targetPeople:1,processes:['Microchipping']},p2)).json.error.code).toBe('ACTIVE_DEMAND_EXISTS');
  await sql()`update ekapon.dashboard_records set record_data=record_data||${sql().json({status:'Completed'})} where id=${record.id}`;
  expect((await detail(request.campaignId)).campaign.programStatus).toBe('Completed');
  const next=good(await post({action:'create-demand',targetPeople:1,processes:['Microchipping']},p2));campaigns.push(next.campaignId);
  expect((await detail(request.campaignId)).campaign.status).toBe('closed');
 });
});
