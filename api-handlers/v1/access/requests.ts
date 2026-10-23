import { z } from 'zod';
import { route, ok, created, parse } from '../../../server/http';
import { sql, tx } from '../../../server/db';
import { requireAuth } from '../../../server/auth';
import { listQuery } from '../../../server/listing';
import { GRANT_PERMISSIONS } from '../../../shared/permissions';

const query = listQuery.pick({ page: true, pageSize: true }).extend({
  status: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending'),
});
const body = z.object({
  permission: z.enum(GRANT_PERMISSIONS),
  barangayId: z.coerce.number().int().positive().nullable().optional(),
  reason: z.string().trim().min(3).max(300),
});

export default route({
  GET: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin'] });
    const f = parse(query, c.query);
    const staff = session.type === 'SuperAdmin';
    const args = [f.status, staff, session.id, f.pageSize, (f.page - 1) * f.pageSize];
    const base = `from ekapon.permission_requests r
      left join ekapon.accounts a on a.id = r.requester_id
      left join ekapon.barangays b on b.id = r.barangay_id
      where ($1 = 'all' or r.status = $1) and ($2 or r.requester_id = $3)`;
    const [{ total }] = await sql().unsafe(`select count(*)::int as total ${base}`, args.slice(0, 3) as never[]) as unknown as [{ total: number }];
    const data = await sql().unsafe(`
      select r.id, r.requester_id as "requesterId", r.requester_name as "requesterName",
             a.account_type::text as "requesterType", r.permission,
             r.barangay_id as "barangayId", b.name as barangay, r.reason, r.status,
             r.decided_by_name as "decidedByName", r.decided_at as "decidedAt",
             r.decision_reason as "decisionReason", r.remarks, r.grant_id as "grantId",
             r.created_at as "createdAt"
        ${base}
       order by case when r.status = 'pending' then 0 else 1 end, r.created_at desc, r.id desc
       limit $4 offset $5`, args as never[]) as unknown as Record<string, unknown>[];
    return ok({ data, page: f.page, pageSize: f.pageSize, total });
  },

  POST: async (c) => {
    const session = await requireAuth(c.req, { roles: ['Admin'] });
    const input = parse(body, c.body);
    const [{ id }] = await tx(session.id, (q) =>
      q`select ekapon.request_permission(${input.permission}, ${input.barangayId ?? null}, ${input.reason}) as id`);
    return created({ id });
  },
});
