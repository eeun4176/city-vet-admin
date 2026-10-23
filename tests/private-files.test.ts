import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { client, startServer } from './harness';
import { sql, closeDb } from '../server/db';
import { sessionCookie } from '../server/auth';
import { cleanupPrivateFiles } from '../server/privateFiles';

const nativeFetch=globalThis.fetch;
const storage=new Map<string,Uint8Array>();
let storageCalls=0,failStorage=false;
let call:ReturnType<typeof client>,close:()=>Promise<void>;
let admin:string,p1:string,p2:string,adminId:number;
const accounts:number[]=[],submissions:string[]=[],programs:number[]=[],campaigns:number[]=[];
let area:{id:number;name:string};
const tag=`Storage${randomUUID().slice(0,8)}`;
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const good=(r:any)=>{expect([200,201],JSON.stringify(r.json)).toContain(r.status);return r.json;};
beforeAll(async()=>{
  vi.stubEnv('FILE_STORAGE_DRIVER','supabase');
  vi.stubEnv('SUPABASE_URL','https://isolated-test.supabase.co');
  vi.stubEnv('SUPABASE_SECRET_KEY','sb_secret_isolated_test_only_do_not_deploy_12345');
  vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
    const url=String(input);
    if(!url.startsWith('https://isolated-test.supabase.co/storage/v1/'))return nativeFetch(input,init);
    storageCalls++;
    expect((init?.headers as Record<string,string>).apikey).toBe('sb_secret_isolated_test_only_do_not_deploy_12345');
    expect((init?.headers as Record<string,string>).Authorization).toBeUndefined();
    if(failStorage)return new Response('provider-sensitive-diagnostic',{status:503});
    const path=url.replace(/^.*\/storage\/v1\/object\/(?:authenticated\/)?ekapon-private\/?/,'');
    if(init?.method==='POST'){storage.set(path,new Uint8Array(init.body as Uint8Array));return new Response('{}');}
    if(init?.method==='DELETE'){for(const path of JSON.parse(String(init.body)).prefixes)storage.delete(path);return new Response('[]');}
    const bytes=storage.get(path);return bytes?new Response(new Uint8Array(bytes)):new Response('missing',{status:404});
  });
  const server=await startServer();call=client(server.base);close=server.close;
  [area]=await sql()`select id,name from ekapon.barangays order by id limit 1` as unknown as [typeof area];
  const [other]=await sql()`select id from ekapon.barangays where id<>${area.id} order by id limit 1`;
  const rows=await sql()`insert into ekapon.accounts(username,account_type,first_name,last_name,barangay_id)
    values(${tag},'Admin','File',${tag},null),(null,'Paravet','Own',${tag},${area.id}),(null,'Paravet','Other',${tag},${other.id}) returning id,account_type::text as type`;
  accounts.push(...rows.map(r=>r.id));adminId=rows[0].id;
  [admin,p1,p2]=await Promise.all(rows.map(async r=>(await sessionCookie({id:r.id,type:r.type},'full')).split(';')[0]));
});
afterAll(async()=>{
  failStorage=false;
  await sql()`delete from ekapon.census_submissions where id=any(${submissions}::uuid[])`;
  await sql()`delete from ekapon.stub_activity where campaign_id=any(${campaigns}::bigint[])`;
  await sql()`delete from ekapon.stub_tickets where batch_id in(select id from ekapon.stub_batches where campaign_id=any(${campaigns}::bigint[]))`;
  await sql()`delete from ekapon.stub_batches where campaign_id=any(${campaigns}::bigint[])`;
  await sql()`delete from ekapon.program_interest_activity where campaign_id=any(${campaigns}::bigint[])`;
  await sql()`delete from ekapon.program_interest_allowed_barangays where campaign_id=any(${campaigns}::bigint[])`;
  await sql()`delete from ekapon.program_interest_campaigns where id=any(${campaigns}::bigint[])`;
  await sql()`delete from ekapon.program_workspace_activity where program_record_id=any(${programs}::bigint[])`;
  await sql()`delete from ekapon.program_runtime where program_record_id=any(${programs}::bigint[])`;
  await sql()`delete from ekapon.dashboard_records where id=any(${programs}::bigint[]) or (dataset='paravets' and record_data->>'accountId'=any(${accounts.map(String)}::text[]))`;
  await sql()`delete from ekapon.accounts where id=any(${accounts}::bigint[])`;
  // Metadata in this disposable database is dedicated to these mocked Storage calls.
  await sql()`delete from ekapon.private_files`;
  if(close)await close();await closeDb();vi.restoreAllMocks();vi.unstubAllEnvs();
});
describe('private hosted uploads',()=>{
  it('stores a profile as an opaque private object, reads it only for the current account and clears its reference',async()=>{
    good(await call('PUT','/api/v1/auth/photo',{cookie:admin,json:{mimeType:'image/png',data:image.toString('base64')}}));
    const [row]=await sql()`select profile_photo,profile_file_id from ekapon.account_preferences where account_id=${adminId}`;
    expect(row.profile_photo).toBeNull();expect(row.profile_file_id).toBeTruthy();
    expect(good(await call('GET','/api/v1/auth/photo',{cookie:admin})).photo.data).toBe(image.toString('base64'));
    expect(good(await call('GET','/api/v1/auth/me',{cookie:admin})).account.profilePhoto).toBe(`data:image/png;base64,${image.toString('base64')}`);
    expect(good(await call('GET',`/api/v1/auth/photo?accountId=${adminId}`,{cookie:p2})).photo).toBeNull();
    good(await call('DELETE','/api/v1/auth/photo',{cookie:admin}));
  });
  it('checks census scope before any provider request and keeps attachment size metadata',async()=>{
    const result=good(await call('POST','/api/v1/census/submissions',{cookie:p1,json:{label:tag,censusDate:'2026-09-26',source:'image',owners:[]}}));
    const id=result.submission.id;submissions.push(id);
    const count=storageCalls;
    expect((await call('POST',`/api/v1/census/submissions/${id}/attachments`,{cookie:p2,json:{mime:'image/png',data:image.toString('base64')}})).status).toBe(404);
    expect(storageCalls).toBe(count);
    const attachment=good(await call('POST',`/api/v1/census/submissions/${id}/attachments`,{cookie:p1,json:{mime:'image/png',data:image.toString('base64')}}));
    const [row]=await sql()`select image,file_id from ekapon.census_attachments where id=${attachment.id}`;
    expect(row.image).toBeNull();expect(row.file_id).toBeTruthy();
    expect(good(await call('GET',`/api/v1/census/submissions/${id}`,{cookie:admin})).attachments[0].bytes).toBe(image.length);
    expect(good(await call('GET',`/api/v1/census/submissions/${id}/attachments/${attachment.id}`,{cookie:admin})).data).toBe(image.toString('base64'));
    const before=storageCalls;
    expect((await call('GET',`/api/v1/census/submissions/${id}/attachments/${attachment.id}`,{cookie:p2})).status).toBe(404);
    expect(storageCalls).toBe(before);
    await sql()`update ekapon.census_submissions set status='rejected',reviewed_at=now(),reviewer_name='Isolated review',review_note='Correct sheet' where id=${id}::uuid`;
    const copy=good(await call('POST',`/api/v1/census/submissions/${id}/resubmit`,{cookie:p1}));submissions.push(copy.id);
    expect((await sql()`select file_id from ekapon.census_attachments where submission_id=${copy.id}::uuid`)[0].file_id).toBe(row.file_id);
    await sql()`delete from ekapon.census_attachments where submission_id=${id}::uuid`;
    await sql()`update ekapon.private_files set created_at=now()-interval '2 hours'`;
    await cleanupPrivateFiles();
    expect(good(await call('GET',`/api/v1/census/submissions/${copy.id}/attachments/${(await sql()`select id from ekapon.census_attachments where submission_id=${copy.id}::uuid`)[0].id}`,{cookie:admin})).data).toBe(image.toString('base64'));
  });
  it('uses the same private storage for a PDF and denies another barangay before downloading',async()=>{
    const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});
    const program=good(await call('POST','/api/v1/program-workspace',{cookie:admin,json:{action:'create',schedule:{title:tag,date:today,location:'Test hall',hostBarangayId:area.id,startTime:'08:00',endTime:'12:00',slots:10,processes:['Microchipping'],status:'Open'}}}));
    programs.push(program.programId);campaigns.push(program.campaignId);
    const generated=good(await call('POST','/api/v1/stub-workflow',{cookie:admin,json:{action:'generate-batches',campaignId:program.campaignId,barangayIds:[area.id],quantity:1}}));
    const batchId=generated.batchIds[0],pdf=Buffer.from('%PDF-1.4\n%%EOF');
    good(await call('POST','/api/v1/stub-workflow',{cookie:admin,json:{action:'attach-pdf',batchId,filename:'review.pdf',data:pdf.toString('base64')}}));
    const [row]=await sql()`select external_pdf,external_pdf_file_id from ekapon.stub_batches where id=${batchId}`;
    expect(row.external_pdf).toBeNull();expect(row.external_pdf_file_id).toBeTruthy();
    expect(good(await call('GET',`/api/v1/stub-workflow?mode=pdf&batchId=${batchId}`,{cookie:p1})).data).toBe(pdf.toString('base64'));
    const before=storageCalls;expect((await call('GET',`/api/v1/stub-workflow?mode=pdf&batchId=${batchId}`,{cookie:p2})).status).toBe(404);expect(storageCalls).toBe(before);
  });
  it('fails safely on provider errors and retries orphan deletion without removing referenced files',async()=>{
    failStorage=true;
    const result=await call('PUT','/api/v1/auth/photo',{cookie:admin,json:{mimeType:'image/png',data:image.toString('base64')}});
    expect(result.status).toBe(503);expect(JSON.stringify(result.json)).not.toContain('provider-sensitive');
    expect((await sql()`select profile_file_id from ekapon.account_preferences where account_id=${adminId}`)[0].profile_file_id).toBeNull();
    await sql()`update ekapon.private_files set created_at=now()-interval '2 hours'`;
    const [{n}]=await sql()`select count(*)::int as n from ekapon.private_files`;
    await expect(cleanupPrivateFiles()).rejects.toMatchObject({code:'FILE_STORAGE_UNAVAILABLE'});
    expect((await sql()`select count(*)::int as n from ekapon.private_files`)[0].n).toBe(n);
    failStorage=false;expect(await cleanupPrivateFiles()).toBeGreaterThan(0);
    expect((await sql()`select count(*)::int as n from ekapon.private_files`)[0].n).toBe(2); // shared census photo + current stub PDF
  });
});
