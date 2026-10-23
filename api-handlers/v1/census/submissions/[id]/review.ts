import { z } from 'zod';
import { route, ok, parse } from '../../../../../server/http';
import { tx } from '../../../../../server/db';
import { requireAuth } from '../../../../../server/auth';
import { idParam } from '../../../../../server/census';
import { recordCensusDecision } from '../../../../../server/censusReview';

const body = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(500).default(''), reviewToken: z.string().max(3000).optional() });

/** Approve (applies every owner decision to the registry atomically) or reject (reason required). */
export default route({
  POST: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin'] });
    const id = parse(idParam, c.query.id);
    const { decision, note, reviewToken } = parse(body, c.body);
    const result = await tx(session.id, (q) => recordCensusDecision(q, session, id, decision, note, reviewToken));
    return ok(result);
  },
});
