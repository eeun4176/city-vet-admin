import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import net from 'node:net';
import { applyLocalSchema } from './local-schema.mjs';

// Fixed on-disk local target. Never read DATABASE_URL or connect to a hosted DB.
const root=resolve('.'),target=resolve(root,'.local-test-db');
if(target!==resolve(root,'.local-test-db'))throw new Error('Unexpected local data target.');
const listening=await new Promise(resolve=>{const socket=net.createConnection({host:'127.0.0.1',port:5433});socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',e=>{socket.destroy();if(e.code==='ECONNREFUSED')resolve(false);else resolve(true);});});
if(listening)throw new Error('Stop the local development database on port 5433 before replacing reference data.');
const db=new PGlite(target,{extensions:{pgcrypto}});
const norm=value=>String(value).normalize('NFKC').toLowerCase().replace(/[–—-]/g,'').replace(/\s/g,'');
const bad=/(sample|simulation|sampletester|mock|tester|^local paravet$|(?:^|[\s_-])(?:test|testing|demo|dummy|fixture|rehearsal|preview)(?:[\s_-]|$)|dito sa puso|be suck call)/i;
try{
 await db.waitReady;
 const source=JSON.parse(await readFile('samples/reference-owner-pets.json','utf8'));
 const areas=(await db.query('select id,name from ekapon.barangays')).rows;
 const alias={'Sapang Palay':'Sapang Palay Proper','San Martin':'San Martin I'};
 const unmapped=source.owners.filter(o=>!areas.some(a=>norm(a.name)===norm(alias[o.barangay]??o.barangay)));
 if(unmapped.length)throw new Error(`Unmapped barangays: ${[...new Set(unmapped.map(o=>o.barangay))].join(', ')}`);
 const questionable=(await db.query("select id,full_name as name,account_type as role from ekapon.accounts where account_type='Paravet' order by id")).rows.filter(a=>bad.test(a.name));
 const oldRecords=(await db.query('select id,dataset,record_id,record_data,archived from ekapon.dashboard_records')).rows.filter(r=>r.dataset!=='paravets'&&r.record_data._referenceBatch!=='sjdm-reference-20260926'&&(r.record_data._sampleData===true||bad.test([r.record_data.name,r.record_data.owner_name,r.record_data.owner,r.record_data.petName,r.record_data.title,r.record_data.program,r.record_data.location,r.record_data.label,r.record_id].join(' '))));
 const snapshot=await db.dumpDataDir('gzip');
 await mkdir('output/local-data-replacement',{recursive:true});
 const archive=`output/local-data-replacement/before-${Date.now()}.tar.gz`;
 await writeFile(archive,Buffer.from(await snapshot.arrayBuffer()));
 await db.exec('BEGIN');
 try{
  // Remove legacy mocks from active datasets without destroying retained history.
  if(oldRecords.length)await db.query('update ekapon.dashboard_records set archived=true,updated_at=now() where id=any($1::bigint[])',[oldRecords.map(r=>r.id)]);
  await db.query("update ekapon.census_submissions set status='withdrawn',reviewed_at=null where label ~* '(sample|simulation|mock|tester)' and status<>'withdrawn'");
  // Explicitly identified local mock census rows are withdrawn from review lists.
  // The complete previous state is retained in the before-change local snapshot.
  const oldSubmissions=(await db.query("select id,label,status from ekapon.census_submissions where label ~* '(sample|simulation|mock|tester)'")).rows;
  if(oldSubmissions.length)await db.query("update ekapon.registry_owners set archived_at=coalesce(archived_at,now()) where source_submission_id=any($1::uuid[])",[oldSubmissions.map(s=>s.id)]);
  await db.query("update ekapon.accounts set archived_at=coalesce(archived_at,now()) where account_type<>'Paravet' and username not in ('admin','localadmin','encoder') and (coalesce(username,'')||' '||full_name) ~* '(sample|simulation|mock|tester)'");
  await db.query("update ekapon.registry_owners set archived_at=coalesce(archived_at,now()) where owner_name ~* '(sample|simulation|mock|tester)'");
  await db.query("update ekapon.registry_pets set archived_at=coalesce(archived_at,now()) where pet_name ~* '(sample|simulation|mock|tester)' or owner_id in (select id from ekapon.registry_owners where archived_at is not null)");
  const common={_syntheticData:true,_referenceBatch:'sjdm-reference-20260926',dataProvenance:'Synthetic reference data supplied/generated for local development',asOf:source.through};
  let petCount=0,serviceCount=0;
  const save=async(dataset,id,data,date)=>db.query("insert into ekapon.dashboard_records(dataset,record_id,record_data,created_at,updated_at) values($1,$2,$3::jsonb,$4::timestamptz,$4::timestamptz) on conflict(dataset,record_id) do update set record_data=excluded.record_data,archived=false,updated_at=excluded.updated_at",[dataset,id,JSON.stringify({id,...data,...common}),`${date}T08:00:00+08:00`]);
  for(const owner of source.owners){
   const area=areas.find(a=>norm(a.name)===norm(alias[owner.barangay]??owner.barangay)),id=`REF-OWNER-${String(owner.sourceNumber).padStart(4,'0')}`;
   const {pets,...details}=owner;
   await save('owners',id,{...details,barangay:area.name,barangayId:area.id,sourceBarangay:owner.barangay,status:'Unverified reference record',source:'User supplied synthetic reference'},owner.registration_date);
   for(const [index,pet] of pets.entries()){
    const petId=`${id}-PET-${index+1}`;petCount++;
    await save('pets',petId,{...pet,owner_id:id,owner:owner.name,barangay:area.name,barangayId:area.id,registration_date:owner.registration_date,vaccine_1st:pet.vaccinationStatus==='Yes',sterilized:pet.sterilizationStatus==='Yes'},owner.registration_date);
    const first=new Date(`${owner.registration_date}T00:00:00Z`),last=new Date(`${source.through}T00:00:00Z`);
    const events=[{service:'Microchipping',date:owner.registration_date}];
    if(pet.vaccinationStatus==='Yes')events.push({service:'Anti-Rabies Vaccine',date:pet.vaccinationDate});
    if(pet.sterilizationStatus==='Yes')events.push({service:'Neuter/Spay',date:new Date(first.getTime()+Math.floor((last-first)*0.6)).toISOString().slice(0,10)});
    for(const [visit,{date,service}] of events.entries()){
     const serviceId=`${petId}-SERVICE-${visit+1}`;serviceCount++;
     await save('services',serviceId,{name:owner.name,owner:owner.name,owner_id:id,petName:pet.petName,pet_id:petId,species:pet.species,barangay:area.name,date,service,procedureType:service,process:service,status:'Completed',outcome:'Completed',recordOrigin:'Synthetic historical reference — not actual delivery'},date);
    }
   }
  }
  // Historical program examples stay within the user's date range.
  let programCount=0;
  for(let year=2021;year<=2026;year++)for(let month=1;month<=12;month++){
   const date=`${year}-${String(month).padStart(2,'0')}-15`;if(date>source.through)continue;
   const area=areas[(year+month)%areas.length];programCount++;
   await save('programs',`REF-PROGRAM-${year}-${String(month).padStart(2,'0')}`,{title:`Barangay veterinary service — ${area.name}`,date,status:'Completed',location:`${area.name} barangay hall`,barangay:area.name,barangayId:area.id,processes:['Anti-Rabies Vaccine','Microchipping','Neuter/Spay'],slots:100,startTime:'08:00',endTime:'12:00'},date);
  }
  await db.exec('COMMIT');
  await applyLocalSchema(db);
  await writeFile('output/local-data-replacement/review.json',JSON.stringify({backup:archive,range:{from:source.from,through:source.through},loaded:{owners:source.owners.length,pets:petCount,services:serviceCount,programs:programCount},legacyRecordsRemovedFromActiveLists:oldRecords.length,paravetsRetainedForNameCorrection:questionable,historicalMockCensusesRetained:oldSubmissions},null,2));
  const lines=['# Paravet names requiring correction','','Paravet accounts were retained. No replacement identities were invented.','',...questionable.map(a=>`- Account ${a.id}: ${a.name}`),'','Legacy mock operational records were archived out of active lists. The local before-change snapshot is recorded in review.json.','Approved mock census history remains identifiable; no claim of real census evidence is made.'];
  await writeFile('output/local-data-replacement/PARAVET-CORRECTIONS.md',lines.join('\n'));
  console.log(JSON.stringify({owners:source.owners.length,pets:petCount,services:serviceCount,programs:programCount,legacyRecordsRemovedFromActiveLists:oldRecords.length,paravetNamesForCorrection:questionable.length,range:[source.from,source.through]}));
 }catch(error){try{await db.exec('ROLLBACK');}catch{}throw error;}
}finally{await db.close();}
