import { SignJWT,jwtVerify } from 'jose';
import { config } from './config';
import type { Session } from './auth';
import { can } from '../shared/permissions';
import { BADGE_NODES,type NavigationBadges } from '../shared/navigationBadges';
import { forbidden,conflict } from './errors';
import { registryHash } from './registry';
const secret=()=>new TextEncoder().encode(config().jwtSecret);
export async function navigationAccess(q:any,session:Session){
 const disabled=session.type==='SuperAdmin'?[]:await q`select feature_key from ekapon.role_feature_access where account_type=${session.type} and not enabled order by feature_key`;
 const disabledKeys=disabled.map((r:any)=>r.feature_key) as string[];
 const nodes=Object.entries(BADGE_NODES).filter(([,n])=>(!n.cap||can({role:session.type,grants:session.grants},n.cap))&&!n.features?.some(f=>disabledKeys.includes(f))).map(([id])=>id);
 return {nodes,scope:registryHash([session.type,session.barangayId,[...session.grants].sort(),disabledKeys])};
}
/** Hash the currently visible compact counters, excluding this staff member. */
async function fingerprints(q:any,session:Session,nodes:string[]){
 return await q`select n.node_id,md5(string_agg(n.id::text||':'||n.revision::text,',' order by n.id)) as fingerprint
  from ekapon.navigation_changes n
  where n.node_id=any(${nodes}::text[]) and n.actor_id<>${session.id}
   and (case when n.node_id in ('census-mine','access-request') then n.recipient_id=${session.id}
     when ${session.type==='Paravet'} then (n.recipient_id=0 or n.recipient_id=${session.id}) else true end)
   and (${session.type!=='Paravet'} or n.node_id in ('census-mine','access-request','inbox') or
     (n.campaign_id=0 and n.barangay_id=${session.barangayId??-1}) or
     (n.campaign_id<>0 and exists(select 1 from ekapon.program_interest_campaigns c
       join ekapon.dashboard_records d on d.id=c.program_record_id and not d.archived
       where c.id=n.campaign_id and (c.host_barangay_id=${session.barangayId??-1} or exists(select 1 from ekapon.program_interest_allowed_barangays b where b.campaign_id=c.id and b.barangay_id=${session.barangayId??-1})))
       and (n.node_id in ('programs','program-day') or n.barangay_id=0 or n.barangay_id=${session.barangayId??-1})) or
     (n.campaign_id<>0 and n.barangay_id in (0,${session.barangayId??-1}) and exists(select 1 from ekapon.program_interest_campaigns c where c.id=n.campaign_id and c.program_record_id is null and c.host_barangay_id=${session.barangayId??-1})))
  group by n.node_id` as {node_id:string;fingerprint:string}[];
}
export async function navigationReadReceipt(q:any,session:Session,node:string){
 const access=await navigationAccess(q,session);
 if(!access.nodes.includes(node))return null;
 const [state]=await fingerprints(q,session,[node]);
 return new SignJWT({purpose:'navigation-read',node,scope:access.scope,fingerprint:state?.fingerprint??'none',observedAt:Date.now()})
  .setProtectedHeader({alg:'HS256'}).setSubject(String(session.id)).setIssuedAt().setExpirationTime('10m').sign(secret());
}
export async function acknowledgeNavigation(q:any,session:Session,node:string,token:string){
 const access=await navigationAccess(q,session);
 if(!access.nodes.includes(node))throw forbidden('This sidebar section is not accessible.');
 let payload:any;
 try{payload=(await jwtVerify(token,secret(),{algorithms:['HS256']})).payload;}catch{throw conflict('NAVIGATION_READ_REQUIRED','Open this section successfully again before clearing its updates.');}
 if(payload.purpose!=='navigation-read'||payload.sub!==String(session.id)||payload.node!==node||payload.scope!==access.scope
   ||typeof payload.fingerprint!=='string'||!Number.isSafeInteger(payload.observedAt))throw conflict('NAVIGATION_READ_REQUIRED','The account or access changed. Open this section again.');
 await q`insert into ekapon.navigation_seen(account_id,node_id,scope_key,fingerprint,observed_at)
  values(${session.id},${node},${access.scope},${payload.fingerprint},${payload.observedAt})
  on conflict(account_id,node_id,scope_key) do update set fingerprint=excluded.fingerprint,observed_at=excluded.observed_at
  where navigation_seen.observed_at<=excluded.observed_at`;
}
/** Shared with the dashboard so unresolved staff queues have one definition. */
export async function navigationPendingCounts(q:any,session:Session,nodes:string[]){
 const has=(node:string)=>nodes.includes(node);
 const staff=session.type!=='Paravet';
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});
 const [counts]=await q`select
  (select count(*)::int from ekapon.census_submissions where ${has('census-pending')} and status='pending') as census,
  (select count(*)::int from ekapon.program_interest_campaigns where ${has('program-interest')&&staff} and campaign_type='program_request' and program_record_id is null and status in ('requested','approved')) as interest,
  (select count(*)::int from ekapon.stub_batches b join ekapon.program_interest_campaigns c on c.id=b.campaign_id join ekapon.dashboard_records d on d.id=c.program_record_id
   where ${has('stubs')&&staff} and not d.archived and c.status='scheduled' and coalesce(d.record_data->>'status','') in ('Planned','Open','In progress')
    and coalesce(d.record_data->>'date',d.record_data->>'programDate','')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}'
    and left(coalesce(d.record_data->>'date',d.record_data->>'programDate',''),10)>=${today}
    and b.status in ('Requested','Approved','Printed')) as stubs,
  (select count(*)::int from ekapon.data_quality_reviews v join ekapon.dashboard_records l on l.id=v.left_record_id join ekapon.dashboard_records r on r.id=v.right_record_id
   where ${has('quality')&&staff} and v.status='Needs review' and not l.archived and not r.archived
    and coalesce(l.record_data->>'_sampleData','false')<>'true' and coalesce(r.record_data->>'_sampleData','false')<>'true') as quality,
  (select count(*)::int from ekapon.permission_requests where ${has('access')} and status='pending') as access,
  (select count(*)::int from ekapon.issue_reports where ${has('issues')} and status in ('open','in_progress')) as issues,
  (select count(*)::int from ekapon.notifications where recipient_id=${session.id} and archived_at is null and read_at is null) as inbox`;
 return {'census-pending':counts.census,'program-interest':counts.interest,stubs:counts.stubs,quality:counts.quality,access:counts.access,issues:counts.issues,inbox:counts.inbox} as Record<string,number>;
}
export async function navigationBadges(q:any,session:Session){
 const {nodes,scope}=await navigationAccess(q,session);
 const changes=await fingerprints(q,session,nodes);
 const seen=await q`select node_id,fingerprint from ekapon.navigation_seen where account_id=${session.id} and scope_key=${scope}`;
 const pending=await navigationPendingCounts(q,session,nodes);
 const badges:NavigationBadges=Object.fromEntries(nodes.map(node=>{
  const fingerprint=changes.find(r=>r.node_id===node)?.fingerprint;
  return [node,{pending:pending[node]??0,updated:!!fingerprint&&seen.find((r:any)=>r.node_id===node)?.fingerprint!==fingerprint}];
 }));
 return {badges,scope,updatedAt:Date.now()};
}
