import { route,ok } from '../../server/http';
import { requireAuth } from '../../server/auth';
import { sql } from '../../server/db';
export default route({GET:async c=>{
 const s=await requireAuth(c.req,{roles:['Admin','SuperAdmin','Paravet']});
 const rows=await sql()`select b.id,b.name,coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.full_name) order by a.full_name) filter(where a.id is not null),'[]'::jsonb) as paravets from ekapon.barangays b left join ekapon.accounts a on a.barangay_id=b.id and a.account_type='Paravet' and a.status='Active' and a.archived_at is null where (${s.type!=='Paravet'} or b.id=${s.barangayId??-1}) group by b.id order by b.name`;
 return ok({data:rows});
}});
