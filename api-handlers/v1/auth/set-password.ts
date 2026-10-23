import { z } from 'zod';
import { route, ok, parse } from '../../../server/http';
import { tx } from '../../../server/db';
import { requireAuth, sessionCookie, sessionToken } from '../../../server/auth';
import { PARAVET_POLICY_VERSION } from '../../../shared/paravetPolicy';
import { unprocessable } from '../../../server/errors';

const body = z.object({ newPassword: z.string().min(8).max(200), confirmPassword: z.string().min(1).max(200),acceptedTerms:z.boolean().optional(),acknowledgedPrivacy:z.boolean().optional(),policyVersion:z.string().optional(),policyLanguage:z.enum(['en','fil']).default('en') })
  .refine((v) => v.newPassword === v.confirmPassword, { message: 'The passwords do not match.', path: ['confirmPassword'] });

/** Step 2: mandatory "Create New Password". Only reachable with the restricted session from first-signin. */
export default route({
  POST: async (c) => {
    const s = await requireAuth(c.req, { scope: 'reset' });
    const b = parse(body, c.body);
    if(s.type==='Paravet'&&(!b.acceptedTerms||!b.acknowledgedPrivacy||b.policyVersion!==PARAVET_POLICY_VERSION))throw unprocessable('AGREEMENT_REQUIRED','Read and accept the current Paravet terms and acknowledge the privacy notice before setting your password.');
    await tx(s.id, async q => {
      await q`select ekapon.set_permanent_password(${s.id}::bigint, ${b.newPassword})`;
      if(s.type==='Paravet')await q`insert into ekapon.policy_acceptances(account_id,policy_version,language) values(${s.id},${PARAVET_POLICY_VERSION},${b.policyLanguage})`;
    });
    const account = { id: s.id, type: s.type, name: s.name, accountKey: s.key, barangayId: s.barangayId, barangay: s.barangay };
    if (s.client === 'salin') return ok({ account, ...(await sessionToken({ id: s.id, type: s.type }, 'full')) });
    return ok({ account }, { 'Set-Cookie': await sessionCookie({ id: s.id, type: s.type }, 'full') });
  },
});
