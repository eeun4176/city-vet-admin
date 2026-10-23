import { z } from 'zod';
import { route, ok, parse } from '../../../server/http';
import { sql, tx } from '../../../server/db';
import { requireAuth } from '../../../server/auth';
import { dataset, jsonValue, normalizeRecordInputs, recordBatch } from '../../../server/dashboard';
import { listQuery,likePattern } from '../../../server/listing';
import { conflict, forbidden, unprocessable } from '../../../server/errors';
import { createAccount } from '../../../server/accountSchemas';
import { createPortalAccount } from '../../../server/createPortalAccount';
import { randomUUID } from 'node:crypto';
import { assertFieldRecordWrite, assertUnmanagedInput, assertUnmanagedStored } from '../../../server/managedWorkflow';
import { registryLock,assertRegistryUnmanaged,resolveRegistryOwner,normalizeIdentity,publicRegistryData,registryListProjection,registrySearchText } from '../../../server/registry';

const query = listQuery.pick({ page: true, pageSize: true }).extend({
  summary: z.enum(['true','false']).default('false'),
  archived: z.enum(['true', 'false', 'all']).default('false'),
  q: z.string().trim().max(120).default(''),
  sort: z.enum(['id', 'name', 'barangay', 'date', 'status', 'updatedAt']).default('updatedAt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});
const PARAVET_READ_DATASETS = new Set(['owners', 'pets', 'respondents', 'households', 'animals']);

export default route({
  GET: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin', 'Paravet'] });
    const kind = dataset(c.query.dataset);
    if (session.type === 'Paravet' && !PARAVET_READ_DATASETS.has(kind)) throw forbidden('This dataset is not available to Paravets.');
    const f = parse(query, c.query);
    const registry=kind==='owners'||kind==='pets';
    if(f.summary==='true'&&!registry)throw unprocessable('INVALID_SUMMARY','Compact lists are available for owners and pets only.');
    const all = f.archived === 'all';
    const showArchived = f.archived === 'true';
    const dateValue = `coalesce(nullif(record_data->>'date',''), nullif(record_data->>'censusDate',''), nullif(record_data->>'createdAt',''), nullif(record_data->>'created_at',''))`;
    const dateExpr = `case when ${dateValue} ~ '^\\d{4}-\\d{2}-\\d{2}' then substring(${dateValue} from 1 for 10)::date end`;
    const sortExpression = {
      id: 'record_id',
      name: `coalesce(record_data->>'name', record_data->>'petName', record_data->>'title', record_data->>'owner_name')`,
      barangay: `record_data->>'barangay'`,
      date: dateExpr,
      status: `record_data->>'status'`,
      updatedAt: 'updated_at',
    }[f.sort];
    const direction = f.dir === 'asc' ? 'asc' : 'desc';
    const args: unknown[] = [kind, all, showArchived, f.q, registry?likePattern(f.q):`%${f.q}%`, session.type !== 'Paravet', session.barangay ?? ''];
    const where = [
      'dataset = $1',
      '($2 or archived = $3)',
      `($4 = '' or ${registry?registrySearchText():'record_data::text'} ilike $5)`,
      registry?'($6 or lower(btrim(record_data->>\'barangay\')) = lower(btrim($7)))':'($6 or lower(record_data->>\'barangay\') = lower($7))',
    ];
    if (f.year) { args.push(f.year); where.push(`extract(year from ${dateExpr}) = $${args.length}`); }
    if (f.month) { args.push(f.month); where.push(`extract(month from ${dateExpr}) = $${args.length}`); }
    const base = `from ekapon.dashboard_records outer_record where ${where.join(' and ')}`;
    const [{ total }] = await sql().unsafe(`select count(*)::int as total ${base}`, args as never[]) as unknown as [{ total: number }];
    const compact=registry&&f.summary==='true';
    const ordering=`order by ${sortExpression} ${direction} nulls last, record_id ${direction}`;
    const paging=`limit ${f.pageSize} offset ${(f.page - 1) * f.pageSize}`;
    // Resolve the bounded page before JSON projection and linked-record checks.
    // Otherwise the planner can evaluate those expressions for every sorted row.
    const pageQuery=compact?`with registry_page as materialized (select id,dataset,record_id,record_data,archived,updated_at ${base} ${ordering} ${paging}) `:'';
    const rows = await sql().unsafe(
      `${pageQuery}select ${compact?registryListProjection(kind as 'owners'|'pets'):'record_data'} as record_data, archived,
        case when outer_record.dataset='programs' and exists(select 1 from ekapon.program_interest_campaigns c where c.program_record_id=outer_record.id)
          then (select coalesce(sum(jsonb_array_length(a.pets_snapshot)),0)::int
                  from ekapon.program_interest_campaigns c join ekapon.program_attendance a on a.campaign_id=c.id and a.status='Submitted'
                 where c.program_record_id=outer_record.id) else null end as attendance_slots,
        case when outer_record.dataset='owners' and not exists (select 1 from ekapon.dashboard_records p where p.dataset='pets' and p.archived=false and p.record_data->>'owner_id'=outer_record.record_id) then 'missing-pet'
        when outer_record.dataset='pets' and not exists (select 1 from ekapon.dashboard_records o where o.dataset='owners' and o.archived=false and o.record_id=outer_record.record_data->>'owner_id') then 'missing-owner' else null end as relationship_issue
        ${compact?'from registry_page outer_record':base} ${ordering} ${compact?'':paging}`,
      args as never[],
    ) as unknown as { record_data: Record<string, unknown>; archived: boolean; relationship_issue: string | null; attendance_slots: number | null }[];
    return ok({
      data: rows.map((row) => ({ ...(['owners','pets'].includes(kind)?publicRegistryData(row.record_data):row.record_data), _archived: row.archived, _relationshipIssue: row.relationship_issue, ...(kind === 'programs' ? { _attendanceSlotsUsed: row.attendance_slots } : {}) })),
      page: f.page,
      pageSize: f.pageSize,
      total,
      sort: f.sort,
      dir: f.dir,
    });
  },

  POST: async (c) => {
    const session = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin'] });
    const kind = dataset(c.query.dataset);
    const { records: inputRecords } = parse(recordBatch, c.body);
    assertUnmanagedInput(inputRecords);
    assertFieldRecordWrite(kind);
    const records = inputRecords.map((record) => normalizeRecordInputs(record, kind));
    const existingOwners=kind==='owners'?await sql()`select record_id from ekapon.dashboard_records where dataset='owners' and record_id=any(${records.map(r=>String(r.id))}::text[])`:[];
    if (kind === 'owners' && records.some((row) => !existingOwners.some(o=>o.record_id===String(row.id))&&(!String(row.petName ?? '').trim() || !['Dog', 'Cat'].includes(String(row.species))))) {
      throw unprocessable('OWNER_REQUIRES_PET', 'Add at least one dog or cat when creating an owner.');
    }
    const createParavetAccount = kind === 'paravets' && c.query.createAccount === 'true';
    if (createParavetAccount && records.length !== 1) {
      throw unprocessable('ONE_PARAVET_PER_REQUEST', 'Add Paravet accounts one at a time so the one-time sign-in details can be shown securely.');
    }
    for (const row of records) {
      if (Buffer.byteLength(JSON.stringify(row), 'utf8') > 20_000) {
        throw unprocessable('RECORD_TOO_LARGE', 'Each record must be 20 KB or smaller.');
      }
    }
    if (createParavetAccount) {
      const row = records[0];
      const accountInput = parse(createAccount, {
        accountType: 'Paravet',
        firstName: row.firstName,
        middleName: row.middleName,
        lastName: row.lastName,
        suffix: row.suffix,
        mobile: row.mobile,
        barangay: row.barangay,
      });
      const [barangay] = await sql()`
        select id, name from ekapon.barangays where lower(name) = lower(${accountInput.barangay})
      ` as unknown as [{ id: number; name: string }?];
      if (!barangay) throw unprocessable('UNKNOWN_BARANGAY', 'Choose one of the 62 official barangays.', { field: 'barangay' });

      const profileId = randomUUID();
      try {
        const createdParavet = await tx(session.id, async (q) => {
          const account = await createPortalAccount(q, accountInput, barangay.id);
          const fullName = [accountInput.firstName, accountInput.middleName, accountInput.lastName, accountInput.suffix]
            .filter(Boolean)
            .join(' ');
          const mobileDigits = accountInput.mobile.replace(/\D/g, '');
          const profile = {
            id: profileId,
            name: fullName,
            firstName: accountInput.firstName,
            middleName: accountInput.middleName ?? '',
            lastName: accountInput.lastName,
            suffix: accountInput.suffix ?? '',
            barangay: barangay.name,
            mobile: `${mobileDigits.slice(0, 4)}-${mobileDigits.slice(4, 7)}-${mobileDigits.slice(7)}`,
            accountId: account.id,
          };
          await q`
            insert into ekapon.dashboard_records (dataset, record_id, record_data, archived)
            values ('paravets', ${profileId}, ${q.json(jsonValue(profile))}, false)
          `;
          return { ...account, profile };
        });
        return ok({
          saved: 1,
          record: createdParavet.profile,
          accountKey: createdParavet.accountKey,
          temporaryPassword: createdParavet.temporaryPassword,
          expiresInMinutes: 15,
          notice: 'Shown once. Give these sign-in details to the Paravet now; the temporary password expires in 15 minutes.',
        });
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === '23505') {
          throw conflict('DUPLICATE_ACCOUNT', 'An account for this person already exists in this barangay.');
        }
        throw error;
      }
    }
    let undoToken: string | null = null;
    await tx(session.id, async (q) => {
      if(['owners','pets'].includes(kind)){await registryLock(q);await assertRegistryUnmanaged(q,kind,records.map(r=>String(r.id)));}
      await assertUnmanagedStored(q, kind, records.map((row) => String(row.id)));
      for (const row of records) {
        const id = String(row.id);
        const ownerPet = kind === 'owners' ? await q`select 1 from ekapon.dashboard_records where dataset='owners' and record_id=${id} and archived=false` : [];
        if(kind==='owners'&&!ownerPet.length){
          const [match]=await q`select id from ekapon.dashboard_records where dataset='owners' and not archived and lower(btrim(record_data->>'barangay'))=lower(${String(row.barangay??'').trim()}) and lower(regexp_replace(btrim(coalesce(record_data->>'name','')),'[[:space:]]+',' ','g'))=${normalizeIdentity(row.name)} limit 1`;
          if(match)throw conflict('OWNER_MATCH_REVIEW_REQUIRED','Review the possible owner match in the owner/pet workspace before creating a separate record.');
        }
        if (kind === 'pets') {
          const [existing]=await q`select record_data from ekapon.dashboard_records where dataset='pets' and record_id=${id} for update`;
          await resolveRegistryOwner(q,row,existing?.record_data);
        }
        const [previous] = await q`
          select record_data from ekapon.dashboard_records
           where dataset = ${kind} and record_id = ${id} for update`;
        const recordToSave = kind === 'owners' ? Object.fromEntries(Object.entries(row).filter(([key]) => !['petName', 'species'].includes(key))) : row;
        if(kind==='owners'&&previous&&(normalizeIdentity(previous.record_data.name)!==normalizeIdentity(row.name)||normalizeIdentity(previous.record_data.barangay)!==normalizeIdentity(row.barangay)))throw conflict('REGISTRY_REVIEW_REQUIRED','Review owner identity or residence changes in the owner/pet workspace.');
        const saved = await q`
          insert into ekapon.dashboard_records as current_record (dataset, record_id, record_data, archived)
          values (${kind}, ${id}, ${q.json(jsonValue(recordToSave))}, false)
          on conflict (dataset, record_id) do update
             set record_data = excluded.record_data, archived = false, updated_at = now()
          returning record_id`;
        if (!saved.length) throw forbidden('The record could not be saved.');
        if (kind === 'owners' && !previous && !ownerPet.length) {
          const petId = randomUUID();
          const pet = { id: petId, petName: String(row.petName).trim(), species: String(row.species), owner_id: id, owner: String(row.name).trim(), barangay: String(row.barangay ?? '').trim() };
          await q`insert into ekapon.dashboard_records (dataset, record_id, record_data, archived)
                  values ('pets', ${petId}, ${q.json(jsonValue(pet))}, false)`;
        }
        if (records.length === 1 && !(kind === 'owners' && !previous)) {
          const [undo] = await q`
            insert into ekapon.edit_undo (actor_id, entity_type, entity_key, before_data, after_data)
            values (${session.id}, 'dashboard_record', ${`${kind}:${id}`},
                    ${q.json(jsonValue(previous ? { ...previous.record_data, _exists: true } : { _exists: false }))},
                    ${q.json(jsonValue(row))})
            returning token`;
          undoToken = undo.token as string;
        }
      }
    });
    return ok({ saved: records.length, undoToken });
  },
});
