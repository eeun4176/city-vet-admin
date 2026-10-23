import { route, ok } from '../../server/http';
import { sql } from '../../server/db';
import { requireAuth } from '../../server/auth';

export default route({
  GET: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin'] });
    const rows = await sql()`
      select dataset, record_id, record_data, archived, created_at, updated_at
        from ekapon.dashboard_records
       where record_data->>'_sampleBatchId' in ('module-c-local-sample-v1', 'module-c-mock-simulation-v2', 'module-c-mock-simulation-v3', 'module-c-mock-simulation-v4')
       order by dataset, record_id`;
    const body = {
      format: 'module-c-mock-simulation-v4',
      exportedAt: new Date().toISOString(),
      exportedBy: { accountId: session.id, username: session.username },
      contains: { sampleRecords: rows.length },
      data: { sampleRecords: rows },
    };
    return ok(body, { 'Content-Disposition': `attachment; filename="module-c-samples-${new Date().toISOString().slice(0, 10)}.json"` });
  },
});
