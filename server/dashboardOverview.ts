import type { Session } from './auth';
import { navigationAccess, navigationPendingCounts } from './navigationBadges';
import { BADGE_NODES } from '../shared/navigationBadges';
import type { DashboardOverview, DashboardWork } from '../shared/dashboardOverview';
import { todayManila } from './stubWorkflow';
import { normalizeProgramStatus } from '../shared/programs';

/** Compact projections only: no owner/pet lists, credentials, attachments, or QR tokens. */
export async function dashboardOverview(q: any, session: Session): Promise<DashboardOverview> {
  const { nodes } = await navigationAccess(q, session);
  const has = (node: string) => nodes.includes(node);
  const tasks: DashboardWork[] = [], waiting: DashboardWork[] = [];
  const add = (list: DashboardWork[], id: string, count: number, title: string, description: string, to: string) => {
    if (count > 0) list.push({ id, count, title, description, to });
  };
  const today = todayManila();
  if (session.type !== 'Paravet') {
    const counts = await navigationPendingCounts(q, session, nodes);
    const definitions = [
      ['census-pending', 'Review census submissions', 'Submissions awaiting a review decision.'],
      ['program-interest', 'Review program requests', 'Demand requests awaiting review or scheduling.'],
      ['stubs', 'Prepare stub batches', 'Batches awaiting review, printing, or handover.'],
      ['quality', 'Review flagged matches', 'Flagged record pairs awaiting a reasoned decision.'],
      ['access', 'Review access requests', 'Permission requests awaiting a decision.'],
      ['issues', 'Review reported issues', 'Open or in-progress issue reports.'],
    ];
    for (const [id, title, description] of definitions) {
      if (has(id)) add(tasks, id, counts[id], title, description, BADGE_NODES[id].to);
    }
  } else {
    const [counts] = await q`select
      (select count(*)::int from ekapon.census_submissions where ${has('census-mine')} and submitted_by=${session.id} and status='rejected') as corrections,
      (select count(*)::int from ekapon.census_submissions where ${has('census-mine')} and submitted_by=${session.id} and status='pending') as census_pending,
      (select count(*)::int from ekapon.program_interest_campaigns where ${has('program-interest')}
        and host_barangay_id=${session.barangayId ?? -1} and campaign_type='program_request' and program_record_id is null and status='gathering') as interest_drafts,
      (select count(*)::int from ekapon.program_interest_campaigns where ${has('program-interest')}
        and host_barangay_id=${session.barangayId ?? -1} and campaign_type='program_request' and program_record_id is null and status in ('requested','approved')) as interest_pending`;
    add(tasks, 'census-corrections', counts.corrections, 'Review returned census submissions', 'Read the reviewer’s reason and correct or resubmit when appropriate.', '/census/mine');
    add(tasks, 'interest-drafts', counts.interest_drafts, 'Continue program interest lists', 'Check gathered participants against each list’s current target.', '/program-interest');
    add(waiting, 'census-pending', counts.census_pending, 'Census awaiting review', 'Submitted to Admin; no repeat submission is needed.', '/census/mine');
    add(waiting, 'interest-pending', counts.interest_pending, 'Program requests with Admin', 'Requested or approved, awaiting review or scheduling.', '/program-interest');
    const [stock] = await q`select
      count(*) filter(where sb.status='Printed')::int as collect,
      count(*) filter(where sb.status='Handed over' and exists(select 1 from ekapon.stub_tickets t where t.batch_id=sb.id and t.status='Available'))::int as issue,
      count(*) filter(where sb.status in ('Requested','Approved'))::int as pending
      from ekapon.stub_batches sb join ekapon.program_interest_campaigns c on c.id=sb.campaign_id
      join ekapon.dashboard_records d on d.id=c.program_record_id
      where ${has('stubs')} and sb.recipient_id=${session.id} and sb.barangay_id=${session.barangayId ?? -1}
        and not d.archived and c.status='scheduled'
        and (c.host_barangay_id=${session.barangayId ?? -1} or exists(select 1 from ekapon.program_interest_allowed_barangays ab where ab.campaign_id=c.id and ab.barangay_id=${session.barangayId ?? -1}))
        and (lower(coalesce(d.record_data->>'status','')) in ('in progress','active') or
          (lower(coalesce(d.record_data->>'status','Planned')) in ('planned','open','scheduled','approved') and left(coalesce(d.record_data->>'date',d.record_data->>'programDate',''),10)>=${today}))`;
    add(tasks, 'stubs-collect', stock.collect, 'Collect printed stub batches', 'Coordinate collection with the department; Admin records handover.', '/stubs');
    add(tasks, 'stubs-issue', stock.issue, 'Assess owners and issue stubs', 'Handed-over batches still contain available stubs. Counts represent batches.', '/stubs');
    add(waiting, 'stubs-pending', stock.pending, 'Stub batches being prepared', 'Requests awaiting approval or printing.', '/stubs');
  }
  const programsEnabled = has('program-day');
  const rows = programsEnabled ? await q`select d.id,
      coalesce(d.record_data->>'title',d.record_data->>'name',d.record_id) as title,
      left(coalesce(d.record_data->>'date',d.record_data->>'programDate',''),10) as date,
      coalesce(d.record_data->>'startTime','') as start_time,coalesce(d.record_data->>'endTime','') as end_time,
      coalesce(d.record_data->>'location',d.record_data->>'venue','') as location,
      coalesce(b.name,d.record_data->>'barangay','') as barangay,
      coalesce(d.record_data->>'status','Planned') as status
    from ekapon.dashboard_records d
    left join ekapon.program_interest_campaigns c on c.program_record_id=d.id
    left join ekapon.barangays b on b.id=coalesce(case when coalesce(d.record_data->>'barangayId','') ~ '^[0-9]{1,6}$' then (d.record_data->>'barangayId')::int end,ekapon.find_barangay(d.record_data->>'barangay'))
    where d.dataset='programs' and not d.archived and coalesce(d.record_data->>'_sampleData','false')<>'true'
      and (${session.type !== 'Paravet'} or b.id=${session.barangayId ?? -1} or exists(select 1 from ekapon.program_interest_allowed_barangays ab where ab.campaign_id=c.id and ab.barangay_id=${session.barangayId ?? -1}))
      and (lower(coalesce(d.record_data->>'status','Planned')) in ('in progress','active') or
        (lower(coalesce(d.record_data->>'status','Planned')) in ('planned','open','scheduled','approved','draft','pending approval')
          and left(coalesce(d.record_data->>'date',d.record_data->>'programDate',''),10)>=${today}))
    order by case when lower(d.record_data->>'status') in ('in progress','active') then 0 else 1 end,
      left(coalesce(d.record_data->>'date',d.record_data->>'programDate',''),10),d.record_data->>'startTime',d.id
    limit 6` : [];
  return { tasks, waiting, programsEnabled, programsHasMore: rows.length > 5, today, updatedAt: new Date().toISOString(),
    programs: rows.slice(0, 5).map((r: any) => ({ id: r.id, title: r.title, date: r.date, startTime: r.start_time,
      endTime: r.end_time, location: r.location, barangay: r.barangay, status: normalizeProgramStatus(r.status) ?? r.status,
      to: `/program-day?program=${r.id}` })) };
}
