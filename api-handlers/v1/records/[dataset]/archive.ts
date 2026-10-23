import { route, ok, parse } from '../../../../server/http';
import { sql, tx } from '../../../../server/db';
import { requireAuth } from '../../../../server/auth';
import { archiveBatch, dataset } from '../../../../server/dashboard';
import { unprocessable } from '../../../../server/errors';
import { assertUnmanagedStored } from '../../../../server/managedWorkflow';
import { registryLock } from '../../../../server/registry';
import { syncCensusArchive } from '../../../../server/censusRegistryBridge';

export default route({
  POST: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin'] });
    const kind = dataset(c.query.dataset);
    const body = parse(archiveBatch, c.body);
    const changed = await tx(session.id, async (q) => {
      if(['owners','pets'].includes(kind))await registryLock(q);
      if(!body.archived&&['owners','pets'].includes(kind)){
        const [withdrawn]=await q`select id from ekapon.dashboard_records where dataset=${kind} and record_id=any(${body.ids.map(String)}::text[]) and record_data->>'_censusWithdrawn'='true' limit 1`;
        if(withdrawn)throw unprocessable('CENSUS_APPROVAL_REQUIRED','This record was withdrawn with a census approval. Review the census approval before restoring it.');
      }
      if(!body.archived&&kind==='pets'){
        const [invalid]=await q`select p.id from ekapon.dashboard_records p where p.dataset='pets' and p.record_id=any(${body.ids.map(String)}::text[]) and not exists(select 1 from ekapon.dashboard_records o where o.dataset='owners' and not o.archived and o.record_id=p.record_data->>'owner_id') limit 1`;
        if(invalid)throw unprocessable('ACTIVE_OWNER_REQUIRED','Restore or confirm the owner before restoring this pet.');
      }
      await assertUnmanagedStored(q, kind, body.ids.map(String));
      if (body.archived && kind === 'pets') {
        const [orphan] = await q`
          select p.record_data->>'owner_id' as owner_id
            from ekapon.dashboard_records p
           where p.dataset='pets' and p.archived=false and p.record_id=any(${body.ids.map(String)}::text[])
             and p.record_data->>'owner_id' is not null
             and (select count(*) from ekapon.dashboard_records other
                   where other.dataset='pets' and other.archived=false
                     and other.record_data->>'owner_id'=p.record_data->>'owner_id'
                     and not (other.record_id=any(${body.ids.map(String)}::text[])))=0
           limit 1
        `;
        if (orphan) throw unprocessable('OWNER_REQUIRES_PET', 'This is the owner’s last active pet. Add another pet or archive the owner and pet records together first.');
      }
      const rows = await q`
        update ekapon.dashboard_records
           set archived = ${body.archived}, updated_at = now()
         where dataset = ${kind} and record_id = any(${body.ids.map(String)}::text[])
        returning record_id`;
      if (kind === 'owners') {
        await q`
          update ekapon.dashboard_records p set archived=${body.archived}, updated_at=now(),
            record_data=case when ${body.archived} then p.record_data||jsonb_build_object('_ownerArchiveCascade',p.record_data->>'owner_id') else p.record_data-'_ownerArchiveCascade' end
           where p.dataset='pets' and p.record_data->>'owner_id'=any(${body.ids.map(String)}::text[])
             and p.archived is distinct from ${body.archived}
             and (${body.archived} or p.record_data->>'_ownerArchiveCascade'=p.record_data->>'owner_id')
        `;
      }
      if(['owners','pets'].includes(kind))await syncCensusArchive(q);
      return rows.length;
    });
    return ok({ changed, archived: body.archived });
  },
});
