import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { startServer,client,type Resp } from './harness';
import { sql,closeDb } from '../server/db';
import { sessionCookie } from '../server/auth';
import { emptyRegistryPet,ownerFields,petFields,type RegistryDraft } from '../shared/registry';
const tag=`Registry${randomUUID().slice(0,8)}`;
let call:ReturnType<typeof client>,close:()=>Promise<void>,admin:string,superAdmin:string,field:string;
let area:{id:number;name:string},remote:{id:number;name:string};
const accounts:number[]=[],recordIds:string[]=[];
let ownerA:string,ownerB:string,legacyPet:string,createdOwner:string,createdPets:string[];
const success=(r:Resp)=>{expect([200,201],JSON.stringify(r.json)).toContain(r.status);return r.json;};
const get=(kind:string,id:string,cookie=admin)=>call('GET',`/api/v1/registry-workspace?kind=${kind}&id=${encodeURIComponent(id)}`,{cookie});
const post=(json:unknown,cookie=admin)=>call('POST','/api/v1/registry-workspace',{cookie,json});
const pet=(name='Milo')=>({...emptyRegistryPet(),name,species:'Dog' as const,sex:'Male' as const,ageMonths:0});
const draft=(changes:Partial<RegistryDraft>={}):RegistryDraft=>({requestId:randomUUID(),mode:'create-owner',owner:{name:`${tag} New owner`,address:'Synthetic address',contact:'09171234567',barangayId:area.id},pets:[pet('Milo'),pet('Luna')],reason:'',...changes});
async function preview(d:RegistryDraft){return success(await post({action:'preview',draft:d}));}
async function commit(d:RegistryDraft,extra={}){const review=await preview(d);return post({action:'save',draft:d,token:review.token,acknowledgeMatches:true,matchReason:'Verified distinct synthetic records',...extra});}
async function seed(kind:string,id:string,data:Record<string,unknown>){recordIds.push(id);await sql()`insert into ekapon.dashboard_records(dataset,record_id,record_data) values(${kind},${id},${sql().json({id,...data})})`;}
beforeAll(async()=>{
 const server=await startServer();call=client(server.base);close=server.close;
 [area,remote]=await sql()`select id,name from ekapon.barangays order by id limit 2` as unknown as [typeof area,typeof remote];
 const rows=await sql()`insert into ekapon.accounts(username,account_type,first_name,last_name,barangay_id) values(${tag},'Admin',${tag},'Admin',null),(${`${tag}super`},'SuperAdmin',${tag},'Super',null),(null,'Paravet',${tag},'Field',${area.id}) returning id,account_type::text as type`;
 accounts.push(...rows.map(r=>r.id));[admin,superAdmin,field]=await Promise.all(rows.map(async r=>(await sessionCookie({id:r.id,type:r.type},'full')).split(';')[0]));
 ownerA=`${tag}-owner-a`;ownerB=`${tag}-owner-b`;legacyPet=`${tag}-legacy-pet`;
 await seed('owners',ownerA,{name:`${tag} Shared owner`,barangay:area.name,address:'Address A',contact:'',id_image:'PRIVATE-IMAGE-CANARY'});
 await seed('owners',ownerB,{name:`${tag} Shared owner`,barangay:area.name,address:'Address B',contact:''});
 await seed('pets',legacyPet,{petName:'Legacy pet',owner:`${tag} Shared owner`,barangay:area.name,species:'Cat',sex:'Female',vaccine_1st:true,remarks:'Historical details'});
 await seed('owners',`${tag}-remote`,{name:`${tag} Remote`,barangay:remote.name});
});
afterAll(async()=>{
 const owned=await sql()`select record_id from ekapon.dashboard_records where record_data->>'owner_id' in(select record_id from ekapon.dashboard_records where record_data->>'name' like ${`${tag}%`})`;
 recordIds.push(...owned.map(r=>r.record_id));
 await sql()`delete from ekapon.registry_activity where actor_id=any(${accounts}::bigint[])`;
 await sql()`delete from ekapon.registry_requests where actor_id=any(${accounts}::bigint[])`;
 await sql()`delete from ekapon.dashboard_records where record_id=any(${recordIds}::text[]) or record_data->>'name' like ${`${tag}%`}`;
 await sql()`delete from ekapon.accounts where id=any(${accounts}::bigint[])`;
 if(close)await close();await closeDb();
});
describe('owner and pet registry workspace',()=>{
 it('requires an atomic review and creates multiple explicitly linked pets once across retries',async()=>{
  const d=draft();expect((await post({action:'save',draft:d})).status).toBe(409);
  const review=await preview(d);expect(review.barangay.name).toBe(area.name);
  const saved=success(await post({action:'save',draft:d,token:review.token}));createdOwner=saved.ownerId;createdPets=saved.petIds;recordIds.push(createdOwner,...createdPets);
  expect(createdPets).toHaveLength(2);expect(new Set(createdPets).size).toBe(2);
  const again=success(await post({action:'save',draft:d,token:review.token}));expect(again).toMatchObject({ownerId:createdOwner,petIds:createdPets,replayed:true});
  const detail=success(await get('owners',createdOwner));expect(detail.pets).toHaveLength(2);expect(detail.pets.every((p:any)=>p.data.owner_id===createdOwner)).toBe(true);
  expect(detail.pets[0].data.age_months).toBe(0);expect(detail.history[0].action).toBe('owner-created');
  expect((await post({action:'save',draft:{...d,reason:'Different payload'},token:review.token})).status).toBe(409);
 });
 it('rolls back the owner and request if a pet insert fails after owner insertion',async()=>{
  const trigger=`${tag.toLowerCase()}_fail`;
  await sql().unsafe(`create function ekapon.${trigger}() returns trigger language plpgsql as $$ begin if NEW.dataset='pets' and NEW.record_data->>'petName'='Force atomic failure' then raise exception 'Synthetic insert failure' using errcode='23514'; end if;return NEW;end $$;create trigger ${trigger} before insert on ekapon.dashboard_records for each row execute function ekapon.${trigger}()`);
  const d=draft({owner:{name:`${tag} Rollback`,address:'Synthetic',contact:'',barangayId:area.id},pets:[pet('Force atomic failure')]});
  try{const r=await commit(d);expect(r.status).toBe(422);const rows=await sql()`select id from ekapon.dashboard_records where record_data->>'name'=${d.owner!.name}`;expect(rows).toHaveLength(0);expect(await sql()`select request_id from ekapon.registry_requests where request_id=${d.requestId}::uuid`).toHaveLength(0);}
  finally{await sql().unsafe(`drop trigger ${trigger} on ekapon.dashboard_records;drop function ekapon.${trigger}()`);}
 });
 it('rejects stale owner, linked-pet, and changed-draft reviews',async()=>{
  const d=draft({mode:'edit-owner',ownerId:createdOwner,owner:{name:`${tag} New owner`,address:'New address',contact:'',barangayId:area.id},pets:[],reason:'Synthetic address correction'});
  let review=await preview(d);
  await sql()`update ekapon.dashboard_records set record_data=record_data||'{"remarks":"Changed meanwhile"}'::jsonb where record_id=${createdPets[0]}`;
  expect((await post({action:'save',draft:d,token:review.token})).status).toBe(409);
  review=await preview(d);expect((await post({action:'save',draft:{...d,owner:{...d.owner!,address:'Unreviewed address'}},token:review.token})).status).toBe(409);
  success(await post({action:'save',draft:d,token:review.token}));
 });
 it('shows possible matches and requires explicit acknowledgement without merging identities',async()=>{
  const d=draft({owner:{name:` ${tag.toLowerCase()}  shared owner `,address:'Distinct address C',contact:'',barangayId:area.id},pets:[pet('Distinct pet')]});
  const review=await preview(d);expect(review.matchCount).toBe(2);expect(JSON.stringify(review)).not.toContain('PRIVATE-IMAGE-CANARY');
  expect((await post({action:'save',draft:d,token:review.token})).status).toBe(409);
  const r=success(await post({action:'save',draft:d,token:review.token,acknowledgeMatches:true,matchReason:'Confirmed a different person using synthetic paper records'}));recordIds.push(r.ownerId,...r.petIds);
  expect([ownerA,ownerB]).not.toContain(r.ownerId);expect(success(await get('owners',ownerA)).record.data.address).toBe('Address A');
  expect(JSON.stringify(success(await call('GET',`/api/v1/records/owners?q=${tag}`,{cookie:admin})))).not.toContain('PRIVATE-IMAGE-CANARY');
 });
 it('requires an explicit owner ID even for a single name match, including CSV imports',async()=>{
  const ownerId=`${tag}-unique-owner`,petId=`${tag}-unique-pet`,name=`${tag} Unique owner`;
  await seed('owners',ownerId,{name,barangay:area.name});recordIds.push(petId);
  const record={id:petId,petName:'Explicit pet',owner:name,barangay:area.name,species:'Dog'};
  const single=await call('POST','/api/v1/records/pets',{cookie:admin,json:{records:[record]}});
  expect(single.status).toBe(409);expect(single.json.error.code).toBe('OWNER_SELECTION_REQUIRED');
  const batchId=randomUUID();const imported=await call('POST','/api/v1/records/pets/import',{cookie:admin,json:{batchId,label:'Explicit-ID check',records:[record]}});
  expect(imported.status).toBe(409);expect(await sql()`select batch_id from ekapon.dashboard_import_batches where batch_id=${batchId}::uuid`).toHaveLength(0);
  const saved=success(await call('POST','/api/v1/records/pets',{cookie:admin,json:{records:[{...record,owner_id:ownerId}]}}));
  expect(success(await get('pets',petId)).owner.id).toBe(ownerId);
  expect((await call('POST',`/api/v1/undo/${saved.undoToken}`,{cookie:admin,json:{}})).status).toBe(409);
 });
 it('blocks bypassing possible-owner review through the legacy creation route',async()=>{
  const id=`${tag}-duplicate-legacy`;recordIds.push(id);
  const r=await call('POST','/api/v1/records/owners',{cookie:admin,json:{records:[{id,name:` ${tag.toLowerCase()}   shared owner `,barangay:area.name,petName:'Separate pet',species:'Dog'}]}});
  expect(r.status).toBe(409);expect(r.json.error.code).toBe('OWNER_MATCH_REVIEW_REQUIRED');
 });
 it('retains the original legacy age when its units are unknown and shows alternate contact fields',async()=>{
  const id=`${tag}-legacy-age`;
  await seed('pets',id,{petName:'Paper age pet',owner_id:ownerA,owner:`${tag} Shared owner`,barangay:area.name,species:'Cat',age:'2 (paper)',vaccine_1st:true});
  const detail=success(await get('pets',id));const fields=petFields(detail.record);expect(fields.ageMonths).toBeNull();
  success(await commit(draft({mode:'edit-pet',petId:id,owner:undefined,pets:[{...fields,remarks:'Verified other details; age unit unknown'}],reason:'Preserve the original paper age'})));
  expect(success(await get('pets',id)).record.data).toMatchObject({age:'2 (paper)',age_months:null,vaccine_1st:true});
  expect(ownerFields({id:ownerA,kind:'owners',archived:false,data:{contact:'',mobile:'0917-123-4567'}}).contact).toBe('0917-123-4567');
 });
 it('requires explicit selection for ambiguous legacy names and audits a manual owner-link correction',async()=>{
  const id=`${tag}-ambiguous-new`;recordIds.push(id);
  const ambiguous=await call('POST','/api/v1/records/pets',{cookie:admin,json:{records:[{id,petName:'Ambiguous',owner:`${tag} Shared owner`,barangay:area.name,species:'Dog'}]}});
  expect(ambiguous.status).toBe(409);expect(ambiguous.json.error.code).toBe('OWNER_AMBIGUOUS');
  const d=draft({mode:'link-owner',petId:legacyPet,ownerId:ownerB,owner:undefined,pets:undefined,reason:'Verified owner B against the original paper record'});
  success(await commit(d));const detail=success(await get('pets',legacyPet));
  expect(detail.owner.id).toBe(ownerB);expect(detail.record.data).toMatchObject({owner_id:ownerB,vaccine_1st:true,remarks:'Historical details'});
  expect(detail.history[0]).toMatchObject({action:'owner-link-corrected',before:{owner:`${tag} Shared owner`},after:{owner_id:ownerB}});
  const generic=await call('POST','/api/v1/records/pets',{cookie:admin,json:{records:[{id:legacyPet,owner_id:ownerA,owner:`${tag} Shared owner`,barangay:area.name,species:'Cat'}]}});expect(generic.status).toBe(409);
 });
 it('updates owner display details and explicitly linked pets together, preserving unknown fields',async()=>{
  const d=draft({mode:'edit-owner',ownerId:ownerB,owner:{name:`${tag} Corrected owner`,address:'Corrected address',contact:'',barangayId:remote.id},pets:[],reason:'Confirmed identity and new current residence'});
  success(await commit(d));const p=success(await get('pets',legacyPet));expect(p.record.data).toMatchObject({owner:`${tag} Corrected owner`,barangay:remote.name,vaccine_1st:true});
  expect(p.history.some((h:any)=>h.action==='owner-details-synced')).toBe(true);
 });
 it('keeps Paravets read-only and scoped, and enforces current feature settings',async()=>{
  expect((await post({action:'preview',draft:draft()},field)).status).toBe(403);
  expect((await get('owners',`${tag}-remote`,field)).status).toBe(404);
  expect((await get('owners',ownerA,field)).status).toBe(200);
  const [previous]=await sql()`select enabled from ekapon.role_feature_access where account_type='Admin' and feature_key='registry'`;
  try{await sql()`insert into ekapon.role_feature_access(account_type,feature_key,enabled) values('Admin','registry',false) on conflict(account_type,feature_key) do update set enabled=false`;expect((await get('owners',ownerA)).status).toBe(403);}
  finally{if(previous)await sql()`update ekapon.role_feature_access set enabled=${previous.enabled} where account_type='Admin' and feature_key='registry'`;else await sql()`delete from ekapon.role_feature_access where account_type='Admin' and feature_key='registry'`;}
 });
 it('restores only pets archived with an owner and cannot restore a pet under an archived owner',async()=>{
  const archive=(kind:string,ids:string[],archived:boolean)=>call('POST',`/api/v1/records/${kind}/archive`,{cookie:superAdmin,json:{ids,archived}});
  success(await archive('pets',[createdPets[0]],true));success(await archive('owners',[createdOwner],true));
  expect((await archive('pets',[createdPets[1]],false)).status).toBe(422);
  success(await archive('owners',[createdOwner],false));const detail=success(await get('owners',createdOwner));
  expect(detail.pets.find((r:any)=>r.id===createdPets[0]).archived).toBe(true);expect(detail.pets.find((r:any)=>r.id===createdPets[1]).archived).toBe(false);
 });
 it('rejects malformed modes, blank reasons, invalid ages, and zero-pet new owners',async()=>{
  for(const d of [draft({pets:[]}),draft({pets:[{...pet(),ageMonths:-1}]}),draft({ownerId:ownerA}),draft({mode:'link-owner',ownerId:ownerA,petId:legacyPet,owner:undefined,pets:undefined,reason:''})])expect((await post({action:'preview',draft:d})).status).toBe(400);
 });
});
