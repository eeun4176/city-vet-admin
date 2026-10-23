import { z } from 'zod';
import { route, ok, parse } from '../../../../server/http';
import { tx } from '../../../../server/db';
import { requireAuth } from '../../../../server/auth';
import { dataset, jsonValue } from '../../../../server/dashboard';
import { conflict, forbidden, notFound } from '../../../../server/errors';
import { assertUnmanagedInput, assertUnmanagedStored } from '../../../../server/managedWorkflow';
import { registryLock,assertRegistryUnmanaged } from '../../../../server/registry';

const bodySchema = z.object({ batchId: z.string().uuid() });

export default route({
  POST: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin'] });
    const kind = dataset(c.query.dataset);
    const { batchId } = parse(bodySchema, c.body);
    await tx(session.id, async (q) => {
      if(['owners','pets'].includes(kind))await registryLock(q);
      const [batch] = await q`
        select dataset, actor_id, undone_at, linked_batch_id
          from ekapon.dashboard_import_batches
         where batch_id = ${batchId}::uuid
         for update`;
      if (!batch) throw notFound('Import batch not found.');
      if (Number(batch.actor_id) !== session.id) throw forbidden('You can only undo your own import.');
      if (batch.dataset !== kind) throw conflict('IMPORT_DATASET_MISMATCH', 'This import belongs to another dataset.');
      if (batch.undone_at) throw conflict('IMPORT_ALREADY_UNDONE', 'This import has already been undone.');
      if(kind==='owners'&&batch.linked_batch_id){
        const child=batch.linked_batch_id;
        const pets=await q`select * from ekapon.dashboard_import_items where batch_id=${child}::uuid for update`;
        await assertRegistryUnmanaged(q,'pets',pets.map(p=>p.record_id));
        for(const pet of pets){const [current]=await q`select record_data=${q.json(jsonValue(pet.after_data))} as matches,archived from ekapon.dashboard_records where dataset='pets' and record_id=${pet.record_id} for update`;if(!current||current.archived||!current.matches)throw conflict('IMPORT_RECORD_CHANGED','An imported pet changed. Resolve it before undoing the paired import.');}
        const ownerIds=await q`select record_id from ekapon.dashboard_import_items where batch_id=${batchId}::uuid and not existed_before`;
        const [extra]=await q`select id from ekapon.dashboard_records where dataset='pets' and record_data->>'owner_id'=any(${ownerIds.map(r=>r.record_id)}::text[]) and record_id<>all(${pets.map(p=>p.record_id)}::text[]) limit 1`;
        if(extra)throw conflict('IMPORT_RECORD_CHANGED','Another pet has been added to an imported owner. Undo is blocked to preserve its owner link.');
        for(const pet of pets){if(pet.existed_before)await q`update ekapon.dashboard_records set record_data=${q.json(pet.before_data)},archived=${pet.before_archived},updated_at=now() where dataset='pets' and record_id=${pet.record_id}`;else await q`delete from ekapon.dashboard_records where dataset='pets' and record_id=${pet.record_id}`;}
        await q`update ekapon.dashboard_import_batches set undone_at=now() where batch_id=${child}::uuid`;
      }
      const items = await q`
        select record_id, existed_before, before_data, before_archived, after_data
          from ekapon.dashboard_import_items
         where batch_id = ${batchId}::uuid
         order by record_id
         for update`;
      assertUnmanagedInput(items.map((item) => item.after_data as Record<string, unknown>));
      await assertUnmanagedStored(q, kind, items.map((item) => String(item.record_id)));
      await assertRegistryUnmanaged(q,kind,items.map(item=>String(item.record_id)));
      for (const item of items) {
        const [current] = await q`
          select record_data = ${q.json(jsonValue(item.after_data))} as matches, archived from ekapon.dashboard_records
           where dataset = ${kind} and record_id = ${item.record_id}
           for update`;
        if (!current || current.archived || !current.matches) {
          throw conflict('IMPORT_RECORD_CHANGED', 'An imported record changed after this import. Refresh the data and resolve the changes before undoing it.');
        }
      }
      for (const item of items) {
        if (item.existed_before) {
          await q`
            update ekapon.dashboard_records
               set record_data = ${q.json(jsonValue(item.before_data))},
                   archived = ${item.before_archived}, updated_at = now()
             where dataset = ${kind} and record_id = ${item.record_id}`;
        } else {
          await q`delete from ekapon.dashboard_records where dataset = ${kind} and record_id = ${item.record_id}`;
        }
      }
      await q`update ekapon.dashboard_import_batches set undone_at = now() where batch_id = ${batchId}::uuid`;
      await q`delete from ekapon.spay_neuter_report_imports where batch_id = ${batchId}::uuid`;
    });
    return ok({ undone: true, batchId });
  },
});
