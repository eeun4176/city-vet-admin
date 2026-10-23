import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, client, type Resp } from './harness';
import { sql, closeDb } from '../server/db';
import { sessionCookie } from '../server/auth';
import { invalidateSummaries } from '../server/summaryCache';

const tag=`Perf${randomUUID().slice(0,8)}`;
let call:ReturnType<typeof client>,close:()=>Promise<void>,cookie:string,accountId:number;
let barangay:{id:number;name:string};
const ids:string[]=[];
const success=(response:Resp)=>{expect(response.status,JSON.stringify(response.json)).toBe(200);return response.json;};
beforeAll(async()=>{
  const server=await startServer();call=client(server.base);close=server.close;
  [barangay]=await sql()`select id,name from ekapon.barangays order by id limit 1` as unknown as [{id:number;name:string}];
  const [account]=await sql()`insert into ekapon.accounts(username,account_type,first_name,last_name) values(${tag},'Admin','Synthetic',${tag}) returning id`;
  accountId=account.id;cookie=(await sessionCookie({id:accountId,type:'Admin'},'full')).split(';')[0];invalidateSummaries();
});
afterAll(async()=>{
  if(ids.length)await sql()`delete from ekapon.dashboard_records where record_id=any(${ids})`;
  if(accountId)await sql()`delete from ekapon.dashboard_import_batches where actor_id=${accountId}`;
  if(accountId)await sql()`delete from ekapon.accounts where id=${accountId}`;
  invalidateSummaries();if(close)await close();await closeDb();
});

describe('performance changes retain authorization and fresh writes',()=>{
  it('reports data age, bypasses reuse on Refresh, and invalidates after successful API writes',async()=>{
    const path='/api/v1/dashboard/counts';
    const first=await call('GET',path,{cookie});const before=success(first).counts.services;
    expect(first.headers.get('cache-control')).toBe('no-store');expect(first.headers.get('x-data-updated-at')).toBeTruthy();
    const id=`${tag}-external`;ids.push(id);
    await sql()`insert into ekapon.dashboard_records(dataset,record_id,record_data) values('services',${id},${sql().json({id,service:'Microchipping',status:'Completed',date:'2026-10-17',barangay:barangay.name})})`;
    // Simulate a write made on another API instance; this instance may reuse a summary for <=60 seconds.
    expect(success(await call('GET',path,{cookie})).counts.services).toBe(before);
    expect(success(await call('GET',`${path}?fresh=1`,{cookie})).counts.services).toBe(before+1);
    const next=`${tag}-api`;ids.push(next);
    success(await call('POST','/api/v1/records/services/import',{cookie,json:{batchId:randomUUID(),label:'Synthetic historical services',records:[{id:next,service:'Microchipping',status:'Completed',date:'2026-10-17',barangay:barangay.name}]}}));
    expect(success(await call('GET',path,{cookie})).counts.services).toBe(before+2);
  });
  it('checks current account/feature access before returning an already computed summary',async()=>{
    const path='/api/v1/analytics?source=live&year=2026';success(await call('GET',path,{cookie}));
    const [access]=await sql()`select enabled from ekapon.role_feature_access where account_type='Admin' and feature_key='reports'`;
    try {
      await sql()`insert into ekapon.role_feature_access(account_type,feature_key,enabled) values('Admin','reports',false) on conflict(account_type,feature_key) do update set enabled=false`;
      expect((await call('GET',path,{cookie})).status).toBe(403);
    } finally {
      if(access)await sql()`update ekapon.role_feature_access set enabled=${access.enabled} where account_type='Admin' and feature_key='reports'`;
      else await sql()`delete from ekapon.role_feature_access where account_type='Admin' and feature_key='reports'`;
    }
    try {
      await sql()`update ekapon.accounts set archived_at=now() where id=${accountId}`;
      expect((await call('GET','/api/v1/dashboard/counts',{cookie})).status).toBe(401);
    } finally {await sql()`update ekapon.accounts set archived_at=null where id=${accountId}`;}
  });
  it('limits calendar data to the requested month and omits unrelated program payloads',async()=>{
    const id=`${tag}-program`;ids.push(id);
    const record={id,title:'Synthetic scoped calendar',date:'2099-11-20',barangay:barangay.name,barangayId:barangay.id,status:'Planned',owner:'PRIVATE-CANARY',pets:[{name:'PRIVATE-PET'}],privateNotes:'PRIVATE-NOTES'};
    await sql()`insert into ekapon.dashboard_records(dataset,record_id,record_data) values('programs',${id},${sql().json(record)})`;
    const legacyId=`${tag}-legacy-program`;ids.push(legacyId);
    await sql()`insert into ekapon.dashboard_records(dataset,record_id,record_data) values('programs',${legacyId},${sql().json({id:legacyId,title:'Synthetic legacy calendar date',start_date:'2099-11-21',barangay:barangay.name,status:'Planned'})})`;
    const november=success(await call('GET','/api/v1/calendar/events?month=2099-11',{cookie}));
    expect(november.data.some((row:{id:string})=>row.id===id)).toBe(true);
    expect(november.data.find((row:{id:string})=>row.id===legacyId)?.date).toBe('2099-11-21');
    expect(JSON.stringify(november)).not.toMatch(/PRIVATE-CANARY|PRIVATE-PET|PRIVATE-NOTES/);
    const october=success(await call('GET','/api/v1/calendar/events?month=2099-10',{cookie}));
    expect(october.data.some((row:{id:string})=>row.id===id)).toBe(false);
    expect(october.data.some((row:{id:string})=>row.id===legacyId)).toBe(false);
    const compact=success(await call('GET','/api/v1/reports?mode=options&compact=1',{cookie}));
    expect(compact.barangays.length).toBeGreaterThan(0);expect(compact.accounts).toEqual([]);expect(compact.pets).toEqual([]);
  });
});
