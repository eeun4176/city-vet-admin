import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { startServer,client,type Resp } from './harness';
import { sql,closeDb } from '../server/db';
import { sessionCookie } from '../server/auth';
import { parsePetDetails } from '../shared/datasetImport';

const tag=`Redesign${randomUUID().slice(0,8)}`;
let call:ReturnType<typeof client>,close:()=>Promise<void>,area:{id:number;name:string},remote:{id:number;name:string};
let admin:string,superAdmin:string,p1:string,p2:string,p3:string,adminId:number,p2Id:number;
const accounts:number[]=[],campaigns:number[]=[],programs:number[]=[],recordIds:string[]=[],batches:string[]=[];
const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});
const good=(r:Resp)=>{expect([200,201],JSON.stringify(r.json)).toContain(r.status);return r.json;};
const post=(path:string,json:unknown,cookie=admin)=>call('POST',`/api/v1${path}`,{json,cookie});
const ownerId=`${tag}-owner`,remoteId=`${tag}-remote`;
beforeAll(async()=>{
 const server=await startServer();call=client(server.base);close=server.close;
 [area,remote]=await sql()`select id,name from ekapon.barangays order by id limit 2` as unknown as [typeof area,typeof remote];
 const rows=await sql()`insert into ekapon.accounts(username,account_type,first_name,last_name,barangay_id) values(${tag},'Admin',${tag},'Admin',null),(${tag+'super'},'SuperAdmin',${tag},'Super',null),(null,'Paravet',${tag},'First',${area.id}),(null,'Paravet',${tag},'Second',${area.id}),(null,'Paravet',${tag},'Remote',${remote.id}) returning id,account_type::text as type`;
 accounts.push(...rows.map(r=>r.id));adminId=rows[0].id;p2Id=rows[3].id;
 [admin,superAdmin,p1,p2,p3]=await Promise.all(rows.map(async r=>(await sessionCookie({id:r.id,type:r.type},'full')).split(';')[0]));
 for(const [id,b] of [[ownerId,area],[remoteId,remote]] as const){recordIds.push(id);await sql()`insert into ekapon.dashboard_records(dataset,record_id,record_data) values('owners',${id},${sql().json({id,name:`${tag} Shared name`,address:id,barangay:b.name,contact:'09171234567'})})`;}
});
afterAll(async()=>{
 await sql()`delete from ekapon.registry_intake_links where actor_id=any(${accounts}::bigint[])`;
 await sql()`delete from ekapon.registry_activity where actor_id=any(${accounts}::bigint[])`;
 await sql()`delete from ekapon.registry_requests where actor_id=any(${accounts}::bigint[])`;
 await sql()`delete from ekapon.report_drafts where account_id=any(${accounts}::bigint[])`;
 await sql()`delete from ekapon.stub_activity where campaign_id=any(${campaigns}::bigint[])`;
 await sql()`delete from ekapon.program_attendance where campaign_id=any(${campaigns}::bigint[])`;
 await sql()`delete from ekapon.stub_tickets where batch_id in(select id from ekapon.stub_batches where campaign_id=any(${campaigns}::bigint[]))`;
 await sql()`delete from ekapon.stub_batches where campaign_id=any(${campaigns}::bigint[])`;
 await sql()`delete from ekapon.program_interest_activity where campaign_id=any(${campaigns}::bigint[])`;
 await sql()`delete from ekapon.program_interest_people where campaign_id=any(${campaigns}::bigint[])`;
 await sql()`delete from ekapon.program_interest_allowed_barangays where campaign_id=any(${campaigns}::bigint[])`;
 await sql()`delete from ekapon.program_interest_campaigns where id=any(${campaigns}::bigint[])`;
 await sql()`delete from ekapon.program_workspace_activity where program_record_id=any(${programs}::bigint[])`;
 await sql()`delete from ekapon.program_runtime where program_record_id=any(${programs}::bigint[])`;
 await sql()`delete from ekapon.dashboard_import_items where batch_id=any(${batches}::uuid[]) or batch_id in(select linked_batch_id from ekapon.dashboard_import_batches where batch_id=any(${batches}::uuid[]))`;
 await sql()`delete from ekapon.dashboard_import_batches where batch_id=any(${batches}::uuid[]) or actor_id=any(${accounts}::bigint[])`;
 await sql()`delete from ekapon.dashboard_records where id=any(${programs}::bigint[]) or record_id=any(${recordIds}::text[]) or record_id like ${tag+'%'}`;
 await sql()`delete from ekapon.accounts where id=any(${accounts}::bigint[])`;
 if(close)await close();await closeDb();
});

