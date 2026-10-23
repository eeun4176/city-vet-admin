import { z } from 'zod';
import { route, ok } from '../../server/http';
import { requireAuth } from '../../server/auth';
import { sql, tx } from '../../server/db';
import { conflict, notFound } from '../../server/errors';
import { jsonValue } from '../../server/dashboard';
import { assertUnmanagedInput, assertUnmanagedStored } from '../../server/managedWorkflow';

export default route({
  POST: async (c) => {
    const session = await requireAuth(c.req, { allowMaintenance: true });
    const token = z.string().uuid().parse(c.query.token);
    const direction=z.object({direction:z.enum(['undo','redo']).default('undo')}).parse(c.body??{}).direction;
    const redoToken=await tx(session.id, async (q) => {
      const [entry] = await q`
        select entity_type, entity_key, before_data, after_data, expires_at, undone_at
          from ekapon.edit_undo where token = ${token} and actor_id = ${session.id} for update`;
      if (!entry) throw notFound('This undo action is no longer available.');
      if (entry.undone_at || new Date(String(entry.expires_at)).getTime() <= Date.now()) {
        throw conflict('UNDO_EXPIRED', 'This undo action has expired or has already been used.');
      }
      if (entry.entity_type === 'dashboard_record') {
        const separator = String(entry.entity_key).indexOf(':');
        const dataset = String(entry.entity_key).slice(0, separator);
        const recordId = String(entry.entity_key).slice(separator + 1);
        if(['owners','pets'].includes(dataset))throw conflict('REGISTRY_REVIEW_REQUIRED','Review a new correction in the owner/pet workspace to preserve linked records and history.');
        assertUnmanagedInput([entry.after_data as Record<string, unknown>]);
        await assertUnmanagedStored(q, dataset, [recordId]);
        const before = entry.before_data as Record<string, unknown>;
        if(entry.after_data._exists===false){
          const [exists]=await q`select id from ekapon.dashboard_records where dataset=${dataset} and record_id=${recordId} for update`;
          if(exists)throw conflict('UNDO_CONFLICT','A record with this ID was created after undo. Review it before restoring.');
          const restored={...before};delete restored._exists;assertUnmanagedInput([restored]);
          await q`insert into ekapon.dashboard_records(dataset,record_id,record_data) values(${dataset},${recordId},${q.json(jsonValue(restored))})`;
        }else if (before._exists === false) {
          const deleted = await q`
            delete from ekapon.dashboard_records
             where dataset = ${dataset} and record_id = ${recordId} and record_data = ${q.json(jsonValue(entry.after_data))}
             returning record_id`;
          if (!deleted.length) throw conflict('UNDO_CONFLICT', 'This record changed after the edit, so the previous values could not be restored.');
        } else {
          const original = { ...before };
          delete original._exists;
          const restored = await q`
            update ekapon.dashboard_records set record_data = ${q.json(jsonValue(original))}, updated_at = now()
             where dataset = ${dataset} and record_id = ${recordId} and record_data = ${q.json(jsonValue(entry.after_data))}
             returning record_id`;
          if (!restored.length) throw conflict('UNDO_CONFLICT', 'This record changed after the edit, so the previous values could not be restored.');
        }
      } else if (entry.entity_type === 'account_profile') {
        const before = entry.before_data as Record<string, string | null>;
        const after = entry.after_data as Record<string, string | null>;
        const updated = await q`
          update ekapon.accounts
             set first_name = ${before.firstName}, middle_name = ${before.middleName},
                 last_name = ${before.lastName}, suffix = ${before.suffix}, updated_at = now()
           where id = ${session.id}
             and first_name = ${after.firstName}
             and middle_name is not distinct from ${after.middleName}
             and last_name = ${after.lastName}
             and suffix is not distinct from ${after.suffix}
           returning id`;
        if (!updated.length) throw conflict('UNDO_CONFLICT', 'Your profile changed after the edit, so the previous values could not be restored.');
      } else if (entry.entity_type === 'account') {
        if (session.type !== 'Admin' && session.type !== 'SuperAdmin') throw notFound('This undo action is no longer available.');
        const accountId = Number(entry.entity_key);
        const [target] = await q`select account_type::text as type from ekapon.accounts where id = ${accountId} and archived_at is null for update`;
        if (!target || (session.type === 'Admin' && target.type !== 'Paravet' && target.type !== 'User')) {
          throw notFound('This undo action is no longer available.');
        }
        const before = entry.before_data as { firstName: string; middleName: string | null; lastName: string; suffix: string | null; mobile: string | null; barangayId: number | null };
        const after = entry.after_data as typeof before;
        const updated = await q`
          update ekapon.accounts
             set first_name = ${before.firstName}, middle_name = ${before.middleName},
                 last_name = ${before.lastName}, suffix = ${before.suffix}, mobile = ${before.mobile},
                 barangay_id = ${before.barangayId}, updated_at = now()
           where id = ${accountId}
             and first_name = ${after.firstName}
             and middle_name is not distinct from ${after.middleName}
             and last_name = ${after.lastName}
             and suffix is not distinct from ${after.suffix}
             and mobile is not distinct from ${after.mobile}
             and barangay_id is not distinct from ${after.barangayId}
           returning id`;
        if (!updated.length) throw conflict('UNDO_CONFLICT', 'This account changed after the edit, so the previous values could not be restored.');
      } else {
        throw notFound('This undo action is no longer available.');
      }
      await q`update ekapon.edit_undo set undone_at = now() where token = ${token}`;
      const expected={...entry.before_data};if(expected._exists===true)delete expected._exists;
      const [reverse]=await q`insert into ekapon.edit_undo(actor_id,entity_type,entity_key,before_data,after_data) values(${session.id},${entry.entity_type},${entry.entity_key},${q.json(entry.after_data)},${q.json(expected)}) returning token`;
      return reverse.token as string;
    });
    return ok({undone:direction==='undo',redone:direction==='redo',undoToken:redoToken,undoLabel:direction==='undo'?'Redo':'Undo'});
  },
});
