import { route, ok } from '../../server/http';
import { sql, tx } from '../../server/db';
import { requireAuth } from '../../server/auth';

const BATCHES = [
  'module-c-local-sample-v1',
  'module-c-mock-simulation-v2',
  'module-c-mock-simulation-v3',
  'module-c-mock-simulation-v4',
];

export default route({
  GET: async (c) => {
    await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin'] });
    const [row] = await sql()`select count(*)::int as count from ekapon.dashboard_records where record_data->>'_sampleBatchId' = any(${BATCHES}::text[])`;
    return ok({ count: row.count, batchId: BATCHES[BATCHES.length - 1] });
  },
  DELETE: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin'] });
    const removed = await tx(session.id, async (q) => q`
      delete from ekapon.dashboard_records where record_data->>'_sampleBatchId' = any(${BATCHES}::text[]) returning record_id
    `);
    return ok({ deleted: removed.length });
  },
});
