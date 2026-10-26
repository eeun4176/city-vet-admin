import { z } from 'zod';
import { route, ok, parse } from '../../../server/http';
import { tx } from '../../../server/db';
import { requireAuth, sessionCookie } from '../../../server/auth';
import { AppError, conflict, unprocessable } from '../../../server/errors';

const body = z.object({
  currentPassword: z.string().min(1).max(200),
  username: z.string().trim().min(3, 'Username must be at least 3 characters.').max(64).regex(/^[A-Za-z0-9._-]+$/, 'Use letters, numbers, dots, dashes or underscores only.').optional(),
  newPassword: z.string().min(8).max(200).optional(),
  confirmPassword: z.string().max(200).optional(),
}).refine((v) => v.username !== undefined || v.newPassword !== undefined, { message: 'Enter a new username or a new password.' })
  .refine((v) => v.newPassword === undefined || v.newPassword === v.confirmPassword, { message: 'The passwords do not match.', path: ['confirmPassword'] });

/** An Admin changes their own username and/or password after confirming the current password. A new password signs out their other sessions. */
export default route({
  PATCH: async (c) => {
    const s = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin'] });
    const b = parse(body, c.body);
    const [check] = await tx(s.id, (q) => q`select * from ekapon.verify_password(${s.username ?? ''}, ${b.currentPassword}, ${c.ip}::inet)`);
    if (!check.o_ok) {
      if (check.o_reason === 'locked') throw new AppError(423, 'ACCOUNT_LOCKED', 'This account is locked after too many wrong passwords. Wait 15 minutes and try again.');
      throw unprocessable('WRONG_PASSWORD', 'Your current password is incorrect.', { field: 'currentPassword' });
    }
    try {
      await tx(s.id, async (q) => {
        if (b.username !== undefined && b.username !== s.username) await q`update ekapon.accounts set username = ${b.username} where id = ${s.id}`;
        if (b.newPassword !== undefined) {
          await q`select ekapon.set_permanent_password(${s.id}::bigint, ${b.newPassword})`;
          await q`update ekapon.accounts set sessions_valid_after = date_trunc('second', now()) where id = ${s.id}`;
        }
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw conflict('USERNAME_TAKEN', 'That username is already used by another account.', { field: 'username' });
      throw error;
    }
    // The new cookie is issued after sessions_valid_after, so this browser stays signed in.
    return ok({ changed: true }, b.newPassword !== undefined ? { 'Set-Cookie': await sessionCookie({ id: s.id, type: s.type }, 'full') } : undefined);
  },
});
