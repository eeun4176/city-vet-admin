import type { Session } from './auth';
import { forbidden, notFound } from './errors';

// Exact normalized matches are review cues, never proof of identity.
export const QUALITY_BASE = `with eligible as (
 select d.* from ekapon.dashboard_records d where not d.archived and d.dataset in ('owners','pets')
   and coalesce(d.record_data->>'_sampleData','false')<>'true'
   and ($1::boolean or lower(btrim(coalesce(d.record_data->>'barangay','')))=lower($2))
), pet_links as (
 select record_data->>'owner_id' as owner_id,md5(string_agg(id::text||':'||md5(record_data::text),',' order by id)) as fingerprint
 from ekapon.dashboard_records where dataset='pets' and not archived and coalesce(record_data->>'_sampleData','false')<>'true' group by record_data->>'owner_id'
), records as (
 select d.id,d.dataset,d.record_id,d.record_data,md5(d.record_data::text||coalesce(p.fingerprint,'')) as fingerprint,
   case when d.dataset='pets' then coalesce(nullif(d.record_data->>'petName',''),d.record_data->>'pet_name',d.record_data->>'name','') else coalesce(nullif(d.record_data->>'name',''),d.record_data->>'owner_name','') end as label,
   lower(regexp_replace(btrim(case when d.dataset='pets' then coalesce(nullif(d.record_data->>'petName',''),d.record_data->>'pet_name',d.record_data->>'name','') else coalesce(nullif(d.record_data->>'name',''),d.record_data->>'owner_name','') end),'\\s+',' ','g')) as match_name,
   lower(btrim(coalesce(d.record_data->>'barangay',''))) as area,
   coalesce(d.record_data->>'owner_id','') as owner_id
 from eligible d left join pet_links p on d.dataset='owners' and p.owner_id=d.record_id
), pairs as (
 select l.id as left_id,r.id as right_id,l.dataset,l.label,l.record_id,l.record_data,l.fingerprint||':'||r.fingerprint as fingerprint,
   r.label as other_label,r.record_id as other_record_id,
   case when v.record_fingerprint=l.fingerprint||':'||r.fingerprint then v.status else 'Needs review' end as status,
   coalesce(v.version,0) as version,v.id as review_id
 from records l join records r on l.id<r.id and l.dataset=r.dataset and l.match_name=r.match_name and l.match_name<>''
   and ((l.dataset='owners' and l.area=r.area and l.area<>'') or
        (l.dataset='pets' and l.owner_id<>'' and l.owner_id=r.owner_id
         and lower(coalesce(l.record_data->>'species',''))=lower(coalesce(r.record_data->>'species',''))
         and lower(coalesce(l.record_data->>'sex',''))=lower(coalesce(r.record_data->>'sex',''))))
 left join ekapon.data_quality_reviews v on v.left_record_id=l.id and v.right_record_id=r.id
)`;

export async function qualityRegistryAccess(session:Session) {
  if(session.type==='SuperAdmin')return;
  const {sql}=await import('./db');
  const [feature]=await sql()`select enabled from ekapon.role_feature_access where account_type=${session.type} and feature_key='registry'`;
  if(feature?.enabled===false)throw forbidden('Registry access is currently disabled for your account type.');
}

export async function qualityPair(q:any,session:Session,left:number,right:number,lock=false) {
  const ids=[left,right].sort((a,b)=>a-b);
  if(ids[0]===ids[1])throw notFound('Select two different matching records.');
  if(lock)await q`select id from ekapon.dashboard_records where id in (${ids[0]},${ids[1]}) order by id for share`;
  const rows=await q.unsafe(`${QUALITY_BASE} select * from pairs where left_id=$3 and right_id=$4`,[session.type!=='Paravet',session.barangay ?? '',...ids]);
  if(!rows.length)throw notFound('Matching active records were not found in your area.');
  return rows[0];
}

export function qualityRecord(row:any) {
  const d=row.record_data as Record<string,unknown>;
  return {id:row.id,recordId:row.record_id,dataset:row.dataset,
    details:Object.fromEntries(['name','owner_name','petName','pet_name','barangay','address','mobile','contact','phone','owner_id','owner','species','sex','age','age_months','breed'].filter(k=>d[k]!==undefined && (d[k]===null || ['string','number','boolean'].includes(typeof d[k]))).map(k=>[k,d[k]]))};
}
