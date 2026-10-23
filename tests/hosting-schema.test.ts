import { afterAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
// The installed package exposes this subpath at runtime; classic Node TS resolution misses its declaration.
// @ts-expect-error PGlite's conditional subpath types require a different resolver.
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { importChunks } from '../shared/importChunks';

const database = new PGlite({ extensions: { pgcrypto } });
afterAll(async()=>{ await database.close(); });
describe('empty hosting installation',()=>{
  it('installs the complete current schema atomically without default accounts or operational data',async()=>{
    await database.waitReady;
    const schema=await readFile('hosting/01-fresh-schema.sql','utf8');
    const manifest=JSON.parse(await readFile('hosting/schema-manifest.json','utf8'));
    expect(createHash('sha256').update(schema).digest('hex')).toBe(manifest.schemaSha256);
    expect(schema).not.toMatch(/CHANGE_ME_TO|\$2a\$12\$HEx1/);
    await database.exec(schema);
    const {rows}=await database.query<{accounts:number;records:number;barangays:number;drafts:boolean;files:boolean}>(`select
      (select count(*)::int from ekapon.accounts) as accounts,
      (select count(*)::int from ekapon.dashboard_records) as records,
      (select count(*)::int from ekapon.barangays) as barangays,
      to_regclass('ekapon.report_drafts') is not null as drafts,
      to_regclass('ekapon.private_files') is not null as files`);
    expect(rows[0]).toEqual({accounts:0,records:0,barangays:62,drafts:true,files:true});
    expect((await database.query<{rolcanlogin:boolean}>("select rolcanlogin from pg_roles where rolname='ekapon_api'")).rows[0].rolcanlogin).toBe(false);
  });
  it('requires private setup values, creates only one SuperAdmin and refuses repeated bootstrap',async()=>{
    const template=await readFile('hosting/02-configure-access.sql','utf8');
    await expect(database.exec(template)).rejects.toThrow('Replace all five placeholders');await database.exec('ROLLBACK;');
    const sql=template.replace('REPLACE_WITH_A_DISTINCT_RANDOM_API_PASSWORD','a-valid-isolated-test-api-password-123456')
      .replace('REPLACE_WITH_A_DISTINCT_RANDOM_ADMIN_PASSWORD','IsolatedAdmin!123456')
      .replace('REPLACE_WITH_YOUR_ADMIN_USERNAME','hosting-test-admin')
      .replace('REPLACE_WITH_YOUR_FIRST_NAME','Hosting').replace('REPLACE_WITH_YOUR_LAST_NAME','Test');
    await database.exec(sql);
    const {rows}=await database.query("select account_type::text,status::text from ekapon.accounts");
    expect(rows).toEqual([{account_type:'SuperAdmin',status:'Active'}]);
    await expect(database.exec(sql)).rejects.toThrow('accounts already exist');await database.exec('ROLLBACK;');
    const role=(await database.query<{allowed:boolean;hashes:boolean}>(`select
      has_schema_privilege('ekapon_api','ekapon','USAGE') as allowed,
      has_column_privilege('ekapon_api','ekapon.accounts','password_hash','SELECT') as hashes`)).rows[0];
    expect(role).toEqual({allowed:true,hashes:false});
  });
  it('refuses a fresh install on an existing schema without deleting its accounts',async()=>{
    await expect(database.exec(await readFile('hosting/01-fresh-schema.sql','utf8'))).rejects.toThrow('Fresh install refused');
    await database.exec('ROLLBACK;');
    expect((await database.query<{count:number}>('select count(*)::int as count from ekapon.accounts')).rows[0].count).toBe(1);
  });
  it('keeps requests within byte and record limits, including multibyte source data',()=>{
    const chunks=importChunks([{v:'中'.repeat(200)},{v:'中'.repeat(200)}],{label:'Example'},1000);
    expect(chunks.map(c=>c.length)).toEqual([1,1]);
    for(const records of chunks)expect(new TextEncoder().encode(JSON.stringify({label:'Example',records})).length).toBeLessThanOrEqual(1000);
    expect(importChunks(Array.from({length:201},(_,id)=>({id})),{}).map(c=>c.length)).toEqual([100,100,1]);
    expect(()=>importChunks([{v:'中'.repeat(1000)}],{},1000)).toThrow('One record is too large');
  });
  it('creates a private bounded bucket and refuses unreviewed Storage policies or an existing bucket',async()=>{
    await database.exec(`create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id integer);alter table storage.objects enable row level security;
      create policy unreviewed_access on storage.objects for select using(true);`);
    const bucket=await readFile('hosting/03-private-storage.sql','utf8');
    await expect(database.exec(bucket)).rejects.toThrow('Existing Storage policies need review');await database.exec('ROLLBACK;');
    await database.exec('drop policy unreviewed_access on storage.objects;');
    await database.exec(bucket);
    expect((await database.query('select id,public,file_size_limit from storage.buckets')).rows).toEqual([{id:'ekapon-private',public:false,file_size_limit:3145728}]);
    await expect(database.exec(bucket)).rejects.toThrow('Bucket already exists');await database.exec('ROLLBACK;');
  });
});
