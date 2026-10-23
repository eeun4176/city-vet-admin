import { z } from 'zod';
import { route, ok, parse } from '../../server/http';
import { sql } from '../../server/db';
import { requireAuth } from '../../server/auth';
import { badRequest, notFound } from '../../server/errors';
import { likePattern } from '../../server/listing';
import { ANALYTICS_METHODOLOGY_VERSION } from '../../shared/analytics';

const query = z.object({
  mode: z.enum(['options', 'barangay', 'report']).default('options'),
  source: z.enum(['live', 'sample']).default('live'),
  compact: z.enum(['0', '1']).default('0'),
  kind: z.enum(['barangay', 'account', 'pet', 'paravet']).optional(),
  q: z.string().trim().max(120).default(''),
  year: z.coerce.number().int().min(2000).max(2100).default(new Date().getFullYear()),
  barangayId: z.coerce.number().int().positive().optional(),
  accountId: z.coerce.number().int().positive().optional(),
  petId: z.string().trim().min(1).max(100).optional(),
  paravetId: z.coerce.number().int().positive().optional(),
  title: z.string().trim().max(160).default(''),
  categories: z.string().max(300).default('overview,registry,pets,census,accounts,field-operations,program-interest,prelistings'),
});

const CATEGORY_LABELS: Record<string, string> = {
  overview: 'Overview',
  registry: 'Owners and registry',
  pets: 'Pets',
  census: 'Census',
  accounts: 'Accounts and Paravets',
  'field-operations': 'Field operations',
  'program-interest': 'Program interest',
  prelistings: 'Archived resident pre-listings',
};
const RECORD_DATASETS = ['owners', 'pets', 'respondents', 'households', 'animals', 'participants', 'programs', 'services', 'stubs'] as const;
const REPORT_CATEGORIES = Object.keys(CATEGORY_LABELS);
const dateField = `coalesce(nullif(record_data->>'date', ''), nullif(record_data->>'visit_date', ''), nullif(record_data->>'census_date', ''), nullif(record_data->>'registration_date', ''), nullif(record_data->>'created_at', ''), nullif(record_data->>'createdAt', ''))`;

type SafeRecord = { id: string; label: string; status: string; date: string; barangay: string; detail: string };

