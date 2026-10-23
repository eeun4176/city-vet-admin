import { reportInsights } from '../../server/reportInsights';
import { z } from 'zod';
import { route,ok,parse } from '../../server/http';
import { sql } from '../../server/db';
import { requireAuth } from '../../server/auth';
import { basketDataset,basketValues,BASKET_LIMIT } from '../../shared/reportBasket';
import { ACCOUNT_BASE } from '../../server/accountsView';
import { censusRespondentsSql,fieldSourceSql } from '../../server/fieldRecords';
const request=z.object({items:z.array(z.object({key:z.string().max(250),source:z.string().max(100),id:z.string().min(1).max(120),dataset:z.string().max(50).optional()})).min(1).max(BASKET_LIMIT)});
export default route({POST:async(c)=>{
  const session=await requireAuth(c.req,{roles:['Admin','SuperAdmin','Paravet']});
  const body=parse(request,c.body);
  return ok(await sql().begin(async(q)=>{
    await q`set transaction isolation level repeatable read, read only`;
    const controls=await q`select feature_key,enabled from ekapon.role_feature_access where account_type=${session.type}`;
    const enabled=(feature:string)=>session.type==='SuperAdmin'||!controls.some(r=>r.feature_key===feature&&r.enabled===false);
    const ids=body.items.map(i=>i.id),allowed=new Map<string,Record<string,unknown>>();
    const rows=await q`select dataset,record_id,record_data from ekapon.dashboard_records where record_id=any(${ids}) and not archived and (${session.type!=='Paravet'} or lower(record_data->>'barangay')=lower(${session.barangay??''}))`;
    const paravetDatasets=['owners','pets','respondents','households','animals'];
    for(const r of rows){
      if(session.type==='Paravet'&&!paravetDatasets.includes(r.dataset))continue;
      const feature=['programs','participants','respondents','households','animals'].includes(r.dataset)?'operations':r.dataset==='paravets'?'field-team':'registry';
      if(enabled(feature)&&(!['respondents','participants','services'].includes(r.dataset)||(enabled('operations')&&enabled('registry'))))allowed.set(`${r.dataset}:${r.record_id}`,r.record_data);
    }
    if(session.type!=='Paravet'&&enabled('registry')&&enabled('operations')){
      if(enabled('census')){
        const respondents=await q.unsafe(`select record_id,record_data from (${censusRespondentsSql}) x where record_id=any($1::text[])`,[ids]);
        for(const r of respondents)allowed.set(`respondents:${r.record_id}`,r.record_data);
      }
      const visits=await q.unsafe(`select record_id,record_data from (${fieldSourceSql('services','standalone')}) x where record_id=any($1::text[])`,[ids]);
      for(const v of visits)allowed.set(`Standalone visits:${v.record_id}`,v.record_data);
    }
    if(session.type!=='Paravet'&&enabled('accounts')){
      const accounts=await q.unsafe(`select * from (${ACCOUNT_BASE}) x where id::text=any($1::text[]) and not archived and account_type<>'User' and ($2::boolean or account_type='Paravet')`,[ids,session.type==='SuperAdmin']);
      for(const a of accounts)allowed.set(`Accounts:${a.id}`,{fullName:a.full_name,accountType:a.account_type,mobile:a.mobile,barangay:a.barangay,status:a.status});
    }
    if(enabled('census')){
      const submissions=await q`select s.id,s.label,s.status,s.census_date as "censusDate",s.source,b.name as barangay,s.submitter_name as submitter,s.households_visited as "householdsVisited",s.review_note as "reviewNote",
        (select count(*)::int from ekapon.census_owners o where o.submission_id=s.id) as "ownerCount",
        (select count(*)::int from ekapon.census_pets p join ekapon.census_owners o on o.id=p.owner_id where o.submission_id=s.id) as "petCount"
        from ekapon.census_submissions s join ekapon.barangays b on b.id=s.barangay_id where s.id::text=any(${ids}) and (${session.type!=='Paravet'} or s.submitted_by=${session.id})`;
      for(const s of submissions)allowed.set(`Census submissions:${s.id}`,s);
    }
    const items=[],unavailable=[];
    for(const item of body.items){
      if(['Data analytics','Data analysis'].includes(item.source)){
        if(session.type==='Paravet'||!enabled('reports')){unavailable.push(item.key);continue;}
        const match=/^(descriptive|diagnostic|predictive|prescriptive):(20\d{2}|2100):(\d+)$/.exec(item.id);
        if(!match){unavailable.push(item.key);continue;}
        const insights=await reportInsights(q,session,Number(match[2]),Number(match[3]));
        const block=insights.blocks.find(b=>b.id===item.id);
        if(!block){unavailable.push(item.key);continue;}
        items.push({key:item.key,source:item.source,id:item.id,label:block.label,values:basketValues({...block.values,label:block.label})});continue;
      }
      const dataset=basketDataset(item.source,{dataset:item.dataset});
      const row=allowed.get(`${dataset??item.source}:${item.id}`);
      if(!row||item.source==='Analytics evidence'&&!enabled('reports')){unavailable.push(item.key);continue;}
      const label=String(row.name??row.fullName??row.petName??row.pet_name??row.owner_name??row.title??row.label??item.id);
      const values=item.source==='Analytics evidence'?basketValues({label,dataset:item.dataset,status:row.status??row.outcome??'',date:row.date??row.visit_date??row.registration_date??'',barangay:row.barangay??'',detail:[row.species,row.service,row.paravet,row.provider].filter(Boolean).join(' · ')}):basketValues(row);
      items.push({key:item.key,source:item.source,id:item.id,label,values});
    }
    return {items,unavailable,verifiedAt:new Date().toISOString()};
  }));
}});
