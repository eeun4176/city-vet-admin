import { z } from 'zod';
import { route,ok,parse } from '../../server/http';
import { requireAuth } from '../../server/auth';
import { sql } from '../../server/db';
import { searchRecords } from '../../server/search';
export default route({GET:async c=>{
 const session=await requireAuth(c.req,{roles:['SuperAdmin','Admin','Paravet']});
 const f=parse(z.object({includeHistory:z.enum(['true','false']).default('false')}),c.query);
 return ok(await sql().begin(async q=>{
  await q`set transaction isolation level repeatable read, read only`;
  return searchRecords(q,session,'',f.includeHistory==='true',10);
 }));
}});
