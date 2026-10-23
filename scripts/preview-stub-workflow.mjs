import http from 'node:http';
import net from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { preview } from 'vite';
import { applyLocalSchema } from './local-schema.mjs';
import { randomUUID } from 'node:crypto';
import { prepareAcceptancePractice } from './acceptance-practice.mjs';

// This preview deliberately never reads .env.local or opens .local-test-db.
const database = new PGlite({ extensions: { pgcrypto } });
const acceptance = process.argv.includes('--acceptance');
const rehearsal = acceptance && process.argv.includes('--rehearsal');
const uiPort=acceptance?(rehearsal?5180:5179):process.argv.includes('--registry')?5178:process.argv.includes('--insights')?5177:5176;
let acceptanceManifest;
let socketServer, apiServer, uiServer, censusReviewSubmissionId;
async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}
try {
  await database.waitReady;
  await applyLocalSchema(database);
  const port = await freePort();
  socketServer = new PGLiteSocketServer({ db: database, host: '127.0.0.1', port, maxConnections: 4 });
  await socketServer.start();
  Object.assign(process.env, { LOCAL_TEST_MODE: '1', NODE_ENV: 'test', DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${port}/postgres`, JWT_SECRET: acceptance ? `disposable-acceptance-${randomUUID()}` : 'local-stub-preview-only-never-for-deployment', ALLOWED_ORIGINS: `http://127.0.0.1:${uiPort}` });
  const { dispatchApi } = await import('../server/api-dispatch.ts');
  const { sessionCookie } = await import('../server/auth.ts');
  const { closeDb } = await import('../server/db.ts');
  apiServer = http.createServer((req, res) => { void dispatchApi(req, res); });
  await new Promise((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
  const apiBase = `http://127.0.0.1:${apiServer.address().port}`;
  const [host] = (await database.query('select id,name from ekapon.barangays order by id limit 1')).rows;
  const admin = (await database.query("insert into ekapon.accounts(username,account_type,first_name,last_name,password_hash) values ('localstubadmin','SuperAdmin',$1,$2,extensions.crypt('StubDemo!2026',extensions.gen_salt('bf',4))) returning id", [acceptance ? 'Practice' : 'Local', acceptance ? 'Super Admin' : 'Stub Admin'])).rows[0];
  const paravet = (await database.query("insert into ekapon.accounts(account_type,first_name,last_name,barangay_id,password_hash) values ('Paravet',$2,$3,$1,extensions.crypt('StubDemo!2026',extensions.gen_salt('bf',4))) returning id,account_key", [host.id, acceptance ? 'Practice' : 'Local', acceptance ? 'Paravet' : 'Stub Paravet'])).rows[0];
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const processes = ['Microchipping', 'Anti-Rabies Vaccine', 'Neuter/Spay'];
  const data = { id: 'local-stub-demo-program', title: acceptance ? '[PRACTICE] Pet Care Program' : 'Barangay Pet Care Program', date: today, location: 'City Veterinary Office Covered Court', barangay: host.name, barangayId: host.id, status: 'Open', processes, slots: acceptance ? 2 : 50, startTime: '08:00', endTime: '16:00' };
  const program = (await database.query("insert into ekapon.dashboard_records(dataset,record_id,record_data) values ('programs',$1,$2::jsonb) returning id", [data.id, JSON.stringify(data)])).rows[0];
  const campaign = (await database.query("insert into ekapon.program_interest_campaigns(reference,campaign_type,host_barangay_id,program_record_id,processes,status,created_by) values ('LOCAL-STUB-DEMO','program_day',$1,$2,$3,'scheduled',$4) returning id", [host.id, program.id, processes, admin.id])).rows[0];
  await database.query('insert into ekapon.program_interest_allowed_barangays(campaign_id,barangay_id,added_by) values ($1,$2,$3)', [campaign.id, host.id, admin.id]);
  const adminCookie = (await sessionCookie({ id: admin.id, type: 'SuperAdmin' }, 'full')).split(';')[0];
  const paravetCookie = (await sessionCookie({ id: paravet.id, type: 'Paravet' }, 'full')).split(';')[0];
  async function action(body, cookie = adminCookie) {
    const result = await fetch(`${apiBase}/api/v1/stub-workflow`, { method: 'POST', headers: { Origin: apiBase, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await result.json();
    if (!result.ok) throw new Error(JSON.stringify(payload));
    return payload;
  }
  const { batchId } = await action({ action: 'request-batch', campaignId: campaign.id, quantity: 12, recipientId: paravet.id }, paravetCookie);
  await action({ action: 'review-batch', batchId, decision: 'approve', quantity: 12 });
  await action({ action: 'confirm-print', batchId });
  await action({ action: 'handover', batchId });
  const stub = (await database.query('select id,code from ekapon.stub_tickets where batch_id=$1 order by id limit 1', [batchId])).rows[0];
  if (!acceptance) await action({ action: 'issue', stubId: stub.id, owner: { name: 'Demo Owner', mobile: '', address: 'Synthetic demonstration record', barangayId: host.id }, pets: [{ name: 'Milo', species: 'Dog', sex: 'Male', ageMonths: 24, processes: ['Microchipping', 'Anti-Rabies Vaccine'] }, { name: 'Luna', species: 'Cat', sex: 'Female', ageMonths: 18, processes: ['Neuter/Spay'] }] }, paravetCookie);
  if(process.argv.includes('--insights')){
    const fixtures=[
      ['owners','insights-owner-1',{name:'Mara Santos',barangay:host.name,address:'Synthetic address A',mobile:'09171234567'}],
      ['owners','insights-owner-2',{name:'mara  santos',barangay:host.name,address:'Synthetic address B',mobile:''}],
      ['owners','insights-owner-3',{name:'Leo Reyes',barangay:host.name,address:'Synthetic address C',mobile:'09181234567'}],
      ['pets','insights-pet-1',{petName:'Bantay',species:'Dog',sex:'Male',age_months:24,owner_id:'insights-owner-1',owner:'Mara Santos',barangay:host.name}],
      ['pets','insights-pet-2',{petName:'bantay',species:'Dog',sex:'Male',owner_id:'insights-owner-1',owner:'Mara Santos',barangay:host.name}],
      ['pets','insights-pet-3',{petName:'Muning',species:'Cat',sex:'Female',age_months:12,owner_id:'insights-owner-3',owner:'Leo Reyes',barangay:host.name}],
      ['pets','insights-pet-4',{petName:'Puti',species:'Cat',sex:'Female',barangay:host.name}],
      ['participants','practice-historical-participant',{name:'Practice Historical Participant',petName:'Historical Bantay',barangay:host.name,date:'2025-10-01',program:'Historical paper program',status:'Recorded'}],
      ['services','practice-historical-service',{clientName:'Practice Historical Owner',petName:'Historical Muning',barangay:host.name,date:'2025-10-01',service:'Anti-Rabies Vaccine',status:'Completed',recordOrigin:'Historical CSV import'}],
    ];
    for(const [dataset,id,record] of fixtures)await database.query('insert into ekapon.dashboard_records(dataset,record_id,record_data) values($1,$2,$3::jsonb)',[dataset,id,JSON.stringify({id,...record})]);
    if (!acceptance) {
      await action({action:'redeem',stubId:stub.id,requestId:randomUUID(),attendedOn:today,owner:{name:'Demo Owner',mobile:'',address:'Synthetic demonstration record',barangayId:host.id},pets:[{name:'Milo',species:'Dog',sex:'Male',ageMonths:24,processes:['Microchipping','Anti-Rabies Vaccine'],outcome:'Completed',processOutcomes:{Microchipping:'Completed','Anti-Rabies Vaccine':'Deferred'}},{name:'Luna',species:'Cat',sex:'Female',ageMonths:18,processes:['Neuter/Spay'],outcome:'Completed'}]},paravetCookie);
      await action({action:'walk-in',campaignId:campaign.id,requestId:randomUUID(),attendedOn:today,owner:{name:'Mara Santos',mobile:'09171234567',address:'Synthetic address A',barangayId:host.id},pets:[{name:'Bantay',species:'Dog',sex:'Male',ageMonths:24,processes:['Anti-Rabies Vaccine'],outcome:'Completed'}]},paravetCookie);
    }
  }
  if(process.argv.includes('--registry')){
    // Synthetic census records exercise the same approval API and publication triggers as production.
    const r=await fetch(`${apiBase}/api/v1/census/submissions`,{method:'POST',headers:{Origin:apiBase,Cookie:paravetCookie,'Content-Type':'application/json'},body:JSON.stringify({label:'Practice census for approval',censusDate:today,source:'csv',householdsVisited:1,owners:[{ownerName:'Practice Census Owner',address:'Synthetic practice address',pets:[{petName:'Practice Mochi',species:'Cat',sex:'Female',ageMonths:24,sterilized:null,vaccine1st:null,vaccine2nd:null,vaccine3rd:null,booster:null,laps:null}]}]})});
    if(!r.ok)throw new Error(`Census preview seed failed: ${r.status}`);
    const {submission}=await r.json();
    const details=await (await fetch(`${apiBase}/api/v1/census/submissions/${submission.id}`,{headers:{Cookie:adminCookie}})).json();
    for(const [suffix,body] of [['decisions',{decisions:details.owners.map(o=>({ownerId:o.id,decision:'new'}))}],['review',{decision:'approve',note:'Synthetic practice approval'}]]){
      if(suffix==='review')body.reviewToken=(await (await fetch(`${apiBase}/api/v1/census/submissions/${submission.id}/decisions`,{headers:{Cookie:adminCookie}})).json()).token;
      const saved=await fetch(`${apiBase}/api/v1/census/submissions/${submission.id}/${suffix}`,{method:suffix==='decisions'?'PUT':'POST',headers:{Origin:apiBase,Cookie:adminCookie,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!saved.ok)throw new Error(`Census preview approval failed: ${saved.status}`);
    }
    const practice=await fetch(`${apiBase}/api/v1/census/submissions`,{method:'POST',headers:{Origin:apiBase,Cookie:paravetCookie,'Content-Type':'application/json'},body:JSON.stringify({label:'Practice census review — match and new owner',censusDate:today,source:'csv',householdsVisited:2,owners:[{ownerName:'Practice Census Owner',address:'Synthetic updated practice address',contact:'09171234567',pets:[{petName:'Practice Mochi',species:'Cat',sex:'Female',ageMonths:25,sterilized:null,vaccine1st:true,vaccine2nd:null,vaccine3rd:null,booster:null,laps:null}]},{ownerName:'Practice New Owner',address:'Synthetic new owner address',pets:[{petName:'Practice Bantay',species:'Dog',sex:'Male',ageMonths:0,sterilized:null,vaccine1st:null,vaccine2nd:false,vaccine3rd:null,booster:null,laps:null}]}]})});
    if(!practice.ok)throw new Error(`Census review practice seed failed: ${practice.status}`);
    censusReviewSubmissionId=(await practice.json()).submission.id;
    // Give sidebar badges both a current task and changes attributed to another synthetic staff member.
    await action({action:'request-batch',campaignId:campaign.id,quantity:6,recipientId:paravet.id},paravetCookie);
    const editor=(await database.query("insert into ekapon.accounts(username,account_type,first_name,last_name,password_hash) values('localbadgeeditor','Admin','Practice','Editor',extensions.crypt('StubDemo!2026',extensions.gen_salt('bf',4))) returning id")).rows[0];
    await database.exec('begin');
    await database.query("select set_config('app.account_id',$1,true)",[String(editor.id)]);
    await database.query("update ekapon.dashboard_records set record_data=record_data||'{\"remarks\":\"Updated by another synthetic staff member for badge testing\"}'::jsonb where dataset='pets' and record_id='insights-pet-4'");
    await database.query("insert into ekapon.dashboard_records(dataset,record_id,record_data) values('respondents','practice-badge-respondent',$1::jsonb)",[JSON.stringify({id:'practice-badge-respondent',name:'Practice Respondent',barangay:host.name,address:'Synthetic badge demonstration address'})]);
    await database.exec('commit');
    const visitDraft={requestId:randomUUID(),ownerId:'insights-owner-3',servedOn:today,location:'Synthetic local clinic',provider:'Practice veterinarian',note:'Synthetic standalone visit for local testing',pets:[{petId:'insights-pet-3',procedures:[{process:'Microchipping',outcome:'Completed'},{process:'Anti-Rabies Vaccine',outcome:'Deferred'},{process:'Neuter/Spay',outcome:'Not eligible'}]}]};
    const reviewVisit=await fetch(`${apiBase}/api/v1/field-records`,{method:'POST',headers:{Origin:apiBase,Cookie:adminCookie,'Content-Type':'application/json'},body:JSON.stringify({action:'preview',draft:visitDraft})});
    if(!reviewVisit.ok)throw new Error(`Standalone preview seed failed: ${reviewVisit.status}`);
    const visitToken=(await reviewVisit.json()).token;
    const savedVisit=await fetch(`${apiBase}/api/v1/field-records`,{method:'POST',headers:{Origin:apiBase,Cookie:adminCookie,'Content-Type':'application/json'},body:JSON.stringify({action:'save',draft:visitDraft,token:visitToken})});
    if(!savedVisit.ok)throw new Error(`Standalone save seed failed: ${savedVisit.status}`);
    const deferredDraft={...visitDraft,requestId:randomUUID(),ownerId:'insights-owner-1',provider:'Practice deferred-only provider',note:'Synthetic visit with no completed procedure',pets:[{petId:'insights-pet-1',procedures:[{process:'Microchipping',outcome:'Deferred'}]}]};
    const deferredReview=await fetch(`${apiBase}/api/v1/field-records`,{method:'POST',headers:{Origin:apiBase,Cookie:adminCookie,'Content-Type':'application/json'},body:JSON.stringify({action:'preview',draft:deferredDraft})});
    if(!deferredReview.ok)throw new Error(`Deferred visit preview failed: ${deferredReview.status}`);
    const deferredSave=await fetch(`${apiBase}/api/v1/field-records`,{method:'POST',headers:{Origin:apiBase,Cookie:adminCookie,'Content-Type':'application/json'},body:JSON.stringify({action:'save',draft:deferredDraft,token:(await deferredReview.json()).token})});
    if(!deferredSave.ok)throw new Error(`Deferred visit save failed: ${deferredSave.status}`);
    const QRCode=await import('qrcode');
    const available=(await database.query("select code from ekapon.stub_tickets where batch_id=$1 and status='Available' order by id limit 1",[batchId])).rows[0];
    if (!acceptance) { await mkdir('output',{recursive:true});await QRCode.toFile('output/practice-stub-qr.png',available.code,{width:600,margin:4}); }
  }
  const shiftedDate = (days) => new Date(Date.parse(`${today}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  for (const [suffix, days, status, title] of [['upcoming', 7, 'Planned', 'Community Animal Care Day'], ['recent', -7, 'Completed', 'Recent Barangay Pet Care Program']]) {
    const record = { ...data, id: `local-program-${suffix}`, date: shiftedDate(days), title, status };
    const saved = (await database.query("insert into ekapon.dashboard_records(dataset,record_id,record_data) values('programs',$1,$2::jsonb) returning id", [record.id, JSON.stringify(record)])).rows[0];
    if (suffix === 'recent') await database.query('insert into ekapon.program_runtime(program_record_id,actual_started_at,actual_finished_at,updated_by) values($1,$2,$3,$4)', [saved.id, `${record.date}T08:30:00+08:00`, `${record.date}T17:00:00+08:00`, admin.id]);
  }
  if (acceptance) acceptanceManifest = await prepareAcceptancePractice({ database, apiBase, host, admin, paravet, program, campaign, batchId, stub, today, censusReviewSubmissionId, uiPort, rehearsal });
  uiServer = await preview({ preview: { host: '127.0.0.1', port: uiPort, strictPort: true, proxy: { '/api': apiBase } } });
  const address = uiServer.httpServer.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  await mkdir('tmp', { recursive: true });
  if (!acceptance) await writeFile(process.argv.includes('--registry')?'tmp/registry-preview.json':'tmp/stub-preview.json', JSON.stringify({ baseUrl, username: 'localstubadmin', password: 'StubDemo!2026', paravetKey: paravet.account_key, code: stub.code, campaignId: campaign.id, batchId, censusReviewSubmissionId }, null, 2));
  else console.log(`Acceptance practice ready: ${baseUrl} (${acceptanceManifest.host.name}); manifest: tmp/acceptance-${rehearsal ? 'rehearsal' : 'preview'}.json`);
  console.log(`Disposable program workspace: ${baseUrl}/program-day`);
  console.log(`Disposable stub preview: ${baseUrl}/stubs`);
  if(process.argv.includes('--insights'))console.log(`Disposable Insights preview: ${baseUrl}/reports`);
  if(process.argv.includes('--registry'))console.log(`Disposable registry preview: ${baseUrl}/registry/owners`);
  console.log('Synthetic Admin: localstubadmin / StubDemo!2026');
  let stopping = false;
  const stop = async () => {
    if (stopping) return; stopping = true;
    await new Promise((resolve) => uiServer.httpServer.close(resolve));
    await new Promise((resolve) => apiServer.close(resolve));
    await closeDb(); await socketServer.stop(); await database.close();
  };
  process.once('SIGINT', () => { void stop(); });
  process.once('SIGTERM', () => { void stop(); });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (uiServer) await new Promise((resolve) => uiServer.httpServer.close(resolve));
  if (apiServer) await new Promise((resolve) => apiServer.close(resolve));
  if (socketServer) await socketServer.stop();
  await database.close();
  process.exitCode = 1;
}
