import type { Tx } from './db';
import { jsonValue } from './dashboard';
import { conflict,notFound } from './errors';
import { registryLock } from './registry';
import { censusWorkspaceSnapshot } from './censusRegistryBridge';
import { verifyApproval } from './censusReviewPlan';

export interface CensusReviewer {
  id: number;
  name: string;
}

export async function recordCensusDecision(
  q: Tx,
  reviewer: CensusReviewer,
  submissionId: string,
  decision: 'approve' | 'reject',
  note: string,
  reviewToken?: string,
): Promise<Record<string, unknown>> {
  await registryLock(q);
  const [submission] = await q`
    select status from ekapon.census_submissions where id = ${submissionId}::uuid for update
  ` as unknown as [{ status: string }?];
  if (!submission) throw notFound('Census submission not found.');
  if(decision==='approve'){
    await verifyApproval(q, reviewer.id, submissionId, reviewToken);
    const ambiguous=await q`select p.id from ekapon.census_owners o join ekapon.census_pets p on p.owner_id=o.id join ekapon.registry_pets r on r.owner_id=o.matched_owner_id and not (r.archived_at is not null) and r.species=p.species and lower(btrim(r.pet_name))=lower(btrim(p.pet_name)) where o.submission_id=${submissionId}::uuid and o.decision in ('merge','replace') group by p.id having count(*)>1 limit 1`;
    const repeated=await q`select o.id from ekapon.census_owners o join ekapon.census_pets p on p.owner_id=o.id where o.submission_id=${submissionId}::uuid and o.decision in ('merge','replace') group by o.id,lower(btrim(p.pet_name)),p.species having count(*)>1 limit 1`;
    if(ambiguous.length||repeated.length)throw conflict('CENSUS_PET_MATCH_AMBIGUOUS','Several pet entries share a name and species. Resolve their identities before merging or replacing an owner; no pet was chosen automatically.');
  }

  const matched = decision === 'approve' ? await q`
    select distinct matched_owner_id as id
      from ekapon.census_owners
     where submission_id = ${submissionId}::uuid
       and decision in ('merge', 'replace')
       and matched_owner_id is not null
     order by matched_owner_id
  ` as unknown as Array<{ id: string }> : [];
  const matchedIds = matched.map((row) => row.id);
  const beforeWorkspace=await censusWorkspaceSnapshot(q,matchedIds);
  const beforeOwners = matchedIds.length ? await q`
    select to_jsonb(owner_row) as data
      from ekapon.registry_owners owner_row
     where id = any(${q.array(matchedIds, 2950)})
     order by id
  ` as unknown as Array<{ data: Record<string, unknown> }> : [];
  const beforePets = matchedIds.length ? await q`
    select to_jsonb(pet_row) as data
      from ekapon.registry_pets pet_row
     where owner_id = any(${q.array(matchedIds, 2950)})
     order by id
  ` as unknown as Array<{ data: Record<string, unknown> }> : [];

  const [{ result }] = await q`
    select ekapon.decide_census_submission(${submissionId}::uuid, ${decision}, ${note || null}) as result
  ` as unknown as [{ result: Record<string, unknown> }];

  if (decision === 'approve') {
    const afterOwnerRows = await q`
      select to_jsonb(owner_row) as data
        from ekapon.registry_owners owner_row
       where id = any(${q.array(matchedIds, 2950)})
          or source_submission_id = ${submissionId}::uuid
       order by id
    ` as unknown as Array<{ data: Record<string, unknown> }>;
    const afterOwners = afterOwnerRows.map((row) => row.data);
    const ownerScope = afterOwners.map((row) => String(row.id));
    const afterWorkspace=await censusWorkspaceSnapshot(q,ownerScope);
    const afterPetRows = ownerScope.length ? await q`
      select to_jsonb(pet_row) as data
        from ekapon.registry_pets pet_row
       where owner_id = any(${q.array(ownerScope, 2950)})
       order by id
    ` as unknown as Array<{ data: Record<string, unknown> }> : [];
    await q`
      insert into ekapon.census_review_snapshots
        (submission_id, actor_id, owner_scope, before_owners, before_pets, after_owners, after_pets, before_workspace,after_workspace, review_note, undone_at)
      values (${submissionId}::uuid, ${reviewer.id}, ${q.array(ownerScope, 2950)},
              ${q.json(jsonValue(beforeOwners.map((row) => row.data)))},
              ${q.json(jsonValue(beforePets.map((row) => row.data)))},
              ${q.json(jsonValue(afterOwners))},
              ${q.json(jsonValue(afterPetRows.map((row) => row.data)))},
              ${q.json(jsonValue(beforeWorkspace))},${q.json(jsonValue(afterWorkspace))},
              ${note || null}, null)
      on conflict (submission_id) do update set
        actor_id = excluded.actor_id,
        owner_scope = excluded.owner_scope,
        before_owners = excluded.before_owners,
        before_pets = excluded.before_pets,
        after_owners = excluded.after_owners,
        after_pets = excluded.after_pets,
        before_workspace=excluded.before_workspace,after_workspace=excluded.after_workspace,
        review_note = excluded.review_note,
        captured_at = now(),
        undone_at = null
    `;
  }
  await q`
    insert into ekapon.census_submission_status_history
      (submission_id, actor_id, actor_name, from_status, to_status, action, note)
    values (${submissionId}::uuid, ${reviewer.id}, ${reviewer.name}, ${submission.status},
            ${decision === 'approve' ? 'approved' : 'rejected'}, 'review', ${note || null})
  `;
  return result;
}
