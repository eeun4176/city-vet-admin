import { z } from 'zod';
import { route, ok, parse } from '../../../server/http';
import { sql } from '../../../server/db';
import { requireAuth } from '../../../server/auth';
import { rolesWith } from '../../../shared/permissions';
import { todayManila } from '../../../server/census';

const query = z.object({
  barangayId: z.coerce.number().int().positive().optional(),
  year: z.coerce.number().int().min(2000).max(2100).default(() => Number(todayManila().slice(0, 4))),
});

/** Census front page totals for one barangay (or the whole city when no barangay is given). */
export default route({
  GET: async (c) => {
    await requireAuth(c.req, { roles: rolesWith('census.reports') });
    const { barangayId, year } = parse(query, c.query);
    const [barangay] = barangayId ? await sql()`select id, name::text as name from ekapon.barangays where id = ${barangayId}` : [null];
    const [totals] = await sql()`select * from ekapon.census_front_page(${barangayId ?? null}::int, ${year}::int)`;
    return ok({ barangay, year, totals });
  },
});
