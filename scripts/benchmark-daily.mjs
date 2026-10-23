import http from 'node:http';
import net from 'node:net';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { applyLocalSchema } from './local-schema.mjs';

// Always creates disposable memory. Never imports dotenv or reads a database URL from a file.
const label = process.argv[2] ?? 'daily-current';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Use a simple benchmark label.');
const database = new PGlite({ extensions: { pgcrypto } });
let sockets, server, closeDb;
const round = n => Math.round(n * 100) / 100;
const percentile = (values, fraction) => [...values].sort((a,b) => a-b)[Math.ceil(values.length * fraction)-1];
try {
  await database.waitReady; await applyLocalSchema(database);
  console.log('Seeding current daily workflows in disposable memory; normal constraints and audit triggers remain enabled.');
  const staff = (await database.query(`insert into ekapon.accounts(username,account_type,first_name,last_name,barangay_id)
    select case when i<=5 then 'daily-bench-'||i end,case when i<=5 then 'Admin'::ekapon.account_type else 'Paravet'::ekapon.account_type end,
      'Synthetic','Daily Staff '||i,case when i>5 then i-5 end from generate_series(1,10) i returning id,account_type,barangay_id`)).rows;
  const admin = staff.find(a => a.account_type === 'Admin').id;
  const field = staff.find(a => a.account_type === 'Paravet').id;
  await database.exec(`begin;
    create temporary table bench_people as select i,b.id as area,b.name as barangay,
      jsonb_build_object('name','Synthetic Owner '||i,'mobile','','address','Synthetic benchmark address','barangayId',b.id,'barangay',b.name) as owner,
      jsonb_build_array(jsonb_build_object('name','Synthetic Pet '||(i*2-1),'species','Dog','processes',jsonb_build_array('Microchipping'),'outcome','Completed'),
        jsonb_build_object('name','Synthetic Pet '||(i*2),'species','Cat','processes',jsonb_build_array('Anti-Rabies Vaccine'),'outcome','Completed')) as pets
      from generate_series(1,10000) i join ekapon.barangays b on b.id=((i-1)%62)+1;
    insert into ekapon.dashboard_records(dataset,record_id,record_data)
      select 'owners','DAILY-O-'||i,owner||jsonb_build_object('id','DAILY-O-'||i,'contact','','importNotes',repeat('Synthetic retained workbook note. ',40)) from bench_people;
    insert into ekapon.dashboard_records(dataset,record_id,record_data)
      select 'pets','DAILY-P-'||(i*2-j),jsonb_build_object('id','DAILY-P-'||(i*2-j),'petName','Synthetic Pet '||(i*2-j),'owner_id','DAILY-O-'||i,
        'owner',owner->>'name','barangay',barangay,'species',case when j=1 then 'Dog' else 'Cat' end,'sex',null,'age_months',0,
        'importNotes',repeat('Synthetic retained workbook note. ',40)) from bench_people cross join generate_series(0,1) j;
    insert into ekapon.dashboard_records(dataset,record_id,record_data)
      select 'programs','DAILY-G-'||i,jsonb_build_object('id','DAILY-G-'||i,'title','Synthetic Program '||i,
        'date',to_char((now() at time zone 'Asia/Manila')::date+case when i>62 then 7 else 0 end,'YYYY-MM-DD'),
        'barangay',b.name,'barangayId',b.id,'location','Synthetic covered court','status','Open','processes',jsonb_build_array('Microchipping','Anti-Rabies Vaccine'),
        'startTime','08:00','endTime','16:00','slots',500)
      from generate_series(1,100) i join ekapon.barangays b on b.id=((i-1)%62)+1;
    insert into ekapon.program_interest_campaigns(reference,campaign_type,host_barangay_id,program_record_id,processes,status,created_by)
      select d.record_id,'program_day',(d.record_data->>'barangayId')::int,d.id,array['Microchipping','Anti-Rabies Vaccine'],'scheduled',${admin}
      from ekapon.dashboard_records d where dataset='programs';
    create temporary table bench_programs as select c.id as campaign_id,c.program_record_id,c.host_barangay_id as area,d.record_data as program
      from ekapon.program_interest_campaigns c join ekapon.dashboard_records d on d.id=c.program_record_id where d.record_id ~ '^DAILY-G-([1-9]|[1-5][0-9]|6[0-2])$';
    insert into ekapon.program_interest_allowed_barangays(campaign_id,barangay_id,added_by) select campaign_id,area,${admin} from bench_programs;
    insert into ekapon.program_interest_people(campaign_id,owner_name,mobile,residence_barangay_id,pets,created_by)
      select g.campaign_id,p.owner->>'name',null,p.area,p.pets,${field} from bench_people p join bench_programs g on g.area=p.area;
    insert into ekapon.program_attendance(request_id,payload_hash,campaign_id,source,owner_snapshot,owner_identity,owner_barangay_id,pets_snapshot,program_snapshot,attended_on,encoded_by,encoded_by_name,created_at)
      select gen_random_uuid(),repeat('a',64),g.campaign_id,'Walk-in',p.owner,'synthetic-'||v.n,p.area,p.pets,g.program,
        (now() at time zone 'Asia/Manila')::date,${admin},'Synthetic Admin',now()-(v.n||' seconds')::interval
      from generate_series(1,15000) v(n) join bench_people p on p.i=((v.n-1)%10000)+1 join bench_programs g on g.area=p.area;
    insert into ekapon.standalone_services(id,actor_id,payload_hash,owner_record_id,owner_snapshot,pets_snapshot,served_on,location,provider,created_at)
      select gen_random_uuid(),${admin},repeat('b',64),'DAILY-O-'||p.i,p.owner,
        jsonb_build_array(jsonb_build_object('id','DAILY-P-'||(p.i*2),'petName','Synthetic Pet '||(p.i*2),'species','Cat',
          'sex',null,'age_months',0,'procedures',jsonb_build_array(jsonb_build_object('process','Microchipping','outcome','Completed')))),
        (now() at time zone 'Asia/Manila')::date-(v.n%365),'Synthetic clinic','Synthetic veterinarian',now()-(v.n||' seconds')::interval
      from generate_series(1,15000) v(n) join bench_people p on p.i=((v.n-1)%10000)+1;
    insert into ekapon.dashboard_records(dataset,record_id,record_data)
      select 'services','QRATT-'||a.id||'-'||j,jsonb_build_object('id','QRATT-'||a.id||'-'||j,'workflow','qr-stubs-v1','attendanceId',a.id,
        'owner',a.owner_snapshot->>'name','name',a.owner_snapshot->>'name','barangay',b.name,'petName',a.pets_snapshot->j->>'name',
        'species',a.pets_snapshot->j->>'species','service',a.pets_snapshot->j->'processes'->>0,'date',a.attended_on,'status','Completed','outcome','Completed')
      from ekapon.program_attendance a join ekapon.barangays b on b.id=a.owner_barangay_id cross join generate_series(0,1) j;
    insert into ekapon.dashboard_records(dataset,record_id,record_data)
      select 'services','STANDALONE-'||s.id,jsonb_build_object('id','STANDALONE-'||s.id,'workflow','standalone-services-v1','standaloneId',s.id,
        'owner',s.owner_snapshot->>'name','name',s.owner_snapshot->>'name','barangay',s.owner_snapshot->>'barangay','petName',s.pets_snapshot->0->>'petName',
        'species','Cat','service','Microchipping','date',s.served_on,'status','Completed','outcome','Completed') from ekapon.standalone_services s;
    insert into ekapon.dashboard_records(dataset,record_id,record_data)
      select 'services','DAILY-H-'||v.n,jsonb_build_object('id','DAILY-H-'||v.n,'owner',p.owner->>'name','name',p.owner->>'name','barangay',p.barangay,
        'service','Anti-Rabies Vaccine','date','2025-01-01','status','Completed','outcome','Completed','sourceFile','synthetic-history.csv')
      from generate_series(1,5000) v(n) join bench_people p on p.i=v.n;
    insert into ekapon.stub_batches(reference,campaign_id,recipient_id,recipient_name,barangay_id,requested_quantity,approved_quantity,status,requested_by,program_snapshot,printed_at,handed_over_at)
      select 'DAILY-B-'||g.area,g.campaign_id,coalesce(a.id,${field}),'Synthetic Paravet',g.area,100,100,'Handed over',${admin},g.program,now(),now()
      from bench_programs g left join ekapon.accounts a on a.account_type='Paravet' and a.barangay_id=g.area;
    insert into ekapon.stub_tickets(batch_id,code) select b.id,'CVS1.'||substr(md5(b.id||'-'||i),1,22) from ekapon.stub_batches b cross join generate_series(1,100) i;
    create temporary table bench_sheets as select gen_random_uuid() as id,i,((i-1)%62)+1 as area from generate_series(1,1000) i;
    insert into ekapon.census_submissions(id,barangay_id,submitted_by,submitter_name,source,census_date,label,households_visited)
      select id,area,${field},'Synthetic Paravet','csv',(now() at time zone 'Asia/Manila')::date,'Synthetic Census '||i,10 from bench_sheets;
    insert into ekapon.census_owners(submission_id,line_no,owner_name,address,decision)
      select s.id,j,'Synthetic Census Owner '||(s.i*10+j),'Synthetic paper address','pending' from bench_sheets s cross join generate_series(1,10) j;
    insert into ekapon.census_pets(owner_id,line_no,pet_name,species,sex,age_months)
      select o.id,j,'Synthetic Census Pet '||j,'Dog','Male',12 from ekapon.census_owners o cross join generate_series(1,2) j;
    analyze ekapon.dashboard_records; analyze ekapon.program_interest_campaigns; analyze ekapon.program_attendance;
    analyze ekapon.program_interest_people; analyze ekapon.standalone_services; analyze ekapon.census_submissions;
    analyze ekapon.census_owners; analyze ekapon.census_pets; analyze ekapon.stub_batches; analyze ekapon.stub_tickets;
    commit;`);
  const programs = (await database.query(`select g.*,t.code from bench_programs g join ekapon.stub_batches b on b.campaign_id=g.campaign_id
    join lateral(select code from ekapon.stub_tickets where batch_id=b.id order by id limit 1)t on true order by g.area`)).rows;
  const probe = net.createServer();
  await new Promise((resolve,reject) => { probe.once('error',reject); probe.listen(0,'127.0.0.1',resolve); });
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  sockets = new PGLiteSocketServer({ db: database, host:'127.0.0.1', port, maxConnections:4 }); await sockets.start();
  Object.assign(process.env,{ LOCAL_TEST_MODE:'1',NODE_ENV:'test',DATABASE_URL:`postgres://postgres:postgres@127.0.0.1:${port}/postgres`,JWT_SECRET:'disposable-daily-benchmark-secret' });
  const { dispatchApi } = await import('../server/api-dispatch.ts');
  const { sessionCookie } = await import('../server/auth.ts');
  ({ closeDb } = await import('../server/db.ts'));
  const cookies = await Promise.all(staff.map(async a => (await sessionCookie({id:a.id,type:a.account_type},'full')).split(';')[0]));
  server = http.createServer((req,res) => { void dispatchApi(req,res); });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const specs = [
    {name:'dashboard',path:()=>'/dashboard/overview'},
    {name:'recent',path:()=>'/recently-added?includeHistory=false'},
    {name:'search-owner',path:()=>'/search?q=Synthetic%20Owner%20999'},
    {name:'search-pet',path:()=>'/search?q=Synthetic%20Pet%20999'},
    {name:'registry-list',path:()=>'/records/owners?summary=true&pageSize=25&sort=updatedAt&dir=desc'},
    {name:'registry-search',path:()=>'/records/owners?summary=true&pageSize=25&q=Synthetic%20Owner%20999'},
    {name:'owner-picker',path:()=>'/registry-workspace?kind=owners&q=Synthetic%20Owner%20999'},
    {name:'registry-detail',path:(_,p)=>`/registry-workspace?kind=owners&id=DAILY-O-${p.area}`},
    {name:'program',path:(_,p)=>`/program-workspace?id=${p.program_record_id}`},
    {name:'attendance',path:(_,p)=>`/stub-workflow?mode=attendance&campaignId=${p.campaign_id}&pageSize=12`},
    {name:'qr-lookup',path:(_,p)=>`/stub-workflow?mode=lookup&code=${p.code}`},
    {name:'census-list',path:()=>'/census/submissions?status=pending&pageSize=20'},
  ];
  async function request(spec,index=0) {
    const a=staff[index],p=programs.find(p=>Number(p.area)===(a.barangay_id??1));
    const started=performance.now();
    const response=await fetch(`${base}/api/v1${spec.path(a,p)}`,{headers:{Cookie:cookies[index]}});
    const body=await response.text();
    if(!response.ok) throw new Error(`${spec.name}: ${response.status} ${body}`);
    const result=JSON.parse(body);
    if(spec.name==='program' && result.program.id!==Number(p.program_record_id)) throw new Error('Wrong benchmark program.');
    if(spec.name==='attendance' && result.summary.owners<1) throw new Error('Attendance fixture was not populated.');
    return {name:spec.name,role:a.account_type,ms:round(performance.now()-started),bytes:Buffer.byteLength(body),gzipBytes:gzipSync(body).length};
  }
  const first=await request(specs[0]);
  const sequential=[];
  for(let trial=0;trial<3;trial++) for(const spec of specs) sequential.push({...await request(spec),trial});
  console.log('Measuring ten concurrent staff journeys through twelve current workflow reads.');
  const concurrent=[];
  await Promise.all(staff.map(async(_,i)=>{for(const spec of specs)concurrent.push(await request(spec,i));}));
  const summarize=(rows)=>({requests:rows.length,p50Ms:round(percentile(rows.map(r=>r.ms),.5)),p95Ms:round(percentile(rows.map(r=>r.ms),.95)),maxMs:round(Math.max(...rows.map(r=>r.ms)))});
  const byRead=specs.map(s=>({name:s.name,...summarize(sequential.filter(r=>r.name===s.name)),bytes:sequential.find(r=>r.name===s.name).bytes,gzipBytes:sequential.find(r=>r.name===s.name).gzipBytes}));
  // Inspect actual query plans after timing, so diagnostics do not warm measured reads.
  const {sql}=await import('../server/db.ts');
  const {searchRecords}=await import('../server/search.ts');
  const session={id:admin,type:'Admin',scope:'full',key:null,username:'daily-bench',name:'Synthetic Admin',barangayId:null,barangay:null,locale:'en',grants:[]};
  const plans={};
  for(const [name,term] of [['recent',''],['search','Synthetic Owner 999']]){
    let captured;
    const capture=Object.assign((...args)=>sql()(...args),{unsafe:async(statement,args)=>{captured={statement,args};return [];}});
    await searchRecords(capture,session,term,false,term?30:10);
    plans[name]=await sql().unsafe(`explain (analyze,buffers,format json) ${captured.statement}`,captured.args);
  }
  const apiClient=sql(),originalUnsafe=apiClient.unsafe;let listQuery;
  try{
    apiClient.unsafe=(statement,args,...options)=>{if(statement.includes('relationship_issue'))listQuery={statement,args};return originalUnsafe.call(apiClient,statement,args,...options);};
    await request(specs.find(s=>s.name==='registry-list'));
  }finally{apiClient.unsafe=originalUnsafe;}
  if(listQuery)plans.registry=await sql().unsafe(`explain (analyze,buffers,format json) ${listQuery.statement}`,listQuery.args);
  const assets=[];
  for(const name of await readdir('dist/assets')) if(name.endsWith('.js')) {const bytes=await readFile(`dist/assets/${name}`);assets.push({name,bytes:bytes.length,gzipBytes:gzipSync(bytes).length});}
  const result={label,fixtureVersion:1,synthetic:true,dataset:{owners:10000,pets:20000,completedServiceProjections:50000,attendanceVisits:15000,standaloneVisits:15000,historicalServices:5000,programs:100,interestPeople:10000,censusSubmissions:1000,censusOwners:10000,censusPets:20000,stubs:6200,staff:10},first,sequential,byRead,concurrent:{...summarize(concurrent),byRole:['Admin','Paravet'].map(role=>({role,...summarize(concurrent.filter(r=>r.role===role))}))},
    assets:assets.sort((a,b)=>b.bytes-a.bytes),limitations:['Fresh local PGlite, not Vercel/Supabase','One API database connection; concurrent requests queue','Three sequential trials per read; p95 is the maximum of three samples','Body bytes exclude headers/TLS; gzip sizes are estimates, not measured wire traffic','Synthetic fixture inserts are not approval/write throughput tests; mutation correctness is tested separately']};
  await mkdir('output/performance',{recursive:true}); await writeFile(`output/performance/${label}.json`,JSON.stringify(result,null,2));
  await writeFile(`output/performance/${label}-plans.json`,JSON.stringify(plans,null,2));
  console.log(JSON.stringify({label,first,byRead,concurrent:result.concurrent}));
} catch (error) {
  console.error('Daily benchmark failed:', error instanceof Error ? error.message : String(error)); process.exitCode=1;
} finally {
  if(server)await new Promise(resolve=>server.close(resolve));
  if(closeDb)await closeDb();if(sockets)await sockets.stop();await database.close();
}
