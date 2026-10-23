import { z } from 'zod';
import { route,ok,parse } from '../../server/http';
import { requireAuth } from '../../server/auth';
import { sql,tx } from '../../server/db';
import { navigationBadges,acknowledgeNavigation } from '../../server/navigationBadges';
export default route({
 GET:async(c)=>{const session=await requireAuth(c.req,{roles:['Admin','SuperAdmin','Paravet']});
  return ok(await sql().begin(async(q)=>{await q`set transaction isolation level repeatable read,read only`;return navigationBadges(q,session);}));},
 POST:async(c)=>{const session=await requireAuth(c.req,{roles:['Admin','SuperAdmin','Paravet']});
  const {node,token}=parse(z.object({node:z.string().min(1).max(60),token:z.string().min(1).max(2000)}),c.body);
  await tx(session.id,q=>acknowledgeNavigation(q,session,node,token));return ok({seen:true});},
},{invalidateSummaries:false});
