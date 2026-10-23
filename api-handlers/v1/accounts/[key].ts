import { route, ok, parse } from '../../../server/http';
import { sql, tx } from '../../../server/db';
import { requireAuth } from '../../../server/auth';
import { findAccount, toAccount } from '../../../server/accountsView';
import { accountRef, updateAccount } from '../../../server/accountSchemas';
import { AppError, forbidden, notFound, unprocessable } from '../../../server/errors';

async function load(ref: string) {
  const a = await findAccount(parse(accountRef, ref));
  if (!a) throw notFound('Account not found.');
  return a;
}
const portalOnly = (type: string) => { if (type !== 'Paravet') throw forbidden('This action is not available for staff accounts.'); };

export default route({
  GET: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin'] });
    const account = await load(c.query.key);
    if (session.type === 'Admin') portalOnly(account.account_type);
    const result = toAccount(account);
    return ok({ account: session.type === 'SuperAdmin' ? result : { ...result, accountKey: null } });
  },

  PATCH: async (c) => {
    const s = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin'] });
    const a = await load(c.query.key);
    if (s.type === 'Admin') portalOnly(a.account_type);
    const b = parse(updateAccount, c.body);
    if (b.barangay !== undefined) portalOnly(a.account_type);
    const set: Record<string, unknown> = {};
    if (b.firstName !== undefined) set.first_name = b.firstName;
    if (b.lastName !== undefined) set.last_name = b.lastName;
    if (b.middleName !== undefined) set.middle_name = b.middleName || null;
    if (b.suffix !== undefined) set.suffix = b.suffix || null;
    if (b.mobile !== undefined) set.mobile = b.mobile;
    if (b.barangay !== undefined) {
      const [{ id }] = await sql()`select ekapon.find_barangay(${b.barangay}) as id`;
      if (!id) throw unprocessable('UNKNOWN_BARANGAY', 'Choose one of the 62 official barangays.', { field: 'barangay' });
      set.barangay_id = id;   // the account key never changes, even if the barangay does
    }
    const undoToken = await tx(s.id, async (q) => {
      const [before] = await q`
        select first_name as "firstName", middle_name as "middleName", last_name as "lastName",
               suffix, mobile, barangay_id as "barangayId"
          from ekapon.accounts where id = ${a.id} for update`;
      await q`update ekapon.accounts set ${q(set)} where id = ${a.id}`;
      const [after] = await q`
        select first_name as "firstName", middle_name as "middleName", last_name as "lastName",
               suffix, mobile, barangay_id as "barangayId"
          from ekapon.accounts where id = ${a.id}`;
      const [undo] = await q`
        insert into ekapon.edit_undo (actor_id, entity_type, entity_key, before_data, after_data)
        values (${s.id}, 'account', ${String(a.id)}, ${q.json(before)}, ${q.json(after)})
        returning token`;
      return undo.token as string;
    });
    const saved = toAccount(await load(String(a.id)));
    return ok({ account: s.type === 'SuperAdmin' ? saved : { ...saved, accountKey: null }, undoToken });
  },

  DELETE: async (c) => {
    const s = await requireAuth(c.req, { roles: ['SuperAdmin'] });
    const a = await load(c.query.key);
    portalOnly(a.account_type);
    if (a.id === s.id) throw forbidden('You cannot delete your own account.');
    await tx(s.id, async q=>{
      await q`select ekapon.log_activity('Paravet access removed; history retained', ${a.account_key})`;
      await q`update ekapon.accounts set archived_at=coalesce(archived_at,now()) where id=${a.id}`;
    });
    return ok({archived:true,deleted:false});
  },
});
