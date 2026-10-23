import { z } from 'zod';
import { route, ok, parse } from '../../server/http';
import { sql } from '../../server/db';
import { requireAuth } from '../../server/auth';

const querySchema = z.object({ view: z.enum(['unread', 'read', 'archived', 'all']).default('all') });
const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('read'), id: z.number().int().positive() }),
  z.object({ action: z.literal('read-all') }),
  z.object({ action: z.literal('archive'), id: z.number().int().positive() }),
  z.object({ action: z.literal('restore'), id: z.number().int().positive() }),
]);

export default route({
  GET: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin', 'Paravet'] });
    const { view } = parse(querySchema, c.query);
    const [counts, rows] = await Promise.all([
      sql()`select count(*) filter (where archived_at is null and read_at is null)::int as unread,
                   count(*) filter (where archived_at is null and read_at is not null)::int as read,
                   count(*) filter (where archived_at is not null)::int as archived
              from ekapon.notifications where recipient_id = ${session.id}`,
      sql()`select id, kind, title, body, link, created_at, read_at, archived_at
             from ekapon.notifications
            where recipient_id = ${session.id}
              and (${view === 'all'} or (${view === 'unread'} and archived_at is null and read_at is null)
                or (${view === 'read'} and archived_at is null and read_at is not null)
                or (${view === 'archived'} and archived_at is not null))
            order by created_at desc limit 200`,
    ]);
    return ok({ data: rows, unread: counts[0].unread, counts: counts[0], view });
  },
  PATCH: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin', 'Paravet'] });
    const body = parse(bodySchema, c.body);
    if (body.action === 'read-all') {
      const [{ updated }] = await sql()`with changed as (
        update ekapon.notifications set read_at = now()
         where recipient_id = ${session.id} and read_at is null and archived_at is null returning 1
      ) select count(*)::int as updated from changed`;
      return ok({ updated });
    }
    if (body.action === 'read') {
      const [{ updated }] = await sql()`with changed as (
        update ekapon.notifications set read_at = coalesce(read_at, now())
         where id = ${body.id} and recipient_id = ${session.id} and archived_at is null returning 1
      ) select count(*)::int as updated from changed`;
      return ok({ updated });
    }
    if (body.action === 'archive') {
      const [{ updated }] = await sql()`with changed as (
        update ekapon.notifications set archived_at = now(), read_at = coalesce(read_at, now())
         where id = ${body.id} and recipient_id = ${session.id} and archived_at is null returning 1
      ) select count(*)::int as updated from changed`;
      return ok({ updated });
    }
    const [{ updated }] = await sql()`with changed as (
      update ekapon.notifications set archived_at = null
       where id = ${body.id} and recipient_id = ${session.id} and archived_at is not null returning 1
    ) select count(*)::int as updated from changed`;
    return ok({ updated });
  },
});
