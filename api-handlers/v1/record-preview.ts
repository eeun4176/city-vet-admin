import { z } from 'zod';
import { route,ok,parse } from '../../server/http';
import { requireAuth } from '../../server/auth';
import { sql } from '../../server/db';
import { searchSources,searchArgs,searchInputSql,sourceSql,searchItem } from '../../server/search';
import { publicRegistryData } from '../../server/registry';
import { notFound } from '../../server/errors';
import { SEARCH_SOURCES,type RecordPreview,type SearchSource } from '../../shared/search';

function petData(p:any){
 const procedures=Array.isArray(p.procedures)?p.procedures.map((v:any)=>({process:v.process,outcome:v.outcome})):Array.isArray(p.processes)?p.processes.map((process:string)=>({process,outcome:p.processOutcomes?.[process]??p.outcome??'Requested'})):[];
 return {...publicRegistryData(p),...(procedures.length?{procedures}:{})};
}
function workspace(source:SearchSource,row:any,session:any):RecordPreview['workspace']{
 const id=encodeURIComponent(row.id),parent=encodeURIComponent(row.parent_id??'');
 const target=(label:string,to:string)=>({label,to});
 if(source==='owner'||source==='pet')return target('Open registry record',`/registry/${source==='owner'?'owners':'pets'}?recordId=${id}`);
 if(source==='census')return target('Open census submission',`${session.type==='Paravet'?'/census/mine':`/census/review/${row.status}`}/${id}`);
 if(source==='respondent')return target('Open census respondent',`/registry/respondents?recordId=${id}`);
 if(source==='program'&&!row.history)return target('Open program workspace',`/program-day?program=${parent}`);
 if(source==='campaign'||source==='interest')return target('Open interest list',`/program-interest?campaignId=${source==='campaign'?id:parent}`);
 if(source==='attendance'&&row.parent_id)return target('Open program attendance',`/program-day?program=${parent}&tab=attendance`);
 if(source==='stub-batch'||source==='stub'&&row.parent_id)return target('Open stub batch',`/stubs?batchId=${source==='stub-batch'?id:parent}`);
 if(source==='standalone')return target('Open standalone visit',`/services?view=standalone&recordId=${id}`);
 if(source==='account'&&!row.history)return target('Open staff account',`/accounts?accountId=${id}`);
 if(source==='paravet')return target('Open Paravet directory',`/paravets?q=${id}`);
 if(['legacy-respondent','legacy-participant','legacy-service'].includes(source))return target('Open historical field record',`${source==='legacy-service'?'/services':`/registry/${row.dataset}`}?view=history&recordId=${id}`);
 return null;
}
export default route({GET:async c=>{
 const session=await requireAuth(c.req,{roles:['Admin','SuperAdmin','Paravet']});
 const f=parse(z.object({source:z.enum(SEARCH_SOURCES),id:z.string().trim().min(1).max(120)}),c.query);
 return ok(await sql().begin(async q=>{
  await q`set transaction isolation level repeatable read, read only`;
  const source=(await searchSources(q,session)).find(s=>s.key===f.source);if(!source)throw notFound('This record is unavailable in your current access.');
  const [row]=await q.unsafe(`${searchInputSql} select * from (${sourceSql(source)}) source where id=$5::text`,[...searchArgs(session),f.id]);
  if(!row)throw notFound('This record is unavailable in your current access.');
  const result:RecordPreview={item:searchItem(row),fields:{},groups:[],history:[],workspace:workspace(f.source,row,session)};
  const group=(title:string,records:Record<string,unknown>[])=>result.groups.push({title,records});
  if(['owner','pet','program','paravet'].includes(f.source)||f.source.startsWith('legacy-')){
   const [r]=await q`select id,record_data,created_at,updated_at from ekapon.dashboard_records where dataset=${row.dataset} and record_id=${f.id}`;
   result.fields=publicRegistryData(r.record_data);
   if(f.source==='owner'){
    const pets=await q`select record_data from ekapon.dashboard_records where dataset='pets' and record_data->>'owner_id'=${f.id} and (${session.type!=='Paravet'} or lower(btrim(record_data->>'barangay'))=lower(${session.barangay??''})) order by archived,id limit 20`;
    group('Linked pets (up to 20; open the registry for all)',pets.map((p:any)=>publicRegistryData(p.record_data)));
   }
   if(f.source==='pet'&&r.record_data.owner_id){
    const owners=await q`select record_data from ekapon.dashboard_records where dataset='owners' and record_id=${String(r.record_data.owner_id)} and (${session.type!=='Paravet'} or lower(btrim(record_data->>'barangay'))=lower(${session.barangay??''}))`;
    group('Linked owner',owners.map((o:any)=>publicRegistryData(o.record_data)));
   }
   if(['owner','pet'].includes(f.source)){
    const history=await q`select a.action,a.reason,a.created_at as at,u.full_name as actor from ekapon.registry_activity a join ekapon.accounts u on u.id=a.actor_id where a.record_id=${r.id} order by a.id desc limit 20`;
    result.history=history as any;
   }
   if(f.source==='program'){
    result.fields.processes=Array.isArray(r.record_data.processes)?r.record_data.processes.join(', '):String(r.record_data.program??'');
    const [runtime]=await q`select actual_started_at,actual_finished_at from ekapon.program_runtime where program_record_id=${r.id}`;
    if(runtime)result.fields={...result.fields,actualStartedAt:runtime.actual_started_at,actualFinishedAt:runtime.actual_finished_at};
    result.history=await q`select a.action,a.reason,a.created_at as at,u.full_name as actor from ekapon.program_workspace_activity a join ekapon.accounts u on u.id=a.actor_id where a.program_record_id=${r.id} order by a.id desc limit 20` as any;
   }
   if(!result.history.length)result.history=[{action:'Record created',at:String(r.created_at)},{action:'Last record update',at:String(r.updated_at)}];
  }else if(f.source==='census'||f.source==='respondent'){
   const [s]=f.source==='census'?await q`select s.*,b.name as barangay from ekapon.census_submissions s join ekapon.barangays b on b.id=s.barangay_id where s.id::text=${f.id}`:await q`select s.*,b.name as barangay from ekapon.census_owners o join ekapon.census_submissions s on s.id=o.submission_id join ekapon.barangays b on b.id=s.barangay_id where 'CENSUSRESP-'||o.id::text=${f.id}`;
   result.fields={title:s.label,date:s.census_date,barangay:s.barangay,status:s.status,submittedBy:s.submitter_name,reviewedBy:s.reviewer_name,reviewNote:s.review_note};
   const owners=f.source==='census'?await q`select id,owner_name,address,contact,decision from ekapon.census_owners where submission_id=${s.id} order by line_no limit 20`:await q`select id,owner_name,address,contact,decision from ekapon.census_owners where 'CENSUSRESP-'||id::text=${f.id}`;
   group(f.source==='census'?'Census owners (first 20)':'Census owner',owners.map((o:any)=>publicRegistryData(o)));
   const pets=await q`select o.owner_name as owner,p.pet_name,p.species,p.sex,p.age_months,p.breed_type,p.color,p.sterilized,p.confinement,p.vaccine_1st,p.vaccine_2nd,p.vaccine_3rd,p.remarks from ekapon.census_pets p join ekapon.census_owners o on o.id=p.owner_id where p.owner_id=any(${owners.map((o:any)=>o.id)}::uuid[]) order by p.owner_id,p.line_no limit 30`;
   group('Census pets (first 30)',pets.map((p:any)=>publicRegistryData(p)));
   result.history=[{action:'Census submitted',actor:s.submitter_name,at:String(s.created_at)},...(s.reviewed_at?[{action:`Census ${s.status}`,actor:s.reviewer_name,at:String(s.reviewed_at),reason:s.review_note}]:[])];
  }else if(f.source==='standalone'){
   const [s]=await q`select s.*,a.full_name as actor,v.full_name as voider from ekapon.standalone_services s join ekapon.accounts a on a.id=s.actor_id left join ekapon.accounts v on v.id=s.voided_by where s.id::text=${f.id}`;
   result.fields={date:s.served_on,location:s.location,provider:s.provider,note:s.note,status:s.status,duplicateReason:s.duplicate_reason};
   group('Owner at the time of recording',[publicRegistryData(s.owner_snapshot)]);group('Pets and procedure outcomes',s.pets_snapshot.map(petData));
   result.history=[{action:'Reviewed visit recorded',actor:s.actor,at:String(s.created_at)},...(s.voided_at?[{action:'Visit voided',actor:s.voider,at:String(s.voided_at),reason:s.void_reason}]:[])];
  }else if(f.source==='attendance'){
   const [a]=await q`select a.*,v.full_name as voider,d.archived from ekapon.program_attendance a join ekapon.program_interest_campaigns c on c.id=a.campaign_id join ekapon.dashboard_records d on d.id=c.program_record_id left join ekapon.accounts v on v.id=a.voided_by where a.id::text=${f.id}`;
   if(a.archived)result.workspace=null;
   result.fields={program:a.program_snapshot.title,date:a.attended_on,source:a.source,status:a.status,encodedBy:a.encoded_by_name};group('Owner at the time of attendance',[publicRegistryData(a.owner_snapshot)]);group('Pets and procedure outcomes',a.pets_snapshot.map(petData));
   result.history=[{action:`${a.source} attendance recorded`,actor:a.encoded_by_name,at:String(a.created_at)},...(a.voided_at?[{action:'Attendance voided',actor:a.voider,at:String(a.voided_at),reason:a.void_reason}]:[])];
  }else if(f.source==='campaign'||f.source==='interest'){
   const campaignId=f.source==='campaign'?f.id:row.parent_id;
   const [campaign]=await q`select c.reference,c.status,c.campaign_type,c.processes,c.requested_target_people,c.approved_target_people,b.name as barangay from ekapon.program_interest_campaigns c join ekapon.barangays b on b.id=c.host_barangay_id where c.id::text=${campaignId}`;
   result.fields={reference:campaign.reference,status:campaign.status,kind:campaign.campaign_type==='program_request'?'Demand request':'Scheduled program',barangay:campaign.barangay,processes:campaign.processes.join(', '),targetPeople:campaign.approved_target_people??campaign.requested_target_people};
   if(f.source==='interest'){
    const [p]=await q`select p.*,b.name as barangay from ekapon.program_interest_people p join ekapon.barangays b on b.id=p.residence_barangay_id where p.id::text=${f.id}`;
    group('Person listed (interest does not issue a stub)',[{name:p.owner_name,mobile:p.mobile,barangay:p.barangay,status:p.status}]);group('Pets and requested processes',p.pets.map(petData));
   }
   result.history=await q`select action,actor_name as actor,created_at as at from ekapon.program_interest_activity where campaign_id::text=${campaignId} and (${f.source==='campaign'} or person_id::text=${f.id}) order by id desc limit 20` as any;
  }else if(f.source==='stub-batch'||f.source==='stub'){
   const [batch]=f.source==='stub-batch'?await q`select b.*,u.full_name as requester from ekapon.stub_batches b join ekapon.accounts u on u.id=b.requested_by where b.id::text=${f.id}`:await q`select b.*,u.full_name as requester from ekapon.stub_tickets t join ekapon.stub_batches b on b.id=t.batch_id join ekapon.accounts u on u.id=b.requested_by where t.id::text=${f.id}`;
   result.fields={batch:batch.reference,program:batch.program_snapshot.title,recipient:batch.recipient_name,status:batch.status,requestedQuantity:batch.requested_quantity,approvedQuantity:batch.approved_quantity};
   if(f.source==='stub'){
    const [ticket]=await q`select status,owner_snapshot,pets_snapshot,issued_at,redeemed_at,cancelled_at,cancel_reason from ekapon.stub_tickets where id::text=${f.id}`;
    result.fields={...result.fields,systemStubId:f.id,status:ticket.status,cancellationReason:ticket.cancel_reason};if(ticket.owner_snapshot)group('Assessed owner',[publicRegistryData(ticket.owner_snapshot)]);group('Assessed pets',ticket.pets_snapshot.map(petData));
   }
   result.history=await q`select a.action,u.full_name as actor,a.created_at as at from ekapon.stub_activity a join ekapon.accounts u on u.id=a.actor_id where a.batch_id=${batch.id} and (${f.source==='stub-batch'} or a.stub_id::text=${f.id}) order by a.id desc limit 20` as any;
  }else if(f.source==='account'){
   const [a]=await q`select a.full_name,a.account_type::text,a.mobile,a.status::text,b.name as barangay,a.created_at,a.updated_at from ekapon.accounts a left join ekapon.barangays b on b.id=a.barangay_id where a.id::text=${f.id}`;
   result.fields={name:a.full_name,role:a.account_type,mobile:a.mobile,status:a.status,barangay:a.barangay};result.history=[{action:'Account created',at:String(a.created_at)},{action:'Last account update',at:String(a.updated_at)}];
  }
  return result;
 }));
}});
