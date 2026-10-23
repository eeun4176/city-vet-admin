import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { client,startServer } from './harness';
import { sql,closeDb } from '../server/db';

const username=`RoleCheck${randomUUID().slice(0,8)}`;
let call:ReturnType<typeof client>,close:()=>Promise<void>,accountId:number;
beforeAll(async()=>{
  const server=await startServer();call=client(server.base);close=server.close;
  const [account]=await sql()`insert into ekapon.accounts(username,account_type,first_name,last_name,password_hash)
    values(${username},'SuperAdmin','Isolated','Role check',extensions.crypt('IsolatedRole!123456',extensions.gen_salt('bf',4))) returning id`;
  accountId=account.id;
});
afterAll(async()=>{
  await sql()`reset role`;
  await sql()`delete from ekapon.accounts where id=${accountId}`;
  if(close)await close();await closeDb();
});
describe('restricted runtime role login',()=>{
  it('runs health, password login and session lookup with ekapon_api privileges, while withholding password hashes',async()=>{
    // This test deliberately uses one local persistent connection to simulate the login role.
    // Do not use session SET ROLE with the hosted transaction pooler.
    await sql()`set role ekapon_api`;
    try{
      expect((await sql()`select current_user as name`)[0].name).toBe('ekapon_api');
      expect((await call('GET','/api/v1/health')).status).toBe(200);
      expect((await call('GET','/api/v1/auth/me')).status).toBe(401); // expected before sign-in
      const login=await call('POST','/api/v1/auth/login',{json:{identifier:username,password:'IsolatedRole!123456'}});
      expect(login.status,JSON.stringify(login.json)).toBe(200);expect(login.cookie).toBeTruthy();
      const me=await call('GET','/api/v1/auth/me',{cookie:login.cookie});
      expect(me.status,JSON.stringify(me.json)).toBe(200);expect(me.json.account.username).toBe(username);
      await expect(sql()`select password_hash from ekapon.accounts limit 1`).rejects.toMatchObject({code:'42501'});
    }finally{await sql()`reset role`;}
  });
  it('reports login readiness without credentials and refuses unedited rotation placeholders',async()=>{
    const diagnostics=await sql().unsafe(await readFile('hosting/05-diagnose-api-login.sql','utf8')).simple();
    expect(diagnostics[0][0]).toMatchObject({rolname:'ekapon_api',rolcanlogin:true,inherits_application_permissions:true,can_connect_database:true,can_use_application_schema:true});
    expect(diagnostics[1].every((row:any)=>row.installed && row.can_execute)).toBe(true);
    expect(diagnostics[2].find((row:any)=>row.column_name==='password_hash')?.can_select).toBe(false);
    await expect(sql().unsafe(await readFile('hosting/06-rotate-api-login.sql','utf8')).simple()).rejects.toThrow('Choose a new random API password');
    await sql()`rollback`;
  });
});
