import { z } from 'zod';
import { route, ok, parse } from '../../../../../server/http';
import { tx } from '../../../../../server/db';
import { requireAuth } from '../../../../../server/auth';
import { unprocessable } from '../../../../../server/errors';
import { accessSubmission, idParam } from '../../../../../server/census';
import { approvalPlan, comparison, verifyComparison } from '../../../../../server/censusReviewPlan';
import { registryLock } from '../../../../../server/registry';
import { jsonValue } from '../../../../../server/dashboard';

const body = z.object({
  decisions: z.array(z.object({
    ownerId: z.string().uuid(),
    decision: z.enum(['new', 'merge', 'replace', 'keep', 'reject']),
    matchedOwnerId: z.string().uuid().nullish(),
    reason: z.string().trim().max(1000).default(''),
    comparisonToken: z.string().max(3000).optional(),
  })).min(1).max(200),
});

/** Admin / SuperAdmin choose, owner by owner, what approval will do. Nothing reaches the registry until the review is approved. */
export default route({
  GET: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin'] });
    const id = parse(idParam, c.query.id);
    const input = parse(z.object({ ownerId: z.string().uuid().optional(), matchedOwnerId: z.string().uuid().optional(),
      decision: z.enum(['merge','replace','keep']).optional() }), c.query);
    const result = await tx(session.id, async (q) => {
      await registryLock(q);
      await accessSubmission(q, id, session);
      if (input.ownerId || input.matchedOwnerId || input.decision) {
        await accessSubmission(q, id, session, true);
        if (!input.ownerId || !input.matchedOwnerId || !input.decision) throw unprocessable('MATCH_REQUIRED', 'Choose an owner entry, registry owner, and action.');
        return comparison(q, session.id, id, input.ownerId, input.matchedOwnerId, input.decision);
      }
      const { fingerprint: _internal, ...plan } = await approvalPlan(q, session.id, id);
      return plan;
    });
    return ok(result);
  },
  PUT: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin'] });
    const id = parse(idParam, c.query.id);
    const { decisions } = parse(body, c.body);
    if (new Set(decisions.map((d) => d.ownerId)).size !== decisions.length) throw unprocessable('OWNER_REPEATED', 'Choose one decision per owner entry.');
    await tx(session.id, async (q) => {
      await registryLock(q);
      await q`select id from ekapon.census_submissions where id=${id}::uuid for update`;
      const submission = await accessSubmission(q, id, session, true);
      for (const item of decisions) {
        const needsMatch = item.decision === 'merge' || item.decision === 'replace' || item.decision === 'keep';
        if (needsMatch && !item.matchedOwnerId) throw unprocessable('MATCH_REQUIRED', 'Choose which registry owner this decision refers to.');
        if (needsMatch && item.reason.length < 3) throw unprocessable('MATCH_REASON_REQUIRED', 'Explain the selected owner match in at least three characters.');
        if (item.matchedOwnerId) {
          const [match] = await q`
            select id from ekapon.registry_owners
             where id = ${item.matchedOwnerId}::uuid and barangay_id = ${submission.barangay_id} and archived_at is null`;
          if (!match) throw unprocessable('MATCH_NOT_FOUND', 'That registry owner is not in this barangay or is archived.');
        }
        const fingerprint = needsMatch ? await verifyComparison(q, session.id, id, item) : null;
        const [before] = await q`select id,owner_name,decision,matched_owner_id,decision_reason,match_fingerprint from ekapon.census_owners where id=${item.ownerId}::uuid and submission_id=${id}::uuid`;
        if (!before) throw unprocessable('OWNER_NOT_FOUND', 'One of the owners is not part of this submission.');
        const updated = await q`
          update ekapon.census_owners
             set decision = ${item.decision}, matched_owner_id = ${needsMatch ? item.matchedOwnerId ?? null : null},
                 decision_reason=${item.reason || null}, match_fingerprint=${fingerprint}
           where id = ${item.ownerId}::uuid and submission_id = ${id}::uuid
          returning id`;
        if (!updated.length) throw unprocessable('OWNER_NOT_FOUND', 'One of the owners is not part of this submission.');
        await q`insert into ekapon.census_decision_activity(submission_id,census_owner_id,actor_id,actor_name,before_data,after_data)
          values(${id}::uuid,${item.ownerId}::uuid,${session.id},${session.name},${q.json(jsonValue(before))},
          ${q.json(jsonValue({ ownerName: before.owner_name, decision: item.decision, matchedOwnerId: needsMatch ? item.matchedOwnerId : null, reason: item.reason || null, fingerprint }))})`;
      }
    });
    return ok({ saved: decisions.length });
  },
}, { maxBody: 600_000 });
