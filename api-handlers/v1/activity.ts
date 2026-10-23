import { z } from 'zod';
import { route, ok, parse } from '../../server/http';
import { sql, tx } from '../../server/db';
import { requireAuth } from '../../server/auth';
import { likePattern, listQuery } from '../../server/listing';

const query = listQuery.pick({ page: true, pageSize: true, q: true, year: true, month: true, dir: true }).extend({
  sort: z.enum(['time', 'user', 'action']).default('time'),
});
const bodySchema = z.object({
  action: z.string().trim().min(1).max(100),
  detail: z.string().trim().max(1000).default(''),
});

export default route({
  GET: async (c) => {
    await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin'] });
    const filter = parse(query, c.query);
    const args = [
      filter.q ? likePattern(filter.q) : null,
      filter.year ?? null,
      filter.month ?? null,
      filter.sort,
      filter.dir,
      filter.pageSize,
      (filter.page - 1) * filter.pageSize,
    ];
    const where = `l.table_name = 'activity'
       and ($1::text is null
         or coalesce(a.username::text, a.full_name, 'System') ilike $1
         or coalesce(l.new_data->>'action', '') ilike $1
         or coalesce(l.record_id, '') ilike $1)
       and ($2::int is null or extract(year from l.created_at at time zone 'Asia/Manila') = $2)
       and ($3::int is null or extract(month from l.created_at at time zone 'Asia/Manila') = $3)`;
    const [{ total }] = await sql().unsafe(`
      select count(*)::int as total from ekapon.audit_log l
      left join ekapon.accounts a on a.id = l.account_id where ${where}`, args.slice(0, 3) as never[]) as unknown as [{ total: number }];
    const rows = await sql().unsafe(`
      select l.id, l.created_at, coalesce(a.username::text, a.full_name, 'System') as username,
             l.new_data->>'action' as action, l.record_id as detail
        from ekapon.audit_log l
        left join ekapon.accounts a on a.id = l.account_id
       where ${where}
       order by
         case when $4 = 'time' and $5 = 'asc' then l.created_at end asc,
         case when $4 = 'time' and $5 = 'desc' then l.created_at end desc,
         case when $4 = 'user' and $5 = 'asc' then coalesce(a.username::text, a.full_name, 'System') end asc,
         case when $4 = 'user' and $5 = 'desc' then coalesce(a.username::text, a.full_name, 'System') end desc,
         case when $4 = 'action' and $5 = 'asc' then l.new_data->>'action' end asc,
         case when $4 = 'action' and $5 = 'desc' then l.new_data->>'action' end desc,
         l.created_at desc, l.id desc
       limit $6 offset $7`, args as never[]) as unknown as {
        id: number; created_at: Date | string; username: string; action: string | null; detail: string | null;
      }[];
    return ok({
      data: rows.map((row) => ({
        id: String(row.id),
        time: new Date(row.created_at).toISOString().slice(0, 19).replace('T', ' '),
        user: row.username,
        action: row.action,
        detail: row.detail ?? '',
      })),
      page: filter.page, pageSize: filter.pageSize, total,
    });
  },

  POST: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin'] });
    const { action, detail } = parse(bodySchema, c.body);
    await tx(session.id, (q) => q`select ekapon.log_activity(${action}, ${detail})`);
    return ok({ logged: true });
  },
});
