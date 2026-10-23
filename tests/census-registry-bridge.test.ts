import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {startServer,client,type Resp} from './harness';
import {sql,closeDb} from '../server/db';
import {sessionCookie} from '../server/auth';
import {ownerFields,petFields,type RegistryDraft} from '../shared/registry';
import {approvalToken,reviewedMatch} from './census-review-helpers';
const tag=`Bridge${randomUUID().slice(0,8)}`;
let call:ReturnType<typeof client>,close:()=>Promise<void>,admin:string,field:string,other:string,area:any,remote:any,campaign:number;
const actors:number[]=[],submissions:string[]=[];let publishedOwner:string,publishedPets:string[],submission:string;
const yes=(r:Resp)=>{expect([200,201],JSON.stringify(r.json)).toContain(r.status);return r.json;};
const get=(path:string,cookie=admin)=>call('GET',path,{cookie});
const pet=(name:string)=>({petName:`${tag} ${name}`,species:'Dog',sex:'Male',sterilized:null,vaccine1st:null,vaccine2nd:false,vaccine3rd:true,booster:null,laps:null});
async function prepare(suffix:string,count=1){const r=yes(await call('POST','/api/v1/census/submissions',{cookie:field,json:{label:`${tag} ${suffix}`,censusDate:'2026-10-18',source:'csv',householdsVisited:1,owners:[{ownerName:`${tag} ${suffix}`,address:'Synthetic address',pets:Array.from({length:count},(_,i)=>pet(`${suffix} pet ${i+1}`))}]}}));const id=r.submission.id;submissions.push(id);return id;}
async function approve(id:string){const d=yes(await get(`/api/v1/census/submissions/${id}`));yes(await call('PUT',`/api/v1/census/submissions/${id}/decisions`,{cookie:admin,json:{decisions:d.owners.map((o:any)=>({ownerId:o.id,decision:'new'}))}}));yes(await call('POST',`/api/v1/census/submissions/${id}/review`,{cookie:admin,json:{decision:'approve',reviewToken:await approvalToken(call,id,admin)}}));const owners=yes(await get(`/api/v1/records/owners?q=${encodeURIComponent(d.owners[0].ownerName)}`)).data;const ownerId=owners.find((r:any)=>r.name===d.owners[0].ownerName).id;return {ownerId,pets:yes(await get(`/api/v1/registry-workspace?kind=owners&id=${ownerId}`)).pets.map((p:any)=>p.id)};}
async function save(d:RegistryDraft){const p=yes(await call('POST','/api/v1/registry-workspace',{cookie:admin,json:{action:'preview',draft:d}}));return call('POST','/api/v1/registry-workspace',{cookie:admin,json:{action:'save',draft:d,token:p.token,acknowledgeMatches:true,matchReason:'Confirmed synthetic distinct identity'}});}
beforeAll(async()=>{const s=await startServer();call=client(s.base);close=s.close;[area,remote]=await sql()`select id,name from ekapon.barangays order by id limit 2`;
 for(const [type,brg] of [['SuperAdmin',null],['Paravet',area.id],['Paravet',remote.id]] as const){const [r]=await sql()`insert into ekapon.accounts(username,account_type,first_name,last_name,barangay_id) values(${type==='SuperAdmin'?tag:null},${type},${tag},${type},${brg}) returning id`;actors.push(r.id);const cookie=(await sessionCookie({id:r.id,type},'full')).split(';')[0];if(type==='SuperAdmin')admin=cookie;else if(brg===area.id)field=cookie;else other=cookie;}
 const [r]=await sql()`insert into ekapon.dashboard_records(dataset,record_id,record_data) values('programs',${`${tag}-program`},${sql().json({id:`${tag}-program`,title:tag,date:'2026-10-18',status:'Open',barangay:area.name,processes:['Microchipping']})}) returning id`;
 const [c]=await sql()`insert into ekapon.program_interest_campaigns(reference,campaign_type,host_barangay_id,program_record_id,processes,status,created_by) values(${tag},'program_day',${area.id},${r.id},${['Microchipping']},'scheduled',${actors[0]}) returning id`;campaign=c.id;await sql()`insert into ekapon.program_interest_allowed_barangays(campaign_id,barangay_id,added_by) values(${campaign},${area.id},${actors[0]})`;
});
afterAll(async()=>{
 await sql()`delete from ekapon.registry_activity where actor_id=any(${actors}::bigint[])`;await sql()`delete from ekapon.registry_requests where actor_id=any(${actors}::bigint[])`;
 await sql()`delete from ekapon.census_submissions where id=any(${submissions}::uuid[])`;
 await sql()`delete from ekapon.registry_owners where owner_name like ${`${tag}%`}`;
 if(campaign)await sql()`delete from ekapon.program_interest_campaigns where id=${campaign}`;
 await sql()`delete from ekapon.registry_source_links l using ekapon.dashboard_records d where l.dataset=d.dataset and l.record_id=d.record_id and (d.record_data->>'name' like ${`${tag}%`} or d.record_data->>'owner' like ${`${tag}%`} or d.record_data->>'petName' like ${`${tag}%`})`;
 await sql()`delete from ekapon.dashboard_records where record_id like ${`${tag}%`} or record_data->>'name' like ${`${tag}%`} or record_data->>'owner' like ${`${tag}%`} or record_data->>'petName' like ${`${tag}%`}`;
 await sql()`delete from ekapon.accounts where id=any(${actors}::bigint[])`;await close();await closeDb();
});
describe('approved census registry connection',()=>{
 it('publishes only after approval to registry, global search, and scoped participant selection',async()=>{
  submission=await prepare('First',3);expect(yes(await get(`/api/v1/records/owners?q=${tag}`,field)).data).toHaveLength(0);
  const r=await approve(submission);publishedOwner=r.ownerId;publishedPets=r.pets;expect(publishedPets).toHaveLength(3);
  expect(yes(await get(`/api/v1/search?q=${tag}`,field)).data.some((r:any)=>r.id===publishedOwner)).toBe(true);
  const options=`/api/v1/registry-participant-options?campaignId=${campaign}&barangayId=${area.id}&ownerId=${publishedOwner}`;
  expect(yes(await get(options,field)).pets).toHaveLength(3);expect([403,404]).toContain((await get(options,other)).status);
  expect(yes(await get(`/api/v1/search?q=${tag}`,other)).data.some((r:any)=>r.id===publishedOwner)).toBe(false);
  const details=yes(await get(`/api/v1/registry-workspace?kind=pets&id=${publishedPets[0]}`));expect(details.record.data).toMatchObject({owner_id:publishedOwner,vaccine_1st:null,vaccine_2nd:false,vaccine_3rd:true});
 });
 it('keeps census aliases stable across undo and redo without resurrecting withdrawn records manually',async()=>{
  const id=await prepare('Reversible');const initial=await approve(id);
  yes(await call('POST',`/api/v1/census/submissions/${id}/status`,{cookie:admin,json:{action:'undo'}}));
  expect(yes(await get(`/api/v1/records/owners?q=${encodeURIComponent(`${tag} Reversible`)}`)).data).toHaveLength(0);
  expect((await call('POST','/api/v1/records/owners/archive',{cookie:admin,json:{ids:[initial.ownerId],archived:false}})).status).toBe(422);
  yes(await call('POST',`/api/v1/census/submissions/${id}/status`,{cookie:admin,json:{action:'redo'}}));
  const details=yes(await get(`/api/v1/registry-workspace?kind=owners&id=${initial.ownerId}`));expect(details.record.archived).toBe(false);expect(details.pets.map((p:any)=>p.id)).toEqual(initial.pets);
 });
 it('writes staff edits through to census registry rows and blocks a conflicting approval undo',async()=>{
  const detail=yes(await get(`/api/v1/registry-workspace?kind=owners&id=${publishedOwner}`));const fields=ownerFields(detail.record);
  yes(await save({requestId:randomUUID(),mode:'edit-owner',ownerId:publishedOwner,owner:{...fields,name:`${tag} Corrected`,address:'Confirmed new address'},pets:[],reason:'Verified the current owner details'}));
  const [r]=await sql()`select r.owner_name,r.address from ekapon.registry_owners r join ekapon.registry_source_links l on l.source_id=r.id and l.dataset='owners' where l.record_id=${publishedOwner}`;expect(r).toMatchObject({owner_name:`${tag} Corrected`,address:'Confirmed new address'});
  expect(yes(await get(`/api/v1/registry-workspace?kind=pets&id=${publishedPets[0]}`)).record.data.owner).toBe(`${tag} Corrected`);
  expect((await call('POST',`/api/v1/census/submissions/${submission}/status`,{cookie:admin,json:{action:'undo'}})).status).toBe(409);
 });
 it('preserves independent pet archives when an approved owner is archived and restored',async()=>{
  const archive=(kind:string,ids:string[],archived:boolean)=>call('POST',`/api/v1/records/${kind}/archive`,{cookie:admin,json:{ids,archived}});
  yes(await archive('pets',[publishedPets[0]],true));yes(await archive('owners',[publishedOwner],true));yes(await archive('owners',[publishedOwner],false));
  const d=yes(await get(`/api/v1/registry-workspace?kind=owners&id=${publishedOwner}`));expect(d.pets.find((p:any)=>p.id===publishedPets[0]).archived).toBe(true);expect(d.pets.filter((p:any)=>!p.archived)).toHaveLength(2);
 });
 it('corrects a census pet to an explicitly chosen legacy owner without creating a second staff owner',async()=>{
  const id=`${tag}-legacy-owner`;await sql()`insert into ekapon.dashboard_records(dataset,record_id,record_data) values('owners',${id},${sql().json({id,name:`${tag} Legacy`,address:'Verified legacy address',barangay:area.name})})`;
  yes(await save({requestId:randomUUID(),mode:'link-owner',ownerId:id,petId:publishedPets[1],reason:'Verified the original paper owner'}));
  const detail=yes(await get(`/api/v1/registry-workspace?kind=pets&id=${publishedPets[1]}`));expect(detail.owner.id).toBe(id);expect(detail.record.data.vaccine_3rd).toBe(true);
  expect(yes(await get(`/api/v1/records/owners?q=${encodeURIComponent(`${tag} Legacy`)}`)).data).toHaveLength(1);
  const p=petFields(detail.record);yes(await save({requestId:randomUUID(),mode:'edit-pet',petId:publishedPets[1],pets:[{...p,remarks:'Confirmed markings'}],reason:'Updated the paper remarks'}));
  expect(yes(await get(`/api/v1/registry-workspace?kind=pets&id=${publishedPets[1]}`)).record.data).toMatchObject({remarks:'Confirmed markings',vaccine_1st:null,vaccine_3rd:true});
 });
 it('preserves known flags on a merge with unknowns and refuses ambiguous pet matches',async()=>{
  const [mapped]=await sql()`select source_id from ekapon.registry_source_links where dataset='owners' and record_id=${publishedOwner}`;
  const body={label:`${tag} Merge`,censusDate:'2026-10-18',source:'csv',owners:[{ownerName:`${tag} Corrected`,address:'Confirmed new address',pets:[{...pet('First pet 3'),vaccine1st:true,vaccine2nd:null,vaccine3rd:null}]}]};
  const created=yes(await call('POST','/api/v1/census/submissions',{cookie:field,json:body}));submissions.push(created.submission.id);const id=created.submission.id;
  const detail=yes(await get(`/api/v1/census/submissions/${id}`));yes(await call('PUT',`/api/v1/census/submissions/${id}/decisions`,{cookie:admin,json:{decisions:[await reviewedMatch(call,id,admin,detail.owners[0].id,mapped.source_id)]}}));
  yes(await call('POST',`/api/v1/census/submissions/${id}/review`,{cookie:admin,json:{decision:'approve',reviewToken:await approvalToken(call,id,admin)}}));
  expect(yes(await get(`/api/v1/registry-workspace?kind=pets&id=${publishedPets[2]}`)).record.data).toMatchObject({vaccine_1st:true,vaccine_2nd:false,vaccine_3rd:true});
  await sql()`insert into ekapon.registry_pets(owner_id,pet_name,species,sex) values(${mapped.source_id}::uuid,${`${tag} First pet 3`},'Dog','Male')`;
  const again=yes(await call('POST','/api/v1/census/submissions',{cookie:field,json:body}));const next=again.submission.id;submissions.push(next);const d=yes(await get(`/api/v1/census/submissions/${next}`));yes(await call('PUT',`/api/v1/census/submissions/${next}/decisions`,{cookie:admin,json:{decisions:[await reviewedMatch(call,next,admin,d.owners[0].id,mapped.source_id)]}}));
  const refused=await call('POST',`/api/v1/census/submissions/${next}/review`,{cookie:admin,json:{decision:'approve',reviewToken:await approvalToken(call,next,admin)}});expect(refused.status).toBe(409);expect(refused.json.error.code).toBe('CENSUS_PET_MATCH_AMBIGUOUS');
 });
 it('blocks reversal after an edit to a workspace-only field',async()=>{
  const id=await prepare('Extended fields'),r=await approve(id);const detail=yes(await get(`/api/v1/registry-workspace?kind=pets&id=${r.pets[0]}`));
  yes(await save({requestId:randomUUID(),mode:'edit-pet',petId:r.pets[0],pets:[{...petFields(detail.record),breed:'Shih Tzu'}],reason:'Confirmed an additional registry detail'}));
  expect(yes(await get(`/api/v1/census/submissions/${id}/status`)).canUndo).toBe(false);
  expect((await call('POST',`/api/v1/census/submissions/${id}/status`,{cookie:admin,json:{action:'undo'}})).status).toBe(409);
 });
});
