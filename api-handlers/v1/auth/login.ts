import { z } from 'zod';
import { route, ok, parse } from '../../../server/http';
import { sql, tx } from '../../../server/db';
import { sessionCookie, sessionToken } from '../../../server/auth';
import { AppError } from '../../../server/errors';
import { config } from '../../../server/config';

const body = z.object({ identifier: z.string().trim().min(1).max(64), password: z.string().min(1).max(200), client: z.enum(['web', 'salin']).default('web') });

/** Staff sign in with a username; Paravets with their account key, once they have a permanent password, and only from Salin (client: 'salin' gets a token instead of the cookie). */
export default route({
  POST: async (c) => {
    const { identifier, password, client } = parse(body, c.body);
    if (c.ip) {
      const [{ n }] = await sql()`select ekapon.recent_failed_logins(${c.ip}::inet, 15) as n`;
      if (n >= config().loginIpMaxFailures) throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many failed sign-in attempts. Please wait 15 minutes and try again.');
    }
    const [r] = await tx(null, (q) => q`select * from ekapon.verify_password(${identifier}, ${password}, ${c.ip}::inet)`);
    if (!r.o_ok) {
      switch (r.o_reason) {
        case 'locked': throw new AppError(423, 'ACCOUNT_LOCKED', 'This account is locked. Wait 15 minutes or ask the administrator.');
        case 'on_hold': throw new AppError(403, 'ACCOUNT_ON_HOLD', 'Your account is on hold. Please contact the City Veterinary Office.');
        case 'use_temporary_password':
        case 'must_reset': throw new AppError(403, 'FIRST_SIGN_IN_REQUIRED', 'Use the first sign-in with your temporary password to create a new password.');
        default: throw new AppError(401, 'INVALID_CREDENTIALS', 'The username/account key or password is incorrect.');
      }
    }
    const [a] = await sql()`select a.id, a.account_type::text as type, a.full_name, a.username::text as username, a.account_key, a.barangay_id, b.name::text as barangay from ekapon.accounts a left join ekapon.barangays b on b.id = a.barangay_id where a.id = ${r.o_account_id}`;
    if (a.type === 'User') throw new AppError(403, 'USER_ACCESS_REMOVED', 'Resident sign-in has been retired. Contact staff for assistance.');
    if (client === 'web' && a.type === 'Paravet') throw new AppError(403, 'USE_SALIN', 'Paravets sign in with the Salin app.');
    const account = { id: a.id, type: a.type, name: a.full_name, username: a.username, accountKey: a.account_key, barangayId: a.barangay_id, barangay: a.barangay };
    if (client === 'salin') return ok({ account, ...(await sessionToken({ id: a.id, type: a.type }, 'full')) });
    return ok({ account }, { 'Set-Cookie': await sessionCookie({ id: a.id, type: a.type }, 'full') });
  },
});
