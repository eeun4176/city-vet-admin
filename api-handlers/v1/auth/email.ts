import { z } from 'zod';
import { route, ok, parse } from '../../../server/http';
import { sql, tx } from '../../../server/db';
import { requireAuth } from '../../../server/auth';
import { AppError, conflict, unprocessable } from '../../../server/errors';
import { CODE_MINUTES, consumeCode, issueCode, sendMail } from '../../../server/emailCodes';

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send'), email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(254) }),
  z.object({ action: z.literal('verify'), code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from the email.') }),
]);

/**
 * A Paravet's email for password resets, set from Salin: `send` emails a code to the address,
 * `verify` checks it and only then saves the address, so a mistyped email never receives reset codes.
 */
export default route({
  POST: async (c) => {
    const s = await requireAuth(c.req, { roles: ['Paravet'] });
    const b = parse(body, c.body);
    if (b.action === 'send') {
      const [taken] = await sql()`select 1 from ekapon.accounts where lower(email) = ${b.email} and id <> ${s.id}`;
      if (taken) throw unprocessable('EMAIL_IN_USE', 'This email is already used by another account. Use a different email.', { field: 'email' });
      const code = await tx(s.id, (q) => issueCode(q, s.id, 'verify-email', b.email));
      if (!code) throw new AppError(429, 'TOO_MANY_CODES', 'Three codes were sent in the last 30 minutes. Wait a while, then try again.');
      await sendMail(b.email, 'Confirm your email for Salin',
        `Your code to confirm this email for Salin is ${code}.\n\nIt expires in ${CODE_MINUTES} minutes. City Veterinary Office will use this email only to send you password reset codes.\n\nIf you didn't ask for this, you can ignore this email.`);
      return ok({ sent: true, email: b.email, expiresInMinutes: CODE_MINUTES });
    }
    const email = await consumeCode(s.id, 'verify-email', b.code);
    try {
      await tx(s.id, (q) => q`update ekapon.accounts set email = ${email}, email_verified_at = now() where id = ${s.id}`);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw conflict('EMAIL_IN_USE', 'This email was just saved on another account. Use a different email.');
      throw error;
    }
    return ok({ email });
  },
});
