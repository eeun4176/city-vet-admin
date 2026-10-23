import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { route,ok,parse } from '../../server/http';
import { requireAuth } from '../../server/auth';
import { sql,tx } from '../../server/db';
import { conflict,notFound } from '../../server/errors';
import { reportInsights } from '../../server/reportInsights';
import { BASKET_LIMIT } from '../../shared/reportBasket';
const item=z.object({key:z.string().max(250),source:z.string().max(100),id:z.string().max(120),label:z.string().max(300),values:z.record(z.union([z.string().max(30000),z.number(),z.boolean(),z.null()])),selectedFields:z.array(z.string().max(100)).max(100)});
const content=z.object({items:z.array(item).max(BASKET_LIMIT),notes:z.string().max(20000),level:z.enum(['Operational','Managerial','Tactical','Strategic'])});
export default route({GET:async c=>{
 const s=await requireAuth(c.req,{roles:['Admin','SuperAdmin']});
 const f=parse(z.object({mode:z.enum(['drafts','insights']).default('drafts'),year:z.coerce.number().int().min(2000).max(2100).default(new Date().getFullYear()),barangayId:z.coerce.number().int().min(0).default(0),id:z.string().uuid().optional()}),c.query);
 if(f.mode==='insights')return ok(await sql().begin(q=>reportInsights(q,s,f.year,f.barangayId)));
 if(f.id){const [draft]=await sql()`select id,title,content,version from ekapon.report_drafts where id=${f.id}::uuid and account_id=${s.id}`;if(!draft)throw notFound('Saved report not found.');return ok(draft);}
 const drafts=await sql()`select id,title,version,updated_at as "updatedAt" from ekapon.report_drafts where account_id=${s.id} order by updated_at desc limit 100`;
 return ok({drafts});
},POST:async c=>{
 const s=await requireAuth(c.req,{roles:['Admin','SuperAdmin']});
 const b=parse(z.object({id:z.string().uuid().optional(),expectedVersion:z.number().int().positive().optional(),title:z.string().trim().min(1).max(160),content}),c.body);
 return ok(await tx(s.id,async q=>{
  if(b.id){const [row]=await q`update ekapon.report_drafts set title=${b.title},content=${q.json(b.content)},version=version+1,updated_at=now() where id=${b.id}::uuid and account_id=${s.id} and version=${b.expectedVersion??0} returning id,version`;if(!row)throw conflict('REPORT_CHANGED','The saved report changed or is unavailable. Reload before saving.');return row;}
  const [row]=await q`insert into ekapon.report_drafts(id,account_id,title,content) values(${randomUUID()}::uuid,${s.id},${b.title},${q.json(b.content)}) returning id,version`;return row;
 }));
}}, {maxBody:3000000});
