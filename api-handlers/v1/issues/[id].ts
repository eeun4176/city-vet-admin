import { z } from 'zod';
import { route, ok, parse } from '../../../server/http';
import { tx } from '../../../server/db';
import { requireAuth } from '../../../server/auth';

const idSchema = z.coerce.number().int().positive();
const body = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'dismissed']),
  resolution: z.string().trim().max(1000).default(''),
}).refine((value) => !['resolved', 'dismissed'].includes(value.status) || value.resolution.length >= 3, {
  message: 'A resolution of at least 3 characters is required.',
  path: ['resolution'],
});

export default route({
  PATCH: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin'] });
    const id = parse(idSchema, c.query.id);
    const input = parse(body, c.body);
    await tx(session.id, (q) =>
      q`select ekapon.update_issue_report(${id}, ${input.status}, ${input.resolution || null})`);
    return ok({ id, status: input.status });
  },
});
