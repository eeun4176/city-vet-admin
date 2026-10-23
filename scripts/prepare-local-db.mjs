import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { applyLocalSchema } from './local-schema.mjs';
const database=new PGlite('./.local-test-db',{extensions:{pgcrypto}});
try{
 await database.waitReady;await applyLocalSchema(database);
 const result=await database.query("select id from ekapon.accounts where username='localadmin'");
 if(!result.rows.length){await database.query("insert into ekapon.accounts(username,account_type,first_name,last_name,password_hash) values('localadmin','SuperAdmin','Local','Administrator',extensions.crypt('LocalTest!123',extensions.gen_salt('bf',4)))");console.log('Created local-only administrator. See local development documentation for the initial credential.');}
 console.log('Local schema ready. Legacy sample simulation is no longer seeded automatically.');
}finally{await database.close();}
