import { route, ok } from '../../../server/http';
import { sql } from '../../../server/db';
import { requireAuth } from '../../../server/auth';
import { readSummary, summaryHeaders } from '../../../server/summaryCache';

const DATASETS = ['owners', 'pets', 'paravets', 'respondents', 'households', 'animals', 'stubs', 'services', 'programs', 'participants'] as const;

export default route({
  GET: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin', 'Paravet'] });
    const summary = await readSummary(`dashboard:${session.id}:${session.type}:${session.barangayId ?? 0}`, c.query.fresh === '1', async () => {
    const citywide = session.type === 'SuperAdmin' || session.type === 'Admin';
    const barangay = session.barangay ?? '';
    const visibleDatasets = session.type === 'Paravet'
      ? ['owners', 'pets', 'respondents', 'households', 'animals']
      : DATASETS;
    const [recordRows, accountRows, censusRows, censusMineRows, censusImportRows, barangayRows, workflowRows] = await Promise.all([
      sql().unsafe(
        `select dataset, count(*)::int as count
           from ekapon.dashboard_records
          where archived = false and dataset = any($1::text[])
            and ($2 or lower(record_data->>'barangay') = lower($3))
          group by dataset`,
        [visibleDatasets, citywide, barangay],
      ),
      (citywide || session.type === 'Paravet') ? sql().unsafe(
        `select account_type::text as dataset, count(*)::int as count
           from ekapon.accounts where archived_at is null
             and account_type <> 'User' and ($1 or barangay_id = $2)
          group by account_type`,
        [citywide, session.barangayId],
      ) : Promise.resolve([]),
      sql().unsafe(
        `select status, count(*)::int as count from ekapon.census_submissions
          where ($1 or barangay_id = $2) group by status`,
        [citywide, session.barangayId],
      ),
      sql().unsafe(
        `select count(*)::int as count from ekapon.census_submissions
          where submitted_by = $1 and ($2 or barangay_id = $3)`,
        [session.id, citywide, session.barangayId],
      ),
      sql().unsafe(
        `select count(*)::int as count from ekapon.census_submissions
          where source = 'csv' and ($1 or barangay_id = $2)`,
        [citywide, session.barangayId],
      ),
      sql().unsafe(
        `select count(*)::int as count from ekapon.barangays where ($1 or id = $2)`,
        [citywide, session.barangayId],
      ),
      sql()`select
        (select count(*)::int from ekapon.stub_tickets t join ekapon.stub_batches b on b.id=t.batch_id
          where t.status <> 'Cancelled' and (${citywide} or (b.recipient_id=${session.id} and b.barangay_id=${session.barangayId ?? -1}))) as stubs,
        (select count(*)::int from ekapon.census_owners o join ekapon.census_submissions s on s.id=o.submission_id
          where s.status='approved' and o.decision in ('new','merge','replace','keep') and (${citywide} or s.barangay_id=${session.barangayId ?? -1})) as respondents,
        (select coalesce(sum(jsonb_array_length(a.pets_snapshot)),0)::int from ekapon.program_attendance a
          where a.status='Submitted' and (${citywide} or a.owner_barangay_id=${session.barangayId ?? -1})) as participants,
        (select count(*)::int from ekapon.program_interest_campaigns c
          where (${citywide} or c.host_barangay_id=${session.barangayId ?? -1} or exists
            (select 1 from ekapon.program_interest_allowed_barangays a where a.campaign_id=c.id and a.barangay_id=${session.barangayId ?? -1}))) as interest,
        (select count(*)::int from ekapon.dashboard_records d
          left join ekapon.program_interest_campaigns c on c.program_record_id=d.id
          left join ekapon.barangays b on b.id=coalesce(case when coalesce(d.record_data->>'barangayId','') ~ '^[0-9]{1,6}$' then (d.record_data->>'barangayId')::int end,ekapon.find_barangay(d.record_data->>'barangay'))
          where d.dataset='programs' and d.archived=false
            and (${citywide} or b.id=${session.barangayId ?? -1} or exists
              (select 1 from ekapon.program_interest_allowed_barangays a where a.campaign_id=c.id and a.barangay_id=${session.barangayId ?? -1}))) as program_days`,
    ]);
    const counts: Record<string, number> = Object.fromEntries(DATASETS.map((dataset) => [dataset, 0]));
    for (const row of recordRows as unknown as { dataset: string; count: number }[]) counts[row.dataset] = row.count;
    const accounts = accountRows as unknown as { dataset: string; count: number }[];
    counts.accounts = accounts
      .filter((row) => session.type !== 'Admin' || !['Admin', 'SuperAdmin'].includes(row.dataset))
      .reduce((sum, row) => sum + row.count, 0);
    const census = censusRows as unknown as { status: string; count: number }[];
    counts['census-pending'] = census.find((row) => row.status === 'pending')?.count ?? 0;
    counts['census-approved'] = census.find((row) => row.status === 'approved')?.count ?? 0;
    counts['census-rejected'] = census.find((row) => row.status === 'rejected')?.count ?? 0;
    counts['census-submit'] = Number((censusMineRows[0] as unknown as { count: number }).count);
    counts['census-import'] = Number((censusImportRows[0] as unknown as { count: number }).count);
    counts['census-mine'] = counts['census-submit'];
    counts['census-review'] = counts['census-pending'];
    const accessibleBarangays = Number((barangayRows[0] as unknown as { count: number }).count);
    counts['census-summary'] = accessibleBarangays;
    counts['census-front'] = accessibleBarangays;
    counts.stubs = Number(workflowRows[0].stubs);
    counts['respondents-history']=counts.respondents;
    counts['participants-history']=counts.participants;
    counts.respondents=Number(workflowRows[0].respondents);
    counts.participants=Number(workflowRows[0].participants);
    counts['program-interest'] = Number(workflowRows[0].interest);
    counts['program-day'] = Number(workflowRows[0].program_days);
    return { counts };
    });
    return ok(summary.value, summaryHeaders(summary));
  },
});
