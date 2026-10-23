import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { writeFile } from 'node:fs/promises';
const db=new PGlite('./.local-test-db',{extensions:{pgcrypto}});
try{
 await db.waitReady;
 const rows=(await db.query("select dataset,count(*)::int as count from ekapon.dashboard_records where not archived and record_data->>'_referenceBatch'='sjdm-reference-20260926' group by dataset order by dataset")).rows;
 const [bounds]=(await db.query("select count(*)::int as invalid from ekapon.dashboard_records where record_data->>'_referenceBatch'='sjdm-reference-20260926' and coalesce(record_data->>'date',record_data->>'registration_date','2021-01-01') not between '2021-01-01' and '2026-09-26'")).rows;
 const [links]=(await db.query("select count(*)::int as invalid from ekapon.dashboard_records p where p.dataset='pets' and not p.archived and p.record_data->>'_referenceBatch'='sjdm-reference-20260926' and not exists(select 1 from ekapon.dashboard_records o where o.dataset='owners' and not o.archived and o.record_id=p.record_data->>'owner_id')")).rows;
 const [mocks]=(await db.query("select count(*)::int as active from ekapon.dashboard_records where dataset<>'paravets' and not archived and (record_data->>'_sampleData'='true' or concat_ws(' ',record_data->>'name',record_data->>'owner',record_data->>'petName',record_data->>'title') ~* '(sample|simulation|mock|tester)')")).rows;
 const [canonical]=(await db.query("select count(*)::int as active from ekapon.registry_owners where archived_at is null and owner_name ~* '(sample|simulation|mock|tester)'")).rows;
 if(bounds.invalid||links.invalid||mocks.active||canonical.active)throw new Error('Reference data verification failed.');
 const result={generatedRecords:rows,datesOutsideRequestedRange:bounds.invalid,brokenOwnerLinks:links.invalid,activeLegacyMocks:mocks.active,activeCanonicalMockOwners:canonical.active,verifiedAt:new Date().toISOString()};
 await writeFile('output/local-data-replacement/verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await db.close();}
