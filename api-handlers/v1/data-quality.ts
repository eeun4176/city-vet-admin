import { z } from 'zod';
import { route,ok,parse } from '../../server/http';
import { requireAuth } from '../../server/auth';
import { sql,tx } from '../../server/db';
import { conflict,forbidden } from '../../server/errors';
import { QUALITY_BASE,qualityPair,qualityRecord,qualityRegistryAccess } from '../../server/dataQuality';
import { likePattern } from '../../server/listing';

const query=z.object({mode:z.enum(['list','pair']).default('list'),issue:z.enum(['duplicate-owners','duplicate-pets','missing-contact','missing-age','unlinked-pets']).default('duplicate-owners'),
  q:z.string().trim().max(120).default(''),status:z.enum(['all','Needs review','Distinct records','Duplicate confirmed','More information needed']).default('Needs review'),
  page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(50).default(12),
  left:z.coerce.number().int().positive().optional(),right:z.coerce.number().int().positive().optional()});
const bodySchema=z.object({left:z.number().int().positive(),right:z.number().int().positive(),version:z.number().int().min(0),fingerprint:z.string().min(1).max(100),
  action:z.enum(['flag','review']),status:z.enum(['Needs review','Distinct records','Duplicate confirmed','More information needed']).optional(),reason:z.string().trim().min(3).max(1000)});
const cues={
  'missing-contact':`dataset='owners' and btrim(concat_ws('',record_data->>'mobile',record_data->>'contact',record_data->>'phone'))=''`,
  'missing-age':`dataset='pets' and nullif(btrim(coalesce(record_data->>'age_months',record_data->>'age','')),'') is null`,
  'unlinked-pets':`dataset='pets' and not exists(select 1 from records o where o.dataset='owners' and o.record_id=records.owner_id)`,
};

export default route({GET:async(c)=>{
  const session=await requireAuth(c.req,{roles:['Admin','SuperAdmin','Paravet']});await qualityRegistryAccess(session);
  const f=parse(query,c.query),args=[session.type!=='Paravet',session.barangay ?? ''];
  return ok(await sql().begin(async(q)=>{
    await q`set transaction isolation level repeatable read, read only`;
    if(f.mode==='pair'){
      if(!f.left||!f.right)throw conflict('PAIR_REQUIRED','Select a record pair.');
      const pair=await qualityPair(q,session,f.left,f.right);
      const records=await q`select id,dataset,record_id,record_data from ekapon.dashboard_records where id in (${pair.left_id},${pair.right_id}) order by id`;
      const linked=[];
      for(const row of records){
        const pets=row.dataset==='owners' ? await q.unsafe(`${QUALITY_BASE} select id,dataset,record_id,record_data from records where dataset='pets' and owner_id=$3 order by id limit 51`,[...args,row.record_id]) : [];
        linked.push({...qualityRecord(row),linkedPets:pets.slice(0,50).map(qualityRecord),moreLinkedPets:pets.length>50});
      }
      const history=pair.review_id ? await q`select h.id,h.action,h.status,h.reason,h.created_at as "createdAt",a.full_name as actor from ekapon.data_quality_activity h join ekapon.accounts a on a.id=h.actor_id where h.review_id=${pair.review_id} order by h.id desc limit 100` : [];
      return {pair:{left:pair.left_id,right:pair.right_id,fingerprint:pair.fingerprint,version:pair.version,status:pair.status},records:linked,history,historyTruncated:history.length===100};
    }
    const [counts]=await q.unsafe(`${QUALITY_BASE} select
      (select count(*)::int from pairs where dataset='owners' and status='Needs review') as "duplicateOwners",
      (select count(*)::int from pairs where dataset='pets' and status='Needs review') as "duplicatePets",
      (select count(*)::int from records where ${cues['missing-contact']}) as "missingContact",
      (select count(*)::int from records where ${cues['missing-age']}) as "missingAge",
      (select count(*)::int from records where ${cues['unlinked-pets']}) as "unlinkedPets",
      (select count(*)::int from records) as "checkedRecords"`,args);
    const duplicate=f.issue.startsWith('duplicate');
    const where=duplicate ? `dataset='${f.issue==='duplicate-owners'?'owners':'pets'}' and ($3='all' or status=$3) and ($4='' or label ilike $5 or other_label ilike $5 or record_id ilike $5 or other_record_id ilike $5)`
      : `${cues[f.issue as keyof typeof cues]} and ($4='' or label ilike $5 or record_id ilike $5)`;
    const params=[...args,f.status,f.q,likePattern(f.q)];
    // Keep placeholder numbering stable for both branches; $3 still has an explicit type.
    const clause=`${where} and $3::text is not null`;
    const from=duplicate?'pairs':'records';
    const [count]=await q.unsafe(`${QUALITY_BASE} select count(*)::int as total from ${from} where ${clause}`,params);
    const fields=duplicate ? `left_id as id,right_id as "otherId",record_id as "recordId",other_record_id as "otherRecordId",dataset,label,other_label as "otherLabel",record_data->>'barangay' as barangay,status`
      : `id,record_id as "recordId",dataset,label,record_data->>'barangay' as barangay`;
    const rows=await q.unsafe(`${QUALITY_BASE} select ${fields} from ${from} where ${clause} order by ${duplicate?'left_id,right_id':'id'} limit ${f.pageSize} offset ${(f.page-1)*f.pageSize}`,params);
    return {counts,rows,total:Number(count.total),page:f.page,pageSize:f.pageSize,issue:f.issue};
  }));
},POST:async(c)=>{
  const session=await requireAuth(c.req,{roles:['Admin','SuperAdmin','Paravet']});await qualityRegistryAccess(session);
  const b=parse(bodySchema,c.body);
  if(b.action==='review'&&session.type==='Paravet')throw forbidden('Admin or Super Admin must record the review decision.');
  if(b.action==='review'&&!b.status)throw conflict('DECISION_REQUIRED','Select a review decision.');
  return ok(await tx(session.id,async(q)=>{
    const ids=[b.left,b.right].sort((a,b)=>a-b);
    await q`select pg_advisory_xact_lock(hashtext(${`quality:${ids.join(':')}`}))`;
    const pair=await qualityPair(q,session,...ids as [number,number],true);
    if(pair.version!==b.version || pair.fingerprint!==b.fingerprint)throw conflict('REVIEW_CHANGED','The records or review changed. Refresh the comparison before saving.');
    const status=b.action==='flag'?'Needs review':b.status!;
    const [review]=await q`insert into ekapon.data_quality_reviews(left_record_id,right_record_id,status,record_fingerprint,updated_by)
      values(${ids[0]},${ids[1]},${status},${pair.fingerprint},${session.id})
      on conflict(left_record_id,right_record_id) do update set status=excluded.status,record_fingerprint=excluded.record_fingerprint,updated_by=excluded.updated_by,updated_at=now(),version=data_quality_reviews.version+1 returning id,version`;
    await q`insert into ekapon.data_quality_activity(review_id,actor_id,action,status,reason,record_fingerprint) values(${review.id},${session.id},${b.action==='flag'?'flagged':'reviewed'},${status},${b.reason},${pair.fingerprint})`;
    return {saved:true,version:review.version,status};
  }));
}});