describe('shared demand, owner identity and barangay access',()=>{
 it('serializes two assigned Paravets creating demand and retains shared edit/cancel history',async()=>{
  const results=await Promise.all([p1,p2].map(cookie=>post('/program-interest',{action:'create-demand',targetPeople:1,processes:['Microchipping']},cookie)));
  expect(results.map(r=>r.status).sort()).toEqual([201,409]);
  const id=results.find(r=>r.status===201)!.json.campaignId;campaigns.push(id);
  good(await post('/program-interest',{action:'edit-demand',campaignId:id,expectedRevision:1,targetPeople:1,processes:['Microchipping'],note:'Shared update'},p2));
  expect((await post('/program-interest',{action:'edit-demand',campaignId:id,expectedRevision:1,targetPeople:2,processes:['Microchipping'],note:'Stale edit'},p1)).status).toBe(409);
  good(await post('/program-interest',{action:'add-interest',campaignId:id,registryOwnerId:ownerId,ownerName:`${tag} Shared name`,residenceBarangayId:area.id,pets:[]},p1));
  const history=good(await call('GET',`/api/v1/registry-workspace?kind=owners&id=${ownerId}`,{cookie:admin}));
  expect(history.history).toContainEqual(expect.objectContaining({action:'interest-linked'}));
  good(await post('/program-interest',{action:'submit-request',campaignId:id},p2));
  good(await post('/program-interest',{action:'cancel-demand',campaignId:id,expectedRevision:2,reason:'Changed barangay needs'},p1));
  const next=good(await post('/program-interest',{action:'create-demand',targetPeople:1,processes:['Microchipping']},p2));campaigns.push(next.campaignId);
  good(await post('/program-interest',{action:'add-interest',campaignId:next.campaignId,ownerName:`${tag} New owner`,residenceBarangayId:area.id,pets:[]},p2));
  good(await post('/program-interest',{action:'submit-request',campaignId:next.campaignId},p2));
  good(await post('/program-interest',{action:'review-request',campaignId:next.campaignId,decision:'approve',allowedBarangayIds:[]},admin));
  expect((await post('/program-interest',{action:'cancel-demand',campaignId:next.campaignId,expectedRevision:1,reason:'After approval'},p1)).status).toBe(409);
 });
 it('shares generated batches, notifies both Paravets, prints owner names and supports citywide walk-ins',async()=>{
  const created=good(await post('/program-workspace',{action:'create',schedule:{title:`${tag} Program`,date:today,location:'Covered court',hostBarangayId:area.id,startTime:'08:00',endTime:'12:00',slots:100,processes:['Microchipping'],status:'Open'}}));
  programs.push(created.programId);campaigns.push(created.campaignId);
  const generated=good(await post('/stub-workflow',{action:'generate-batches',campaignId:created.campaignId,barangayIds:[area.id],quantity:2}));
  const batchId=generated.batchIds[0];
  const pdf=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
  expect((await post('/stub-workflow',{action:'attach-pdf',batchId,filename:'stubs.pdf',data:pdf.toString('base64')},p2)).status).toBe(403);
  good(await post('/stub-workflow',{action:'attach-pdf',batchId,filename:'stubs.pdf',data:pdf.toString('base64')}));
  const provided=good(await call('GET',`/api/v1/stub-workflow?mode=pdf&batchId=${batchId}`,{cookie:p2}));expect(provided.data).toBe(pdf.toString('base64'));
  const details=good(await call('GET',`/api/v1/stub-workflow?mode=batch&batchId=${batchId}`,{cookie:p2}));
  const pet={name:'Bantay',species:'Dog',processes:['Microchipping'],breed:'Aspin',vaccinationStatus:'Unknown',sterilizationStatus:'No'};
  good(await post('/stub-workflow',{action:'issue',stubId:details.stubs[0].id,owner:{registryOwnerId:ownerId,name:`${tag} Shared name`,mobile:'',address:ownerId,barangayId:area.id},pets:[pet]},p2));
  const printed=good(await call('GET',`/api/v1/stub-workflow?mode=print&batchId=${batchId}`,{cookie:p1}));
  expect(printed.stubs[0].ownerName).toBe(`${tag} Shared name`);
  good(await post('/stub-workflow',{action:'confirm-print',batchId},p2));
  const notices=await sql()`select recipient_id,title from ekapon.notifications where recipient_id=any(${accounts}::bigint[]) and title in ('Stubs ready','Stub issued')`;
  expect(notices.filter(n=>n.title==='Stubs ready').map(n=>n.recipient_id)).toEqual(expect.arrayContaining([accounts[2],accounts[3]]));
  expect((await call('GET',`/api/v1/registry-participant-options?campaignId=${created.campaignId}&barangayId=${remote.id}&mode=stub`,{cookie:p1})).status).toBe(403);
  const found=good(await call('GET',`/api/v1/registry-participant-options?campaignId=${created.campaignId}&barangayId=${remote.id}&mode=walk-in`,{cookie:p1}));expect(found.owners.some((o:any)=>o.id===remoteId)).toBe(true);
  good(await post('/stub-workflow',{action:'walk-in',campaignId:created.campaignId,requestId:randomUUID(),attendedOn:today,owner:{registryOwnerId:remoteId,name:`${tag} Shared name`,mobile:'',address:remoteId,barangayId:remote.id},pets:[{...pet,outcome:'Completed'}]},p1));
  const attendance=good(await call('GET',`/api/v1/stub-workflow?mode=attendance&campaignId=${created.campaignId}`,{cookie:p1}));expect(attendance.data).toHaveLength(1);
  await sql()`update ekapon.accounts set barangay_id=${remote.id} where id=${p2Id}`;
  expect((await call('GET',`/api/v1/stub-workflow?mode=batch&batchId=${batchId}`,{cookie:p2})).status).toBe(404);
  const [actor]=await sql()`select issued_by,owner_barangay_id from ekapon.stub_tickets where id=${details.stubs[0].id}`;expect(actor).toMatchObject({issued_by:p2Id,owner_barangay_id:area.id});
 });
});

