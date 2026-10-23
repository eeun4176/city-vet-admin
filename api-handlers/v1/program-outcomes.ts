import { z } from 'zod';
import { route, ok, parse } from '../../server/http';
import { sql } from '../../server/db';
import { requireAuth } from '../../server/auth';
import { readSummary, summaryHeaders } from '../../server/summaryCache';

const filtersSchema = z.object({
  year:z.coerce.number().int().min(2000).max(2100).default(Number(new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'}).slice(0,4))),
  barangayId:z.coerce.number().int().positive().optional(),
  page:z.coerce.number().int().min(1).max(100000).default(1),
  pageSize:z.coerce.number().int().min(1).max(50).default(12),
});

export default route({GET:async(c)=>{
  await requireAuth(c.req,{roles:['Admin','SuperAdmin']});
  const f=parse(filtersSchema,c.query);
  const summary=await readSummary(`program-outcomes:${f.year}:${f.barangayId ?? 'all'}:${f.page}:${f.pageSize}`,c.query.fresh==='1',async()=>{
    return await sql().begin(async(q)=>{
      await q`set transaction isolation level repeatable read, read only`;
      const cte=`with attendance as (
        select a.* from ekapon.program_attendance a
        join ekapon.program_interest_campaigns c on c.id=a.campaign_id
        join ekapon.dashboard_records d on d.id=c.program_record_id
        where a.status='Submitted' and extract(year from a.attended_on)=$1
          and ($2::int is null or a.owner_barangay_id=$2)
          and coalesce(d.record_data->>'_sampleData','false')<>'true'
      ), pets as (select a.campaign_id,p.pet from attendance a cross join lateral jsonb_array_elements(a.pets_snapshot) p(pet)),
      processes as (select campaign_id,process,coalesce(pet->'processOutcomes'->>process,pet->>'outcome','') as outcome
        from pets cross join lateral jsonb_array_elements_text(pet->'processes') p(process))`;
      const args=[f.year,f.barangayId ?? null];
      const [totals]=await q.unsafe(`${cte} select (select count(*)::int from attendance) as "ownerVisits",
        (select count(*)::int from pets) as "petVisits",
        (select count(*)::int from processes where outcome='Completed') as "completedProcedures",
        (select count(*)::int from attendance where source='Stub') as "stubVisits",
        (select count(*)::int from attendance where source='Walk-in') as "walkInVisits",
        (select count(distinct campaign_id)::int from attendance) as "programsWithAttendance"`,args);
      const breakdown=await q.unsafe(`${cte} select process,count(*)::int as requested,
        count(*) filter(where outcome='Completed')::int as completed,
        count(*) filter(where outcome='Deferred')::int as deferred,
        count(*) filter(where outcome='Not eligible')::int as "notEligible" from processes group by process order by process`,args);
      const programCte=`${cte}, programs as (
        select d.id,c.id as campaign_id,d.record_id,d.record_data,d.archived,coalesce(b.name,d.record_data->>'barangay','') as barangay from ekapon.dashboard_records d
        left join ekapon.program_interest_campaigns c on c.program_record_id=d.id
        left join ekapon.barangays b on b.id=coalesce(c.host_barangay_id,ekapon.find_barangay(d.record_data->>'barangay'))
        where d.dataset='programs' and coalesce(d.record_data->>'_sampleData','false')<>'true'
        and (substring(coalesce(d.record_data->>'date',d.record_data->>'programDate','') from 1 for 4)=$1::text or exists(select 1 from attendance a where a.campaign_id=c.id))
        and ($2::int is null or b.id=$2 or exists(select 1 from ekapon.program_interest_allowed_barangays ab where ab.campaign_id=c.id and ab.barangay_id=$2))
      )`;
      const [count]=await q.unsafe(`${programCte} select count(*)::int as total from programs`,args);
      const programs=await q.unsafe(`${programCte} select p.id,p.record_id as "recordId",coalesce(record_data->>'title',record_data->>'name','Program') as title,
        coalesce(record_data->>'date',record_data->>'programDate','') as date,barangay,archived,
        coalesce(record_data->>'status','') as status,
        (select count(*)::int from attendance a where a.campaign_id=p.campaign_id) as "ownerVisits",
        (select count(*)::int from pets a where a.campaign_id=p.campaign_id) as "petVisits",
        (select count(*)::int from processes a where a.campaign_id=p.campaign_id and outcome='Completed') as "completedProcedures"
        from programs p order by date desc,p.id desc limit ${f.pageSize} offset ${(f.page-1)*f.pageSize}`,args);
      return {year:f.year,barangayId:f.barangayId ?? null,totals,breakdown,programs,total:Number(count.total),page:f.page,pageSize:f.pageSize};
    });
  });
  return ok(summary.value,summaryHeaders(summary));
}});
