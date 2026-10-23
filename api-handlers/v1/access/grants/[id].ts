import { z } from 'zod';
import { route, ok, parse } from '../../../../server/http';
import { tx } from '../../../../server/db';
import { requireAuth } from '../../../../server/auth';

const idSchema = z.coerce.number().int().positive();
const body = z.object({ reason: z.string().trim().min(3).max(300) });

export default route({
  DELETE: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin'] });
    const id = parse(idSchema, c.query.id);
    const { reason } = parse(body, c.body);
    await tx(session.id, (q) => q`select ekapon.revoke_access(${id}, ${reason})`);
    return ok({ revoked: true });
  },
});
