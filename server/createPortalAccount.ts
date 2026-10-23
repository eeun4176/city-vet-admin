import type { z } from 'zod';
import type { Tx } from './db';
import { conflict } from './errors';
import type { createAccount } from './accountSchemas';

type AccountInput = z.infer<typeof createAccount>;

export async function createPortalAccount(q: Tx, input: AccountInput, barangayId: number) {
  const duplicate = await q`
    select 1
      from ekapon.accounts
     where account_type = ${input.accountType}::ekapon.account_type
       and barangay_id = ${barangayId}
       and lower(btrim(first_name)) = lower(${input.firstName})
       and lower(btrim(last_name)) = lower(${input.lastName})
       and archived_at is null
  `;
  if (duplicate.length) throw conflict('DUPLICATE_ACCOUNT', 'An account for this person already exists in this barangay.');

  const [account] = await q`
    insert into ekapon.accounts
      (account_type, first_name, middle_name, last_name, suffix, mobile, barangay_id, paravet_id, owner_id)
    values
      (${input.accountType}::ekapon.account_type, ${input.firstName}, ${input.middleName ?? null},
       ${input.lastName}, ${input.suffix ?? null}, ${input.mobile}, ${barangayId},
       ${input.paravetId ?? null}, ${input.ownerId ?? null})
    returning id, account_key as "accountKey"
  `;
  const [{ pw }] = await q`select ekapon.issue_temp_password(${account.id}::bigint) as pw`;
  return {
    id: Number(account.id),
    accountKey: String(account.accountKey),
    temporaryPassword: String(pw),
  };
}
