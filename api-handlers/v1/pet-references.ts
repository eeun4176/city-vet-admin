import { z } from 'zod';
import { route,ok,parse } from '../../server/http';
import { requireAuth } from '../../server/auth';
import { sql,tx } from '../../server/db';
import { PET_BREEDS } from '../../shared/petReferences';
export default route({GET:async c=>{
 await requireAuth(c.req,{roles:['Admin','SuperAdmin','Paravet']});
 const rows=await sql()`select species,name,active from ekapon.pet_breed_references order by name`;
 return ok({Dog:[...new Set([...PET_BREEDS.Dog,...rows.filter(r=>r.species==='Dog'&&r.active).map(r=>r.name)])],Cat:[...new Set([...PET_BREEDS.Cat,...rows.filter(r=>r.species==='Cat'&&r.active).map(r=>r.name)])]});
},POST:async c=>{
 const s=await requireAuth(c.req,{roles:['Admin','SuperAdmin']});
 const b=parse(z.object({species:z.enum(['Dog','Cat']),name:z.string().trim().min(1).max(100)}),c.body);
 await tx(s.id,q=>q`insert into ekapon.pet_breed_references(species,name) values(${b.species},${b.name}) on conflict(species,name) do update set active=true`);
 return ok({saved:true});
}});
