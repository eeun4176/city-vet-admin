import { importOwnerPets } from '../../../../server/registryImport';
import { z } from 'zod';
import { route, ok, parse } from '../../../../server/http';
import { tx } from '../../../../server/db';
import { requireAuth } from '../../../../server/auth';
import { dataset, jsonValue, normalizeRecordInputs, recordBatch } from '../../../../server/dashboard';
import { conflict, forbidden, unprocessable } from '../../../../server/errors';
import { assertFieldRecordWrite, assertUnmanagedInput, assertUnmanagedStored } from '../../../../server/managedWorkflow';
import { registryLock,assertRegistryUnmanaged,resolveRegistryOwner } from '../../../../server/registry';

const bodySchema = recordBatch.extend({
  batchId: z.string().uuid(),
  confirmDistinctOwners:z.boolean().optional(),matchReason:z.string().trim().max(1000).optional(),
  label: z.string().trim().min(1).max(160),
});

export default route({
  POST: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin'] });
    const kind = dataset(c.query.dataset);
    const parsed = parse(bodySchema, c.body);
    assertUnmanagedInput(parsed.records);
    if(['respondents','participants'].includes(kind))assertFieldRecordWrite(kind);
    const body = { ...parsed, records: parsed.records.map((record) => normalizeRecordInputs(record, kind)) };
    if(kind==='owners')return ok(await tx(session.id,q=>importOwnerPets(q,session,body)));
    await tx(session.id, async (q) => {
      if(kind==='pets'){await registryLock(q);await assertRegistryUnmanaged(q,kind,body.records.map(r=>String(r.id)));}
      await assertUnmanagedStored(q, kind, body.records.map((row) => String(row.id)));
      await q`
        insert into ekapon.dashboard_import_batches (batch_id, dataset, actor_id, label)
        values (${body.batchId}::uuid, ${kind}, ${session.id}, ${body.label})
        on conflict (batch_id) do nothing`;
      const [batch] = await q`
        select dataset, actor_id, undone_at
          from ekapon.dashboard_import_batches
         where batch_id = ${body.batchId}::uuid
         for update`;
      if (!batch || Number(batch.actor_id) !== session.id) throw forbidden('This import batch belongs to another account.');
      if (batch.dataset !== kind || batch.undone_at) throw conflict('IMPORT_BATCH_CLOSED', 'This import batch cannot accept more records.');

      for (const inputRecord of body.records) {
        const record:Record<string,unknown> = { ...inputRecord, ...(kind==='services'?{recordOrigin:'Historical CSV import'}:{}) };
        if (kind === 'pets') {
          const [existing]=await q`select record_data from ekapon.dashboard_records where dataset='pets' and record_id=${String(record.id)} for update`;
          await resolveRegistryOwner(q,record,existing?.record_data);
        }
        if (Buffer.byteLength(JSON.stringify(record), 'utf8') > 20_000) throw unprocessable('RECORD_TOO_LARGE', 'Each record must be 20 KB or smaller.');
        const id = String(record.id);
        const [before] = await q`
          select record_data, archived from ekapon.dashboard_records
           where dataset = ${kind} and record_id = ${id}
           for update`;
        await q`
          insert into ekapon.dashboard_import_items
            (batch_id, record_id, existed_before, before_data, before_archived, after_data)
          values (${body.batchId}::uuid, ${id}, ${Boolean(before)}, ${before ? q.json(jsonValue(before.record_data)) : null},
                  ${before?.archived ?? null}, ${q.json(jsonValue(record))})
          on conflict (batch_id, record_id) do update set after_data = excluded.after_data`;
        const saved = await q`
          insert into ekapon.dashboard_records as current_record (dataset, record_id, record_data, archived)
          values (${kind}, ${id}, ${q.json(jsonValue(record))}, false)
          on conflict (dataset, record_id) do update
             set record_data = excluded.record_data, archived = false, updated_at = now()
          returning record_id`;
        if (!saved.length) throw forbidden('The record could not be saved.');
      }
    });
    return ok({ saved: body.records.length, batchId: body.batchId });
  },
}, {maxBody:2200000});
