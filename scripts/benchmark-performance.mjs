import http from 'node:http';
import net from 'node:net';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { applyLocalSchema } from './local-schema.mjs';

// Always a fresh in-memory database. Never load .env files or .local-test-db.
const label = process.argv[2] ?? 'current';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Use a simple benchmark label.');
const database = new PGlite({ extensions: { pgcrypto } });
let sockets, server, closeDb;
const rounded = (value) => Math.round(value * 100) / 100;
const percentile = (values, fraction) => [...values].sort((a,b) => a-b)[Math.ceil(values.length * fraction) - 1];
try {
  await database.waitReady; await applyLocalSchema(database);
  console.log('Preparing 10,000 owners, 20,000 pets, 50,000 services, and 100 programs in disposable memory.');
  const staff = (await database.query("insert into ekapon.accounts(username,account_type,first_name,last_name) select 'synthetic-benchmark-'||i,'Admin','Synthetic','Benchmark '||i from generate_series(1,10) i returning id")).rows;
  // Seed in one transaction. Normal audit triggers and constraints stay enabled.
  await database.exec(`begin;
    insert into ekapon.dashboard_records(dataset,record_id,record_data)
    select 'owners','BENCH-O-'||i,jsonb_build_object('id','BENCH-O-'||i,'name','Synthetic Owner '||i,'barangay',b.name,'mobile','','address','Synthetic benchmark address')
    from generate_series(1,10000) i join ekapon.barangays b on b.id=(i%62)+1;
    insert into ekapon.dashboard_records(dataset,record_id,record_data)
    select 'pets','BENCH-P-'||i,jsonb_build_object('id','BENCH-P-'||i,'petName','Synthetic Pet '||i,'owner_id','BENCH-O-'||((i-1)/2+1),'owner','Synthetic Owner '||((i-1)/2+1),'barangay',b.name,'species',case when i%2=0 then 'Dog' else 'Cat' end,'sex',case when i%3=0 then 'Male' else 'Female' end,'date',to_char(date '2025-01-01'+(i%650),'YYYY-MM-DD'))
    from generate_series(1,20000) i join ekapon.barangays b on b.id=(((i-1)/2+1)%62)+1;
    insert into ekapon.dashboard_records(dataset,record_id,record_data)
    select 'services','BENCH-S-'||i,jsonb_build_object('id','BENCH-S-'||i,'owner','Synthetic Owner '||((i-1)%10000+1),'petName','Synthetic Pet '||((i-1)%20000+1),'barangay',b.name,'species',case when i%2=0 then 'Dog' else 'Cat' end,'sex',case when i%3=0 then 'Male' else 'Female' end,'status','Completed','outcome','Completed','service',case when i%3=0 then 'Neuter/Spay' when i%3=1 then 'Anti-Rabies Vaccine' else 'Microchipping' end,'date',to_char(date '2025-01-01'+(i%650),'YYYY-MM-DD'))
    from generate_series(1,50000) i join ekapon.barangays b on b.id=(((i-1)%10000+1)%62)+1;
    insert into ekapon.dashboard_records(dataset,record_id,record_data)
    select 'programs','BENCH-G-'||i,jsonb_build_object('id','BENCH-G-'||i,'title','Synthetic Program '||i,'date',to_char((now() at time zone 'Asia/Manila')::date+(i%28),'YYYY-MM-DD'),'barangay',b.name,'barangayId',b.id,'location','Synthetic covered court','status','Open','processes',jsonb_build_array('Microchipping','Anti-Rabies Vaccine','Neuter/Spay'),'startTime','08:00','endTime','16:00','slots',100)
    from generate_series(1,100) i join ekapon.barangays b on b.id=(i%62)+1;
    insert into ekapon.program_interest_campaigns(reference,campaign_type,host_barangay_id,program_record_id,processes,status,created_by)
    select 'BENCH-C-'||d.id,'program_day',(d.record_data->>'barangayId')::int,d.id,array['Microchipping','Anti-Rabies Vaccine','Neuter/Spay'],'scheduled',${staff[0].id}
    from ekapon.dashboard_records d where dataset='programs';
    analyze ekapon.dashboard_records; analyze ekapon.program_interest_campaigns;
    commit;`);
  const probe = net.createServer();
  await new Promise((resolve,reject) => { probe.once('error',reject); probe.listen(0,'127.0.0.1',resolve); });
  const port = probe.address().port; await new Promise((resolve) => probe.close(resolve));
  sockets = new PGLiteSocketServer({ db: database, host:'127.0.0.1', port, maxConnections:4 }); await sockets.start();
  Object.assign(process.env,{ LOCAL_TEST_MODE:'1',NODE_ENV:'test',DATABASE_URL:`postgres://postgres:postgres@127.0.0.1:${port}/postgres`,JWT_SECRET:'synthetic-benchmark-only-not-for-deployment' });
  const importStart = performance.now();
  const { dispatchApi } = await import('../server/api-dispatch.ts');
  const dispatcherImportMs = rounded(performance.now()-importStart);
  const { sessionCookie } = await import('../server/auth.ts');
  ({ closeDb } = await import('../server/db.ts'));
  const cookies = await Promise.all(staff.map(async (person) => (await sessionCookie({id:person.id,type:'Admin'},'full')).split(';')[0]));
  server = http.createServer((req,res) => { void dispatchApi(req,res); });
  await new Promise((resolve) => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const year = new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'}).slice(0,4);
  const month = new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'}).slice(0,7);
  const paths = ['/dashboard/counts',`/analytics?year=${year}`,'/records/owners?pageSize=20&q=Synthetic%20Owner%20999','/program-workspace?group=upcoming&pageSize=12',`/calendar/events?month=${month}`];
  async function request(path,index=0) {
    const start = performance.now();
    const response = await fetch(`${base}/api/v1${path}`,{headers:{Cookie:cookies[index]}});
    const body = await response.text(); if(!response.ok) throw new Error(`${path}: ${response.status} ${body}`);
    return { path,ms:rounded(performance.now()-start),bytes:Buffer.byteLength(body),gzipBytes:gzipSync(body).length };
  }
  const firstRequest = await request(paths[0]);
  const warm = []; for(const path of paths) warm.push(await request(path));
  const forcedFresh = []; for(const path of paths) forcedFresh.push(await request(`${path}${path.includes('?') ? '&' : '?'}fresh=1`));
  console.log('Measuring ten simultaneous staff sessions, each visiting the same five views.');
  const concurrent = [];
  await Promise.all(cookies.map(async (_,index) => { for(const path of paths) concurrent.push(await request(path,index)); }));
  const assets = [];
  for(const name of await readdir('dist/assets')) if(name.endsWith('.js')) {
    const bytes = await readFile(`dist/assets/${name}`); assets.push({name,bytes:bytes.length,gzipBytes:gzipSync(bytes).length});
  }
  const result = {label,synthetic:true,dataset:{owners:10000,pets:20000,services:50000,programs:100,staff:10},dispatcherImportMs,firstRequest,warm,forcedFresh,
    concurrent:{requests:concurrent.length,p50Ms:rounded(percentile(concurrent.map((r)=>r.ms),.5)),p95Ms:rounded(percentile(concurrent.map((r)=>r.ms),.95)),maxMs:rounded(Math.max(...concurrent.map((r)=>r.ms)))},
    assets:assets.sort((a,b)=>b.bytes-a.bytes),limitations:['Local PGlite, not Supabase/Vercel','One local API database connection; staff requests queue','HTTP response sizes exclude headers/TLS; gzip sizes are estimates','Synthetic records do not establish real production throughput']};
  await mkdir('output/performance',{recursive:true});
  await writeFile(`output/performance/${label}.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify({label,dispatcherImportMs,firstRequest,warm,forcedFresh,concurrent:result.concurrent}));
} finally {
  if(server) await new Promise((resolve)=>server.close(resolve));
  if(closeDb) await closeDb(); if(sockets) await sockets.stop(); await database.close();
}
