import { z } from 'zod';
import { route, ok, parse } from '../../../../../server/http';
import { tx } from '../../../../../server/db';
import { requireAuth } from '../../../../../server/auth';

const idSchema = z.coerce.number().int().positive();
const body = z.object({
  approve: z.boolean(),
  reason: z.string().trim().min(3).max(300),
  remarks: z.string().trim().min(1).max(500),
  days: z.coerce.number().int().min(1).max(30).default(7),
});

export default route({
  POST: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin'] });
    const id = parse(idSchema, c.query.id);
    const input = parse(body, c.body);
    await tx(session.id, (q) => q`
      select ekapon.decide_permission_request(${id}, ${input.approve},
        ${input.reason}, ${input.remarks}, ${input.days})`);
    return ok({ decided: true, status: input.approve ? 'approved' : 'rejected' });
  },
});
