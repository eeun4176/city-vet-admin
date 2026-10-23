import { z } from 'zod';
import { route,ok,parse } from '../../server/http';
import { requireAuth } from '../../server/auth';
import { sql } from '../../server/db';
import { forbidden,notFound } from '../../server/errors';
import { likePattern } from '../../server/listing';
export default route({GET:async c=>{
 const s=await requireAuth(c.req,{roles:['Admin','SuperAdmin','Paravet']});
 const f=parse(z.object({campaignId:z.coerce.number().int().positive(),barangayId:z.coerce.number().int().positive(),mode:z.enum(['interest','stub','walk-in']).default('stub'),q:z.string().trim().max(120).default(''),ownerId:z.string().max(100).optional()}),c.query);
 return ok(await sql().begin(async q=>{
  const [campaign]=await q`select c.id,c.host_barangay_id,c.program_record_id,exists(select 1 from ekapon.program_interest_allowed_barangays a where a.campaign_id=c.id and a.barangay_id=${s.barangayId??-1}) as access,exists(select 1 from ekapon.program_interest_allowed_barangays a where a.campaign_id=c.id and a.barangay_id=${f.barangayId}) as eligible from ekapon.program_interest_campaigns c where c.id=${f.campaignId}`;
  if(!campaign)throw notFound('Program not found.');
  if(s.type==='Paravet'&&s.barangayId!==campaign.host_barangay_id&&!campaign.access)throw forbidden('This program is outside your permitted area.');
  if(f.mode==='walk-in'&&!campaign.program_record_id)throw forbidden('Walk-in search requires a scheduled program.');
  if(f.mode!=='walk-in'&&f.barangayId!==campaign.host_barangay_id&&!campaign.eligible)throw forbidden('Choose a barangay approved for this program.');
  if(f.mode==='interest'&&s.type==='Paravet'&&f.barangayId!==s.barangayId)throw forbidden('Interest owner selection is limited to your assigned barangay.');
  const [area]=await q`select id,name from ekapon.barangays where id=${f.barangayId}`;
  if(!area)throw notFound('Barangay not found.');
  const owners=await q`select record_id,record_data from ekapon.dashboard_records where dataset='owners' and not archived and coalesce(record_data->>'_sampleData','false')<>'true' and lower(btrim(record_data->>'barangay'))=lower(${area.name}) and (${f.ownerId??''}='' or record_id=${f.ownerId??''}) and (${f.q}='' or coalesce(record_data->>'name','') ilike ${likePattern(f.q)} or record_id ilike ${likePattern(f.q)} or coalesce(record_data->>'address','') ilike ${likePattern(f.q)} or coalesce(record_data->>'contact',record_data->>'mobile','') ilike ${likePattern(f.q)}) order by record_data->>'name',record_id limit 20`;
  const pets=f.ownerId&&owners.length?await q`select record_id,record_data from ekapon.dashboard_records where dataset='pets' and not archived and record_data->>'owner_id'=${f.ownerId} and lower(btrim(record_data->>'barangay'))=lower(${area.name}) order by record_data->>'petName',record_id`:[];
  return {owners:owners.map(r=>({id:r.record_id,name:r.record_data.name,address:r.record_data.address??'',mobile:r.record_data.contact||r.record_data.mobile||'',barangayId:f.barangayId})),pets:pets.map(r=>({id:r.record_id,name:r.record_data.petName??r.record_data.name,species:r.record_data.species,sex:r.record_data.sex||undefined,ageMonths:r.record_data.age_months??undefined})),hasMore:owners.length===20};
 }));
}});
