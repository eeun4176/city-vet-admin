import { z } from 'zod';
import { route, ok, created, parse } from '../../../server/http';
import { sql, tx } from '../../../server/db';
import { requireAuth } from '../../../server/auth';
import { listQuery } from '../../../server/listing';

const query = listQuery.pick({ page: true, pageSize: true }).extend({
  status: z.enum(['open', 'in_progress', 'resolved', 'dismissed', 'all']).default('open'),
});
const body = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(2000),
  severity: z.enum(['low', 'normal', 'high']).default('normal'),
});

export default route({
  GET: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin', 'Paravet'] });
    const f = parse(query, c.query);
    const canManage = session.type === 'SuperAdmin';
    const args = [f.status, canManage, session.id, f.pageSize, (f.page - 1) * f.pageSize];
    const base = `from ekapon.issue_reports i
      where ($1 = 'all' or i.status = $1) and ($2 or i.reporter_id = $3)`;
    const [{ total }] = await sql().unsafe(`select count(*)::int as total ${base}`, args.slice(0, 3) as never[]) as unknown as [{ total: number }];
    const data = await sql().unsafe(`
      select i.id, i.reporter_name as "reporterName", i.title, i.description, i.severity,
             i.status, i.resolution, i.resolved_by_name as "resolvedByName",
             i.resolved_at as "resolvedAt", i.created_at as "createdAt"
        ${base}
       order by case when i.status in ('open', 'in_progress') then 0 else 1 end, i.created_at desc, i.id desc
       limit $4 offset $5`, args as never[]) as unknown as Record<string, unknown>[];
    return ok({ data, page: f.page, pageSize: f.pageSize, total });
  },

  POST: async (c) => {
    const session = await requireAuth(c.req, { roles: ['Admin', 'Paravet'] });
    const input = parse(body, c.body);
    const [{ id }] = await tx(session.id, (q) => q`
      select ekapon.submit_issue_report(${input.title}, ${input.description}, ${input.severity}) as id`);
    return created({ id });
  },
});
