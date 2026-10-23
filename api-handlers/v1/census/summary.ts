import { z } from 'zod';
import { route, ok, parse } from '../../../server/http';
import { sql } from '../../../server/db';
import { requireAuth } from '../../../server/auth';
import { rolesWith } from '../../../shared/permissions';

const query = z.object({ barangayId: z.coerce.number().int().positive() });

/** Census summary: one row per owner with dog/cat counts, built from the approved registry. */
export default route({
  GET: async (c) => {
    await requireAuth(c.req, { roles: rolesWith('census.reports') });
    const { barangayId } = parse(query, c.query);
    const [barangay] = await sql()`select id, name::text as name from ekapon.barangays where id = ${barangayId}`;
    const data = await sql()`select * from ekapon.census_summary_v where barangay_id = ${barangayId} order by lower(owner_name)`;
    return ok({ barangay: barangay ?? null, data });
  },
});