describe('reviewed imports and saved decision reports',()=>{
 it('imports owners and pets atomically and blocks unsafe undo after a later owner link',async()=>{
  const batchId=randomUUID();batches.push(batchId);const id=`${tag}-import`;
  const record={id,name:`${tag} Imported`,address:'Reviewed source',barangay:area.name,pets:[{petName:'Miming',species:'Cat',breed:'Puspin',vaccinationStatus:'Unknown',sterilizationStatus:'Unknown'}],sourceDetails:{extra:'retained'}};
  good(await post('/records/owners/import',{batchId,label:'Paired import',records:[record]}));
  const imported=good(await call('GET',`/api/v1/registry-workspace?kind=owners&id=${id}`,{cookie:admin}));expect(JSON.parse(imported.record.data.sourceDetails).extra).toBe('retained');
  expect(await sql()`select record_id from ekapon.dashboard_records where dataset='pets' and record_data->>'owner_id'=${id}`).toHaveLength(1);
  const extra=`${tag}-extra`;recordIds.push(extra);
  await sql()`insert into ekapon.dashboard_records(dataset,record_id,record_data) values('pets',${extra},${sql().json({id:extra,petName:'Later pet',owner_id:id,barangay:area.name})})`;
  expect((await post('/records/owners/undo-import',{batchId})).status).toBe(409);
  await sql()`delete from ekapon.dashboard_records where record_id=${extra}`;
  good(await post('/records/owners/undo-import',{batchId}));
  expect(await sql()`select record_id from ekapon.dashboard_records where record_id=${id} or record_data->>'owner_id'=${id}`).toHaveLength(0);
  const failed=randomUUID();batches.push(failed);
  expect((await post('/records/owners/import',{batchId:failed,label:'Atomic validation',records:[{...record,id:`${tag}-invalid`,pets:[{petName:'Miming',species:'Cat',breed:'Typo breed'}]}]})).status).toBe(422);
  expect(await sql()`select id from ekapon.dashboard_records where record_id=${tag+'-invalid'}`).toHaveLength(0);
 });
 it('verifies an unlinked interest before creating one owner identity and preserves the source history',async()=>{
  const [person]=await sql()`insert into ekapon.program_interest_people(campaign_id,owner_name,residence_barangay_id,pets,created_by) values(${campaigns[0]},${tag+' Intake owner'},${area.id},${sql().json([{name:'Mochi',species:'Cat'}])},${adminId}) returning id`;
  const intake=good(await call('GET',`/api/v1/registry-workspace?intakeSource=interest&intakeId=${person.id}`,{cookie:admin}));
  const draft={requestId:randomUUID(),mode:'create-owner',owner:{...intake.owner,address:'Verified address'},pets:intake.pets,reason:'Verified intake',intake:{source:'interest',id:person.id}};
  const review=good(await post('/registry-workspace',{action:'preview',draft}));
  const saved=good(await post('/registry-workspace',{action:'save',draft,token:review.token}));recordIds.push(saved.ownerId,...saved.petIds);
  const detail=good(await call('GET',`/api/v1/registry-workspace?kind=owners&id=${saved.ownerId}`,{cookie:admin}));expect(detail.history.some((h:any)=>h.action==='interest-linked')).toBe(true);
  const again=good(await call('GET',`/api/v1/registry-workspace?intakeSource=interest&intakeId=${person.id}`,{cookie:admin}));expect(again.linkedOwnerId).toBe(saved.ownerId);
  expect((await post('/registry-workspace',{action:'preview',draft:{...draft,requestId:randomUUID()}})).status).toBe(409);
 });
 it('excludes generated service history from predictive sufficiency checks',async()=>{
  for(let i=0;i<12;i++){const id=`${tag}-synthetic-${i}`;recordIds.push(id);await sql()`insert into ekapon.dashboard_records(dataset,record_id,record_data) values('services',${id},${sql().json({id,date:`2025-0${1+i%3}-10`,status:'Completed',barangay:area.name,_syntheticData:true})})`;}
  const insight=good(await call('GET',`/api/v1/report-workspace?mode=insights&year=2025&barangayId=${area.id}`,{cookie:admin}));expect(insight.syntheticRecords).toBeGreaterThanOrEqual(12);expect(insight.blocks.find((b:any)=>b.stage==='predictive').values.available).toBe(false);
  const legacy=good(await call('GET','/api/v1/analytics?year=2025&source=live',{cookie:admin}));expect(legacy.forecast.available).toBe(false);expect(legacy.syntheticRecords).toBeGreaterThanOrEqual(12);
 });
 it('persists personal drafts with version checks and recomputes selected analysis at preview',async()=>{
  const insights=good(await call('GET','/api/v1/report-workspace?mode=insights&year=2026',{cookie:admin}));expect(insights.blocks.map((b:any)=>b.stage)).toEqual(['descriptive','diagnostic','predictive','prescriptive']);
  const block=insights.blocks[0],key=`Data analytics:${block.id}`;
  const draft=good(await post('/report-workspace',{title:'Decision review',content:{items:[{key,source:'Data analytics',id:block.id,label:block.label,values:{owners:999999},selectedFields:['owners']}],notes:'Staff interpretation',level:'Tactical'}}));
  expect((await call('GET',`/api/v1/report-workspace?id=${draft.id}`,{cookie:superAdmin})).status).toBe(404);
  expect((await post('/report-workspace',{id:draft.id,expectedVersion:99,title:'Stale',content:{items:[],notes:'',level:'Strategic'}})).status).toBe(409);
  const preview=good(await post('/report-basket-preview',{items:[{key,source:'Data analytics',id:block.id}]}));expect(preview.items[0].values.owners).not.toBe(999999);
  expect((await call('GET','/api/v1/report-workspace?mode=insights',{cookie:p1})).status).toBe(403);
 });
 it('parses supplied pet details without executing attached prose',()=>{
  expect(parsePetDetails('Pet 1: Bantay (Dog, Male, Brown, Aspin/Mongrel Mix) | Pet 2: Miming (Cat, Female, White, Persian / Pure)')).toMatchObject([{petName:'Bantay',breed:'Aspin',breedClass:'Mongrel'},{petName:'Miming',breed:'Persian',breedClass:'Pure'}]);
 });
});
