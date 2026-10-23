import postgres from 'postgres';
import { readFile,writeFile } from 'node:fs/promises';
// This maintenance command addresses only the explicitly local development server.
const q=postgres('postgres://postgres:postgres@127.0.0.1:5433/postgres',{max:1,prepare:false});
const pattern='(sample|simulation|mock|tester|(^|[[:space:]_-])(test|testing|demo|dummy|fixture|rehearsal|preview)([[:space:]_-]|$)|dito sa puso|be suck call)';
try{
 let check;
 for(let attempt=0;attempt<12;attempt++){try{[check]=await q`select count(*)::int as count from ekapon.dashboard_records where dataset='owners' and record_data->>'_referenceBatch'='sjdm-reference-20260926'`;break;}catch(e){if(!['ECONNRESET','ECONNREFUSED'].includes(e.code)||attempt===11)throw e;await new Promise(r=>setTimeout(r,3000));}}
 if(check.count!==500)throw new Error('Expected local reference dataset was not found. Cleanup aborted.');
 const result=await q.begin(async tx=>{
  await tx`select pg_advisory_xact_lock(hashtext('registry-owner-pet-writes'))`;
  const owners=await tx`update ekapon.registry_owners set archived_at=coalesce(archived_at,now()) where archived_at is null and owner_name ~* ${pattern} returning id`;
  const pets=await tx`update ekapon.registry_pets set archived_at=coalesce(archived_at,now()) where archived_at is null and (pet_name ~* ${pattern} or owner_id in(select id from ekapon.registry_owners where archived_at is not null)) returning id`;
  const submissions=await tx`update ekapon.census_submissions set status='withdrawn',reviewed_at=null where status<>'withdrawn' and (label ~* ${pattern} or id in(select source_submission_id from ekapon.registry_owners where owner_name ~* ${pattern})) returning id`;
  const rows=await tx`update ekapon.dashboard_records set archived=true,updated_at=now() where not archived and dataset<>'paravets' and coalesce(record_data->>'_referenceBatch','')<>'sjdm-reference-20260926' and (record_data->>'_sampleData'='true' or concat_ws(' ',record_id,record_data->>'name',record_data->>'owner',record_data->>'owner_name',record_data->>'petName',record_data->>'title',record_data->>'location',record_data->>'recordOrigin',record_data->>'program') ~* ${pattern}) returning dataset,record_id`;
  return {canonicalOwnersArchived:owners.length,canonicalPetsArchived:pets.length,mockCensusesWithdrawn:submissions.length,additionalLegacyRecordsArchived:rows.length};
 });
 await writeFile('output/local-data-replacement/follow-up-cleanup.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
}finally{await q.end();}
