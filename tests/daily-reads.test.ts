import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { startServer, client, type Resp } from './harness';
import { sql, closeDb } from '../server/db';
import { sessionCookie } from '../server/auth';
const tag=`Daily${randomUUID().slice(0,8)}`;
let call:ReturnType<typeof client>,close:()=>Promise<void>,admin:string,field:string,area:any,remote:any;
const actors:number[]=[],records:string[]=[];
const yes=(r:Resp)=>{expect(r.status,JSON.stringify(r.json)).toBe(200);return r.json;};
const get=(path:string,cookie=admin)=>call('GET',`/api/v1${path}`,{cookie});
beforeAll(async()=>{
 const s=await startServer();call=client(s.base);close=s.close;[area,remote]=await sql()`select id,name from ekapon.barangays order by id limit 2`;
 for(const type of ['Admin','Paravet'] as const){const [a]=await sql()`insert into ekapon.accounts(username,account_type,first_name,last_name,barangay_id)
  values(${type==='Admin'?tag:null},${type},${tag},${type},${type==='Paravet'?area.id:null}) returning id`;actors.push(a.id);const c=(await sessionCookie({id:a.id,type},'full')).split(';')[0];if(type==='Admin')admin=c;else field=c;}
 for(const [kind,suffix,barangay,extra] of [
  ['owners','owner',area.name,{name:`${tag} Owner %_ literal`,address:'Synthetic test address',contact:'0917-123-4567',importNotes:'Retained notes '.repeat(500),private_token:'PRIVATE-DAILY-CANARY',id_image:'PRIVATE-IMAGE-CANARY'}],
  ['pets','pet',area.name,{petName:`${tag} Bantay`,owner:`${tag} Owner %_ literal`,owner_id:`${tag}-owner`,species:'Dog',sex:null,age_months:0,breed:'Mongrel',remarks:'Retained pet remarks'}],
  ['owners','remote',remote.name,{name:`${tag} Remote owner`,address:'Remote address'}],
 ] as const){const id=`${tag}-${suffix}`;records.push(id);await sql()`insert into ekapon.dashboard_records(dataset,record_id,record_data) values(${kind},${id},${sql().json({id,barangay,date:'2026-10-18',...extra})})`;}
});
afterAll(async()=>{await sql()`delete from ekapon.dashboard_records where record_id=any(${records}::text[])`;await sql()`delete from ekapon.accounts where id=any(${actors}::bigint[])`;await close();await closeDb();});
describe('compact daily registry reads',()=>{
 it('returns small lists while preserving full details and report fields on explicit selection',async()=>{
  const path=`/records/owners?q=${tag}`;
  const full=yes(await get(path)),compact=yes(await get(`${path}&summary=true`));
  expect(compact.total).toBe(full.total);expect(compact.data.map((r:any)=>r.id)).toEqual(full.data.map((r:any)=>r.id));
  expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(full).length/3);
  const owner=compact.data.find((r:any)=>r.id===`${tag}-owner`);expect(owner.name).toContain('%_ literal');expect(owner).not.toHaveProperty('importNotes');expect(owner._relationshipIssue).toBeNull();
  expect(yes(await get(`/registry-workspace?kind=owners&id=${tag}-owner`)).record.data.importNotes).toContain('Retained notes');
  const basket=yes(await call('POST','/api/v1/report-basket-preview',{cookie:admin,json:{items:[{key:'owner',source:'Owners',id:`${tag}-owner`}]}}));
  expect(basket.items[0].values.importNotes).toContain('Retained notes');expect(JSON.stringify(basket)).not.toContain('PRIVATE-');
 });
 it('keeps picker lists compact and loads linked pets with unknown and zero values only on selection',async()=>{
  const list=yes(await get(`/registry-workspace?kind=owners&q=${tag}`));
  expect(list.data.find((r:any)=>r.id===`${tag}-owner`).data).not.toHaveProperty('importNotes');
  const detail=yes(await get(`/registry-workspace?kind=owners&id=${tag}-owner`));expect(detail.pets).toHaveLength(1);
  expect(detail.pets[0].data).toMatchObject({sex:null,age_months:0,remarks:'Retained pet remarks'});
  const pets=yes(await get(`/records/pets?summary=true&q=${tag}`));expect(pets.data[0]).toMatchObject({id:`${tag}-pet`,sex:null,owner_id:`${tag}-owner`});
 });
 it('enforces the same current area, archive, and disabled-feature rules on compact reads',async()=>{
  const rows=yes(await get(`/records/owners?summary=true&q=${tag}`,field));expect(rows.data.map((r:any)=>r.id)).toEqual([`${tag}-owner`]);
  expect((await get(`/registry-workspace?kind=owners&id=${tag}-remote`,field)).status).toBe(404);
  await sql()`update ekapon.dashboard_records set archived=true where record_id=${`${tag}-remote`}`;
  expect(yes(await get(`/records/owners?summary=true&q=${tag}`)).total).toBe(1);
  expect(yes(await get(`/records/owners?summary=true&q=${tag}&archived=true`)).data[0].id).toBe(`${tag}-remote`);
  const [old]=await sql()`select enabled from ekapon.role_feature_access where account_type='Paravet' and feature_key='registry'`;
  try{await sql()`insert into ekapon.role_feature_access(account_type,feature_key,enabled) values('Paravet','registry',false) on conflict(account_type,feature_key) do update set enabled=false`;
   expect((await get('/records/owners?summary=true',field)).status).toBe(403);
  }finally{if(old)await sql()`update ekapon.role_feature_access set enabled=${old.enabled} where account_type='Paravet' and feature_key='registry'`;else await sql()`delete from ekapon.role_feature_access where account_type='Paravet' and feature_key='registry'`;}
 });
 it('matches documented fields and literal wildcards without searching private stored data',async()=>{
  for(const q of ['PRIVATE-DAILY-CANARY','PRIVATE-IMAGE-CANARY','Retained notes'])expect(yes(await get(`/records/owners?q=${encodeURIComponent(q)}&summary=true`)).total).toBe(0);
  expect(yes(await get(`/records/owners?summary=true&q=${encodeURIComponent(`${tag} Owner %_ literal`)}`)).data).toHaveLength(1);
  expect(yes(await get(`/records/pets?summary=true&q=${tag}`)).data[0].petName).toBe(`${tag} Bantay`);
  expect((await get('/records/services?summary=true')).status).toBe(422);
 });
 it('does not cache individual records or authorize a report after reassignment',async()=>{
  await sql()`update ekapon.accounts set barangay_id=${remote.id} where id=${actors[1]}`;
  expect(yes(await get(`/records/owners?summary=true&q=${tag}`,field)).total).toBe(0);
  const result=yes(await call('POST','/api/v1/report-basket-preview',{cookie:field,json:{items:[{key:'owner',source:'Owners',id:`${tag}-owner`}]}}));
  expect(result.items).toEqual([]);expect(result.unavailable).toEqual(['owner']);
 });
});
