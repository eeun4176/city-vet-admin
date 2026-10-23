import { route, ok, parse } from '../../../../server/http';
import { tx } from '../../../../server/db';
import { requireAuth } from '../../../../server/auth';
import { findAccount, toAccount } from '../../../../server/accountsView';
import { accountRef } from '../../../../server/accountSchemas';
import { forbidden, notFound } from '../../../../server/errors';

/** Issues a fresh one-time temporary password for an active Paravet account. */
export default route({
  POST: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin'] });
    const account = await findAccount(parse(accountRef, c.query.key));
    if (!account) throw notFound('Account not found.');
    if (account.account_type !== 'Paravet') {
      throw forbidden('Temporary-password renewal is only available for Paravet accounts.');
    }

    const [result] = await tx(session.id, (q) =>
      q`select ekapon.issue_temp_password(${account.id}::bigint) as password`);
    const renewed = toAccount((await findAccount(String(account.id)))!);
    return ok({
      account: session.type === 'SuperAdmin' ? renewed : { ...renewed, accountKey: null },
      temporaryPassword: result.password,
      expiresInMinutes: 15,
      notice: 'Shown once. It expires in 15 minutes and must be changed at sign-in.',
    });
  },
});
