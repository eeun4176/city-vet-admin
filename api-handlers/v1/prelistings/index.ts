import { z } from 'zod';
import { route, ok, parse } from '../../../server/http';
import { sql } from '../../../server/db';
import { requireAuth } from '../../../server/auth';
import { likePattern, listQuery } from '../../../server/listing';
import { AppError, unprocessable } from '../../../server/errors';
const query = listQuery.pick({ page: true, pageSize: true, q: true, year: true, month: true, dir: true }).extend({
  sort: z.enum(['date', 'owner', 'barangay', 'program']).default('date'),
});

export default route({
  GET: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin', 'Paravet'] });
    const f = parse(query, c.query);
    const search = f.q ? likePattern(f.q) : null;
    const barangayScope = session.type === 'Paravet';
    const barangayId = session.barangayId ?? -1;
    const [{ total }] = await sql()`
      select count(*)::int as total
        from ekapon.prelistings p
        join ekapon.barangays b on b.id = p.barangay_id
       where (not ${barangayScope} or p.barangay_id = ${barangayId})
         and (${search}::text is null or p.reference ilike ${search} or p.owner_name ilike ${search}
              or p.mobile ilike ${search} or b.name ilike ${search} or p.program ilike ${search}
              or p.pets::text ilike ${search})
         and (${f.year ?? null}::int is null or extract(year from p.submitted_at at time zone 'Asia/Manila') = ${f.year ?? null})
         and (${f.month ?? null}::int is null or extract(month from p.submitted_at at time zone 'Asia/Manila') = ${f.month ?? null})`;
    const rows = await sql()`
      select p.reference, p.owner_name, p.mobile, b.name as barangay, p.program, p.pets,
             (p.submitted_at at time zone 'Asia/Manila')::date::text as date
        from ekapon.prelistings p
        join ekapon.barangays b on b.id = p.barangay_id
        where (not ${barangayScope} or p.barangay_id = ${barangayId})
          and (${search}::text is null or p.reference ilike ${search} or p.owner_name ilike ${search}
               or p.mobile ilike ${search} or b.name ilike ${search} or p.program ilike ${search}
               or p.pets::text ilike ${search})
          and (${f.year ?? null}::int is null or extract(year from p.submitted_at at time zone 'Asia/Manila') = ${f.year ?? null})
          and (${f.month ?? null}::int is null or extract(month from p.submitted_at at time zone 'Asia/Manila') = ${f.month ?? null})
       order by
         case when ${f.sort} = 'date' and ${f.dir} = 'asc' then p.submitted_at end asc,
         case when ${f.sort} = 'date' and ${f.dir} = 'desc' then p.submitted_at end desc,
         case when ${f.sort} = 'owner' and ${f.dir} = 'asc' then p.owner_name end asc,
         case when ${f.sort} = 'owner' and ${f.dir} = 'desc' then p.owner_name end desc,
         case when ${f.sort} = 'barangay' and ${f.dir} = 'asc' then b.name end asc,
         case when ${f.sort} = 'barangay' and ${f.dir} = 'desc' then b.name end desc,
         case when ${f.sort} = 'program' and ${f.dir} = 'asc' then p.program end asc,
         case when ${f.sort} = 'program' and ${f.dir} = 'desc' then p.program end desc,
         p.submitted_at desc, p.reference
       limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}`;
    return ok({
      data: rows.map((row) => ({
        ref: row.reference, owner: row.owner_name, mobile: row.mobile, barangay: row.barangay,
        program: row.program, pets: row.pets, date: row.date,
      })),
      page: f.page, pageSize: f.pageSize, total,
    });
  },

  POST: async (c) => {
    await requireAuth(c.req);
    throw new AppError(410, 'PRELISTING_RETIRED', 'Resident pre-listing has been retired. Paravets now record program interest from the staff workspace.');
  },
});
