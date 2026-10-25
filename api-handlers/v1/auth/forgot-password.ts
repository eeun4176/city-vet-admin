import { z } from 'zod';
import { route, ok, parse } from '../../../server/http';
import { sql, tx } from '../../../server/db';
import { AppError } from '../../../server/errors';
import { config } from '../../../server/config';
import { CODE_MINUTES, consumeCode, issueCode, mailReady, sendMail } from '../../../server/emailCodes';

const identifier = z.string().trim().min(1).max(64);
const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send'), identifier }),
  z.object({
    action: z.literal('reset'), identifier,
    code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from the email.'),
    newPassword: z.string().min(8, 'Use at least 8 characters.').max(200).regex(/[A-Za-z]/, 'Include at least one letter.').regex(/[0-9]/, 'Include at least one number.'),
  }),
]);

const SENT = 'If this account has a confirmed email, a 6-digit code is on its way. Check the inbox and spam folder.';
const WRONG = new AppError(401, 'INVALID_CODE', 'That code is not right or has expired. Check the latest email, or send a new code.');

/**
 * Forgotten password, for Paravets with a confirmed email (set in Salin): `send` emails a code, `reset` checks it and sets the new password.
 * Replies never say whether an account or email exists. A reset signs the account out on every other device.
 */
export default route({
  POST: async (c) => {
    const b = parse(body, c.body);
    if (!mailReady()) throw new AppError(503, 'EMAIL_NOT_CONFIGURED', 'Password reset by email is not set up yet. Ask the City Veterinary Office to reset your password.');
    if (c.ip) {
      const [{ n }] = await sql()`select ekapon.recent_failed_logins(${c.ip}::inet, 15) as n`;
      if (n >= config().loginIpMaxFailures) throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Too many attempts. Please wait 15 minutes and try again.');
    }
    const [account] = await sql()`select id, email from ekapon.accounts
      where (lower(username) = lower(${b.identifier}) or account_key = upper(btrim(${b.identifier})))
        and account_type = 'Paravet' and status = 'Active' and archived_at is null
        and email is not null and email_verified_at is not null`;
    if (b.action === 'send') {
      const code = account ? await tx(account.id, (q) => issueCode(q, account.id, 'reset-password', account.email)) : null;
      if (code) {
        try {
          await sendMail(account.email, 'Your Salin password reset code',
            `Your password reset code is ${code}.\n\nIt expires in ${CODE_MINUTES} minutes. Enter it in Salin with your new password.\n\nIf you didn't ask to reset your password, ignore this email: your password stays the same.`);
        } catch (error) {
          // Logged, not shown: an error here would tell a stranger that the account exists.
          console.error(JSON.stringify({ level: 'error', event: 'reset_mail_failed', accountId: account.id, message: (error as Error).message }));
        }
      }
      return ok({ sent: true, message: SENT, expiresInMinutes: CODE_MINUTES });
    }
    if (!account) throw WRONG;
    try {
      await consumeCode(account.id, 'reset-password', b.code);
    } catch (error) {
      if (error instanceof AppError && error.code === 'INVALID_CODE') throw new AppError(401, 'INVALID_CODE', WRONG.message, error.details);
      throw error;
    }
    await tx(account.id, async (q) => {
      await q`select ekapon.set_permanent_password(${account.id}::bigint, ${b.newPassword})`;
      await q`update ekapon.accounts set sessions_valid_after = date_trunc('second', now()) where id = ${account.id}`;
    });
    return ok({ reset: true });
  },
});