export default route({
  GET: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin'] });
    const filters = parse(query, c.query);
    const sample = filters.source === 'sample';

    if (filters.mode === 'options') {
      if (filters.kind) {
        if (filters.q.length < 2) return ok({ options: [] });
        const pattern = likePattern(filters.q);
        if (filters.kind === 'barangay') {
          const options = await sql()`
            select id::text as id, name || ' · ' || acronym as label
              from ekapon.barangays
             where name ilike ${pattern} or acronym ilike ${pattern} or district_label ilike ${pattern}
             order by name limit 20`;
          return ok({ options });
        }
        if (filters.kind === 'account' || filters.kind === 'paravet') {
          const paravetOnly = filters.kind === 'paravet';
          const options = await sql()`
            select a.id::text as id,
                   a.full_name || ' · ' || a.account_type::text || ' · ' || a.status::text || ' · '
                     || coalesce(b.name, 'No barangay') || ' · #' || a.id::text as label
              from ekapon.accounts a
              left join ekapon.barangays b on b.id = a.barangay_id
             where a.archived_at is null
               and ((${sample} and a.middle_name = 'Simulation') or (not ${sample} and a.middle_name is distinct from 'Simulation'))
               and a.account_type in ('SuperAdmin', 'Admin', 'Paravet', 'User')
               and (not ${paravetOnly} or a.account_type = 'Paravet')
               and (a.full_name ilike ${pattern} or a.account_type::text ilike ${pattern}
                 or a.status::text ilike ${pattern} or coalesce(b.name, '') ilike ${pattern} or a.id::text ilike ${pattern})
             order by a.account_type, a.full_name limit 20`;
          return ok({ options });
        }
        const options = await sql()`
          select record_id as id,
                 coalesce(record_data->>'pet_name', record_data->>'petName', record_data->>'name', record_id)
                   || ' · ' || coalesce(record_data->>'species', 'Unknown')
                   || ' · ' || coalesce(record_data->>'owner_name', record_data->>'owner', 'Unknown owner')
                   || ' · ' || coalesce(record_data->>'barangay', 'Unknown barangay')
                   || ' · #' || record_id as label
            from ekapon.dashboard_records
           where dataset = 'pets' and archived = false
             and (${sample} = coalesce(record_data->>'_sampleData' = 'true', false))
             and record_data::text ilike ${pattern}
           order by lower(coalesce(record_data->>'pet_name', record_data->>'petName', record_data->>'name', record_id))
           limit 20`;
        return ok({ options });
      }
      if (filters.compact === '1') {
        const barangays = await sql()`select id,acronym as code,name,district_label as district,zip from ekapon.barangays order by name`;
        return ok({ barangays, accounts: [], pets: [] });
      }
      const [barangays, accounts, pets] = await Promise.all([
        sql()`select id, acronym as code, name, district_label as district, zip
               from ekapon.barangays order by name`,
        sql()`select a.id, a.full_name as name, a.account_type::text as type, a.status::text as status,
                      a.barangay_id as "barangayId", a.owner_id, b.name as barangay
               from ekapon.accounts a left join ekapon.barangays b on b.id = a.barangay_id
              where a.archived_at is null and a.status = 'Active'
                 and ((${sample} and a.middle_name = 'Simulation') or (not ${sample} and a.middle_name is distinct from 'Simulation'))
                 and a.account_type in ('SuperAdmin', 'Admin', 'Paravet', 'User')
              order by a.account_type, a.full_name limit 1000`,
        sql()`select record_id as id,
                    coalesce(record_data->>'pet_name', record_data->>'petName', record_data->>'name', record_id) as name,
                    coalesce(record_data->>'species', 'Unknown') as species,
                    coalesce(record_data->>'owner_name', record_data->>'owner', '') as owner,
                    coalesce(record_data->>'barangay', '') as barangay
               from ekapon.dashboard_records
              where dataset = 'pets' and archived = false
                and (${sample} = coalesce(record_data->>'_sampleData' = 'true', false))
              order by lower(coalesce(record_data->>'pet_name', record_data->>'petName', record_data->>'name', record_id))
              limit 1000`,
      ]);
      return ok({ barangays, accounts, pets });
    }

    if (filters.mode === 'barangay') {
      if (!filters.barangayId) throw notFound('Choose a barangay to see its profile.');
      const [barangay] = await sql()`
        select id, acronym as code, name, district, district_label as "districtLabel", zip
          from ekapon.barangays where id = ${filters.barangayId}`;
      if (!barangay) throw notFound('Barangay not found.');

      const [paravets, census, registry, dashboard, prelistings, verification] = await Promise.all([
        sql()`select id, full_name as name, account_key as code, status::text as status
               from ekapon.accounts
              where account_type = 'Paravet' and barangay_id = ${filters.barangayId}
                and status = 'Active' and archived_at is null
                and ((${sample} and middle_name = 'Simulation') or (not ${sample} and middle_name is distinct from 'Simulation'))
              order by full_name`,
        sql().unsafe(
          `with per_submission as (
             select s.id, s.status, s.households_visited,
                    (select count(*)::int from ekapon.census_owners o where o.submission_id = s.id) as owners,
                    (select count(*)::int from ekapon.census_pets p join ekapon.census_owners o on o.id = p.owner_id where o.submission_id = s.id) as pets
               from ekapon.census_submissions s
              where s.barangay_id = $1
                and (($2 and s.label like 'SIMULATION · %') or (not $2 and s.label not like 'SIMULATION · %'))
                  and ($3::bigint is null or s.submitted_by = $3)
           )
           select status, count(*)::int as submissions, coalesce(sum(households_visited), 0)::int as households_visited,
                  coalesce(sum(owners), 0)::int as census_owners, coalesce(sum(pets), 0)::int as census_pets
             from per_submission group by status order by status`,
          [filters.barangayId, sample, filters.accountId ?? filters.paravetId ?? null],
        ),
        sql().unsafe(`select count(distinct o.id)::int as owners, count(p.id)::int as pets,
                    count(*) filter (where p.species = 'Dog')::int as dogs,
                    count(*) filter (where p.species = 'Cat')::int as cats,
                    count(*) filter (where p.laps)::int as laps,
                    count(*) filter (where p.sterilized)::int as sterilized
               from ekapon.registry_owners o left join ekapon.registry_pets p on p.owner_id = o.id and p.archived_at is null
              where o.barangay_id = $1 and o.archived_at is null
                and (($2 and exists (select 1 from ekapon.census_submissions s where s.id = o.source_submission_id and s.label like 'SIMULATION · %'))
                  or (not $2 and not exists (select 1 from ekapon.census_submissions s where s.id = o.source_submission_id and s.label like 'SIMULATION · %')))` ,
          [filters.barangayId, sample],
        ),
        sql()`select dataset, count(*)::int as count
               from ekapon.dashboard_records
              where archived = false and lower(record_data->>'barangay') = lower(
                (select name from ekapon.barangays where id = ${filters.barangayId}))
                and (${sample} = coalesce(record_data->>'_sampleData' = 'true', false))
              group by dataset order by dataset`,
        sql().unsafe(
          `select count(*)::int as count,
                  count(*) filter (where p.submitted_at >= now() - interval '90 days')::int as recent
             from ekapon.prelistings p where p.barangay_id = $1 and $2 = false`,
          [filters.barangayId, sample],
        ),
        sql().unsafe(
          `select status, count(*)::int as count
             from ekapon.id_verifications where barangay_id = $1 and $2 = false
              group by status order by status`,
          [filters.barangayId, sample],
        ),
      ]);
      return ok({
        barangay,
        source: filters.source,
        paravets,
        census,
        registry: registry[0],
        dashboardRecords: dashboard,
        prelistings: prelistings[0],
        idVerifications: verification,
      });
    }

    const searchPattern = likePattern(filters.q);
    const requestedCategories = filters.categories.split(',').map((value) => value.trim()).filter(Boolean);
    if (requestedCategories.some((value) => !REPORT_CATEGORIES.includes(value))) throw badRequest('The report contains an unsupported category.');
    const categories = [...new Set(requestedCategories)];
    if (!categories.length) throw badRequest('Select at least one report category.');
    const [barangay] = filters.barangayId
      ? await sql()`select id, acronym as code, name, district_label as district, zip from ekapon.barangays where id = ${filters.barangayId}`
      : [null];
    if (filters.barangayId && !barangay) throw notFound('Barangay not found.');
    const [account] = filters.accountId
      ? await sql()`select id, full_name as name, account_type::text as type, status::text as status, barangay_id as "barangayId", owner_id
                     from ekapon.accounts where id = ${filters.accountId} and archived_at is null
                       and ((${sample} and middle_name = 'Simulation') or (not ${sample} and middle_name is distinct from 'Simulation'))`
      : [null];
    if (filters.accountId && !account) throw notFound('Account not found.');
    const [paravet] = filters.paravetId
      ? await sql()`select id, full_name as name, account_key as code, barangay_id as "barangayId"
                     from ekapon.accounts where id = ${filters.paravetId} and account_type = 'Paravet' and archived_at is null
                       and ((${sample} and middle_name = 'Simulation') or (not ${sample} and middle_name is distinct from 'Simulation'))`
      : [null];
    if (filters.paravetId && !paravet) throw notFound('Paravet not found.');
    const [pet] = filters.petId
      ? await sql()`select record_id as id,
                          coalesce(record_data->>'pet_name', record_data->>'petName', record_data->>'name', record_id) as name,
                          coalesce(record_data->>'owner_id', '') as "ownerId",
                          coalesce(record_data->>'owner_name', record_data->>'owner', '') as owner,
                          coalesce(record_data->>'barangay', '') as barangay
                     from ekapon.dashboard_records
                    where dataset = 'pets' and record_id = ${filters.petId} and archived = false
                       and (${sample} = coalesce(record_data->>'_sampleData' = 'true', false))`
      : [null];
    if (filters.petId && !pet) throw notFound('Pet record not found in the selected source.');

    const sections: Array<{ key: string; title: string; total: number; records: SafeRecord[] }> = [];
    for (const category of categories) {
      if (category === 'program-interest') {
        const rows = await sql().unsafe(
          `select c.reference as id,
                  coalesce(d.record_data->>'title', d.record_data->>'name', 'Program request · ' || b.name) as label,
                  c.status as status,
                  coalesce(nullif(d.record_data->>'date', ''), c.created_at::date::text) as date,
                  b.name as barangay,
                  concat(count(p.id), ' owners · ', coalesce(sum(jsonb_array_length(p.pets)), 0), ' pets · target ',
                         coalesce(c.approved_target_people, c.requested_target_people), ' · ', array_to_string(c.processes, ', ')) as detail,
                  count(*) over()::int as total
             from ekapon.program_interest_campaigns c
             join ekapon.barangays b on b.id = c.host_barangay_id
             left join ekapon.dashboard_records d on d.id = c.program_record_id
             left join ekapon.program_interest_people p on p.campaign_id = c.id and p.status = 'interested'
            where not $1
              and ($2::int is null or c.host_barangay_id = $2)
              and extract(year from coalesce(nullif(d.record_data->>'date', '')::date, c.created_at::date)) = $3
              and ($4::bigint is null or c.created_by = $4
                   or exists (select 1 from ekapon.program_interest_activity a where a.campaign_id = c.id and a.actor_id = $4))
              and ($5 = '' or c.reference ilike $6 or b.name ilike $6 or c.status ilike $6
                   or coalesce(d.record_data->>'title', d.record_data->>'name', '') ilike $6
                   or array_to_string(c.processes, ', ') ilike $6)
            group by c.id, d.record_data, b.name
            order by coalesce(nullif(d.record_data->>'date', '')::date, c.created_at::date) desc, c.id desc limit 300`,
          [sample, filters.barangayId ?? null, filters.year, filters.accountId ?? filters.paravetId ?? null, filters.q, searchPattern],
        ) as unknown as Array<{ id: string; label: string; status: string; date: string; barangay: string; detail: string; total: number }>;
        sections.push({ key: category, title: CATEGORY_LABELS[category], total: Number(rows[0]?.total ?? 0), records: rows.map(({ total: _total, ...row }) => ({ ...row })) });
        continue;
      }
      if (category === 'accounts') {
        const rows = await sql()`
          select a.id::text as id, a.full_name as label, a.account_type::text as status,
                 coalesce(b.name, '') as barangay, a.created_at::date::text as date,
                 count(*) over()::int as total
            from ekapon.accounts a left join ekapon.barangays b on b.id = a.barangay_id
           where a.archived_at is null
             and (${filters.barangayId ?? null}::int is null or a.barangay_id = ${filters.barangayId ?? null})
             and (${filters.accountId ?? null}::bigint is null or a.id = ${filters.accountId ?? null})
             and ((${sample} and a.middle_name = 'Simulation') or (not ${sample} and a.middle_name is distinct from 'Simulation'))
             and (${filters.paravetId ?? null}::bigint is null or a.id = ${filters.paravetId ?? null})
             and (${filters.q} = '' or a.full_name ilike ${searchPattern} or a.account_type::text ilike ${searchPattern}
               or a.status::text ilike ${searchPattern} or a.id::text ilike ${searchPattern}
               or coalesce(b.name, '') ilike ${searchPattern} or a.created_at::date::text ilike ${searchPattern})
             and extract(year from a.created_at at time zone 'Asia/Manila') = ${filters.year}
           order by a.created_at desc, a.id limit 300`;
        sections.push({
          key: category, title: CATEGORY_LABELS[category], total: Number(rows[0]?.total ?? 0),
          records: rows.map((row) => ({ id: String(row.id), label: String(row.label), status: String(row.status), date: String(row.date), barangay: String(row.barangay), detail: '' })),
        });
        continue;
      }

      if (category === 'census') {
        const rows = await sql().unsafe(
          `select s.id::text as id, s.label, s.status, s.census_date::text as date,
                  coalesce(b.name, '') as barangay,
                  concat(s.households_visited, ' households · ', count(distinct o.id), ' owners · ', count(p.id), ' pets') as detail,
                  count(*) over()::int as total
             from ekapon.census_submissions s join ekapon.barangays b on b.id = s.barangay_id
             left join ekapon.census_owners o on o.submission_id = s.id
             left join ekapon.census_pets p on p.owner_id = o.id
            where ($1::int is null or s.barangay_id = $1)
              and (($2 and s.label like 'SIMULATION · %') or (not $2 and s.label not like 'SIMULATION · %'))
              and extract(year from s.census_date) = $3
              and ($4::bigint is null or s.submitted_by = $4)
              and ($5 = '' or s.label ilike $6 or s.status::text ilike $6 or s.source::text ilike $6
                   or s.submitter_name ilike $6 or b.name ilike $6 or s.census_date::text ilike $6
                   or s.households_visited::text ilike $6 or s.id::text ilike $6)
            group by s.id, b.name
            order by s.census_date desc, s.id limit 300`,
          [filters.barangayId ?? null, sample, filters.year, filters.accountId ?? filters.paravetId ?? null, filters.q, searchPattern],
        ) as unknown as Array<{ id: string; label: string; status: string; date: string; barangay: string; detail: string; total: number }>;
        sections.push({ key: category, title: CATEGORY_LABELS[category], total: Number(rows[0]?.total ?? 0), records: rows.map(({ total: _total, ...row }) => ({ ...row })) });
        continue;
      }

      const datasets = category === 'registry' ? ['owners'] :
        category === 'pets' ? ['pets'] :
        category === 'prelistings' ? [] :
        category === 'field-operations' ? ['respondents', 'households', 'animals', 'participants', 'programs', 'services', 'stubs'] : [];
      if (category === 'prelistings') {
        const rows = await sql().unsafe(
          `select p.reference as id, p.owner_name as label, p.program as status, p.submitted_at::date::text as date,
                  b.name as barangay, jsonb_array_length(p.pets)::text || ' pets' as detail,
                  count(*) over()::int as total
             from ekapon.prelistings p join ekapon.barangays b on b.id = p.barangay_id
            where ($1::int is null or p.barangay_id = $1)
              and extract(year from p.submitted_at at time zone 'Asia/Manila') = $2
              and ($3::bigint is null or p.user_id = $3)
              and ($4 = false)
              and ($5 = '' or p.owner_name ilike $6 or p.program ilike $6 or p.reference ilike $6
                   or p.pets::text ilike $6 or b.name ilike $6 or p.submitted_at::date::text ilike $6)
            order by p.submitted_at desc limit 300`,
          [filters.barangayId ?? null, filters.year, filters.accountId ?? null, sample, filters.q, searchPattern],
        ) as unknown as Array<{ id: string; label: string; status: string; date: string; barangay: string; detail: string; total: number }>;
        sections.push({ key: category, title: CATEGORY_LABELS[category], total: Number(rows[0]?.total ?? 0), records: rows.map(({ total: _total, ...row }) => ({ ...row })) });
        continue;
      }

      const matchedRows: SafeRecord[] = [];
      let total = 0;
      for (const dataset of datasets) {
        const clauses = [
          `dataset = '${dataset}'`,
          'archived = false',
          `(${sample} = coalesce(record_data->>'_sampleData' = 'true', false))`,
          `($1::int is null or lower(record_data->>'barangay') = lower((select name from ekapon.barangays where id = $1)))`,
          `($2::text is null or record_data->>'id' = $3)`,
          `($4::text is null or record_data->>'id' = $4 or record_data->>'owner_id' = $5 or ($6::text <> '' and lower(coalesce(record_data->>'owner_name', record_data->>'owner', '')) = lower($6)))`,
          `($7::text is null or record_data->>'paravet' = $7 or record_data->>'provider' = $7 or record_data->>'paravet_id' = $8)`,
          `($9::text is null or record_data->>'owner_id' = $10 or lower(coalesce(record_data->>'owner_name', record_data->>'owner', '')) = lower($9) or lower(coalesce(record_data->>'paravet', record_data->>'provider', '')) = lower($9))`,
          `(case when ${dateField} ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])' then substring(${dateField} from 1 for 4)::int end) = $11`,
          `($12 = '' or record_data::text ilike $13)`,
        ];
        const accountName = account?.name ?? null;
        const paravetName = paravet?.name ?? null;
        const params = [filters.barangayId ?? null, filters.petId ?? null, pet?.id ?? null, filters.petId ?? null, pet?.ownerId ?? null, pet?.owner ?? accountName, paravetName, filters.paravetId?.toString() ?? null, accountName, account?.owner_id?.toString() ?? '', filters.year, filters.q, searchPattern];
        const base = `from ekapon.dashboard_records where ${clauses.join(' and ')}`;
        const [count] = await sql().unsafe(`select count(*)::int as total ${base}`, params as never[]) as unknown as [{ total: number }];
        total += Number(count.total);
        const rows = await sql().unsafe(
          `select record_id as id,
                  coalesce(record_data->>'pet_name', record_data->>'petName', record_data->>'owner_name',
                           record_data->>'owner', record_data->>'name', record_data->>'title',
                           record_data->>'service', record_data->>'label', record_id) as label,
                  coalesce(record_data->>'status', record_data->>'outcome', record_data->>'verification_status', '') as status,
                  coalesce(substring(${dateField} from 1 for 10), '') as date,
                  coalesce(record_data->>'barangay', '') as barangay,
                  concat_ws(' · ', nullif(record_data->>'species', ''), nullif(record_data->>'service', ''),
                    nullif(record_data->>'paravet', ''), nullif(record_data->>'provider', '')) as detail
             ${base}
            order by ${dateField} desc nulls last, record_id limit ${Math.max(0, 300 - matchedRows.length)}`,
          params as never[],
        ) as unknown as Array<{ id: string; label: string; status: string; date: string; barangay: string; detail: string }>;
        matchedRows.push(...rows.map((row) => ({ ...row })));
      }
      if (category === 'overview') {
        const summary = await sql().unsafe(
          `select dataset, count(*)::int as total
             from ekapon.dashboard_records
            where archived = false and dataset = any($1::text[])
              and ($2 = coalesce(record_data->>'_sampleData' = 'true', false))
              and ($3::int is null or lower(record_data->>'barangay') = lower((select name from ekapon.barangays where id = $3)))
              and (case when ${dateField} ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])' then substring(${dateField} from 1 for 4)::int end) = $4
              and ($5 = '' or record_data::text ilike $6)
            group by dataset order by dataset`,
          [RECORD_DATASETS, sample, filters.barangayId ?? null, filters.year, filters.q, searchPattern],
        ) as unknown as Array<{ dataset: string; total: number }>;
        sections.push({
          key: category, title: CATEGORY_LABELS[category], total: summary.reduce((sum, row) => sum + Number(row.total), 0),
          records: summary.map((row) => ({ id: row.dataset, label: row.dataset, status: 'records', date: String(filters.year), barangay: barangay?.name ?? 'All barangays', detail: String(row.total) })),
        });
        continue;
      }
      sections.push({ key: category, title: CATEGORY_LABELS[category], total, records: matchedRows.slice(0, 300) });
    }

    const filteredSections = sections.filter((section) => {
      if (filters.accountId && !['accounts', 'prelistings', 'program-interest', 'registry', 'census'].includes(section.key)) return false;
      if (filters.paravetId && section.key !== 'accounts' && section.key !== 'field-operations' && section.key !== 'program-interest' && section.key !== 'census') return false;
      if (filters.petId && section.key !== 'pets' && section.key !== 'registry') return false;
      return true;
    });
    return ok({
      header: {
        office: 'City Veterinary Office',
        municipality: 'San Jose del Monte',
        title: filters.title || 'Municipal Veterinary Operations Report',
        year: filters.year,
        source: filters.source,
        methodologyVersion: ANALYTICS_METHODOLOGY_VERSION,
        generatedAt: new Date().toISOString(),
        preparedBy: session.name,
      },
      filters: {
        barangay: barangay ?? null,
        account: account ? { id: account.id, name: account.name, type: account.type } : null,
        pet: pet ?? null,
        paravet: paravet ? { id: paravet.id, name: paravet.name, code: paravet.code } : null,
      },
      categories: filteredSections,
    });
  },
});
