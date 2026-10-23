import { route, ok } from '../../../server/http';
import { requireAuth } from '../../../server/auth';
import { sql } from '../../../server/db';
import { dashboardOverview } from '../../../server/dashboardOverview';

export default route({
  GET: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin', 'Paravet'] });
    const result = await sql().begin('isolation level repeatable read read only', q => dashboardOverview(q, session));
    return ok(result, { 'Cache-Control': 'no-store' });
  },
});
