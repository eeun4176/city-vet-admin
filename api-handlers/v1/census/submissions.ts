import { z } from 'zod';
import { route, ok, created, parse } from '../../../server/http';
import { sql, tx } from '../../../server/db';
import { requireAuth } from '../../../server/auth';
import { listQuery } from '../../../server/listing';
import { forbidden } from '../../../server/errors';
import { createBody, fetchSubmission, submissionOut, writeContent } from '../../../server/census';

const query = listQuery.pick({ page: true, pageSize: true }).extend({
  status: z.enum(['pending', 'approved', 'rejected', 'withdrawn', 'all']).default('all'),
  barangayId: z.coerce.number().int().positive().optional(),
  q: z.string().trim().max(100).default(''),
  sort: z.enum(['created', 'date', 'barangay', 'title', 'submitter', 'status', 'owners', 'pets']).default('created'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export default route({
  GET: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin', 'Paravet'] });
    const f = parse(query, c.query);
    const staff = session.type !== 'Paravet';
    const args: unknown[] = [f.status, staff, session.id, f.barangayId ?? null, f.q, `%${f.q}%`];
    const where = [
      "($1 = 'all' or s.status = $1)",
      '($2 or s.submitted_by = $3)',
      '($4::int is null or s.barangay_id = $4)',
      "($5 = '' or s.label ilike $6 or b.name ilike $6 or s.submitter_name ilike $6)",
    ];
    if (f.year) { args.push(f.year); where.push(`extract(year from s.census_date) = $${args.length}`); }
    if (f.month) { args.push(f.month); where.push(`extract(month from s.census_date) = $${args.length}`); }
    const orderBy: Record<typeof f.sort, string> = {
      created: 's.created_at',
      date: 's.census_date',
      barangay: 'b.name',
      title: 's.label',
      submitter: 's.submitter_name',
      status: 's.status',
      owners: '(select count(*) from ekapon.census_owners o where o.submission_id = s.id)',
      pets: '(select count(*) from ekapon.census_pets p join ekapon.census_owners o on o.id = p.owner_id where o.submission_id = s.id)',
    };
    const base = `from ekapon.census_submissions s join ekapon.barangays b on b.id = s.barangay_id where ${where.join(' and ')}`;
    const [{ total }] = await sql().unsafe(`select count(*)::int as total ${base}`, args as never[]) as unknown as [{ total: number }];
    const direction = f.dir === 'asc' ? 'asc' : 'desc';
    const data = await sql().unsafe(`
      select s.id, s.label, s.status, s.source, s.census_date, s.households_visited, s.barangay_id, b.name as barangay,
             s.submitter_name, s.created_at, s.reviewer_name, s.reviewed_at, s.review_note, s.resubmits_id,
             (select count(*)::int from ekapon.census_owners o where o.submission_id = s.id) as owner_count,
             (select count(*)::int from ekapon.census_pets p join ekapon.census_owners o on o.id = p.owner_id where o.submission_id = s.id) as pet_count,
             (select count(*)::int from ekapon.census_attachments a where a.submission_id = s.id) as attachment_count
        ${base} order by ${orderBy[f.sort]} ${direction} nulls last, s.id desc
       limit $${args.length + 1} offset $${args.length + 2}`,
    [...args, f.pageSize, (f.page - 1) * f.pageSize] as never[]) as unknown as Record<string, unknown>[];
    return ok({ data: data.map(submissionOut), page: f.page, pageSize: f.pageSize, total });
  },

  POST: async (c) => {
    const session = await requireAuth(c.req, { roles: ['Paravet'] });
    if (!session.barangayId) throw forbidden('Your account must be assigned to a barangay before submitting census data.');
    const body = parse(createBody, c.body);
    const barangayId = session.barangayId;
    const id = await tx(session.id, async (q) => {
      const [row] = await q`
        insert into ekapon.census_submissions (barangay_id, submitted_by, submitter_name, source, census_date, label, households_visited)
        values (${barangayId}, ${session.id}, ${session.name}, ${body.source}, ${body.censusDate}::date, ${body.label}, ${body.householdsVisited})
        returning id`;
      await writeContent(q, row.id, body.owners);
      await q`select ekapon.notify_census_submitted(${row.id}::uuid)`;
      return row.id as string;
    });
    return created({ submission: submissionOut(await fetchSubmission(sql(), id)) });
  },
}, { maxBody: 600_000 });
