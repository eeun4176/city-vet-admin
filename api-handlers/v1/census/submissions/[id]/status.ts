import { z } from 'zod';
import { route, ok, parse } from '../../../../../server/http';
import { tx, type Tx } from '../../../../../server/db';
import { requireAuth } from '../../../../../server/auth';
import { idParam } from '../../../../../server/census';
import { jsonValue } from '../../../../../server/dashboard';
import { conflict, notFound, unprocessable } from '../../../../../server/errors';
import { recordCensusDecision } from '../../../../../server/censusReview';
import { registryLock } from '../../../../../server/registry';
import { censusWorkspaceSnapshot,censusWorkspaceEdited } from '../../../../../server/censusRegistryBridge';

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('undo') }),
  z.object({ action: z.literal('redo') }),
  z.object({ action: z.literal('set-status'), status: z.enum(['pending', 'approved', 'rejected']), note: z.string().trim().max(500).default(''), reviewToken: z.string().max(3000).optional() }),
]);

type RegistryRow = Record<string, unknown>;
type Snapshot = {
  owner_scope: string[];
  before_owners: RegistryRow[];
  before_pets: RegistryRow[];
  after_owners: RegistryRow[];
  after_pets: RegistryRow[];
  before_workspace:RegistryRow[]|null;
  after_workspace:RegistryRow[]|null;
  review_note: string | null;
  undone_at: string | null;
};

function normalizedRows(rows: RegistryRow[]): RegistryRow[] {
  const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,canonical(v)])):value;
  return rows
    .map(({ updated_at: _updatedAt, ...row }) => canonical(row) as RegistryRow)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

function sameRows(left: RegistryRow[], right: RegistryRow[]): boolean {
  return JSON.stringify(normalizedRows(left)) === JSON.stringify(normalizedRows(right));
}

async function currentRows(q: Tx, ownerScope: string[]) {
  const owners = await q`
    select to_jsonb(owner_row) as data
      from ekapon.registry_owners owner_row
     where id = any(${q.array(ownerScope, 2950)})
     order by id
  ` as unknown as Array<{ data: RegistryRow }>;
  let pets: Array<{ data: RegistryRow }> = [];
  if (ownerScope.length) {
    pets = await q`
      select to_jsonb(pet_row) as data
        from ekapon.registry_pets pet_row
       where owner_id = any(${q.array(ownerScope, 2950)})
       order by id
    ` as unknown as Array<{ data: RegistryRow }>;
  }
  return { owners: owners.map((row) => row.data), pets: pets.map((row) => row.data),workspace:await censusWorkspaceSnapshot(q,ownerScope) };
}

async function restoreRows(
  q: Tx,
  ownerScope: string[],
  owners: RegistryRow[],
  pets: RegistryRow[],
) {
  const ownerIds = owners.map((row) => String(row.id));
  if (ownerScope.length) {
    await q`delete from ekapon.registry_pets where owner_id = any(${q.array(ownerScope, 2950)})`;
    await q`
      delete from ekapon.registry_owners
       where id = any(${q.array(ownerScope, 2950)})
         and not (id = any(${q.array(ownerIds, 2950)}))
    `;
  }
  for (const owner of owners) {
    await q`
      insert into ekapon.registry_owners
      select (jsonb_populate_record(null::ekapon.registry_owners, ${q.json(jsonValue(owner))})).*
      on conflict (id) do update set
        barangay_id = excluded.barangay_id,
        owner_name = excluded.owner_name,
        address = excluded.address,
        contact = excluded.contact,
        source_submission_id = excluded.source_submission_id,
        created_at = excluded.created_at,
        archived_at = excluded.archived_at
    `;
  }
  for (const pet of pets) {
    await q`
      insert into ekapon.registry_pets
      select (jsonb_populate_record(null::ekapon.registry_pets, ${q.json(jsonValue(pet))})).*
      on conflict (id) do update set
        owner_id = excluded.owner_id,
        pet_name = excluded.pet_name,
        species = excluded.species,
        sex = excluded.sex,
        age_months = excluded.age_months,
        breed_type = excluded.breed_type,
        color = excluded.color,
        sterilized = excluded.sterilized,
        confinement = excluded.confinement,
        vaccine_1st = excluded.vaccine_1st,
        vaccine_2nd = excluded.vaccine_2nd,
        vaccine_3rd = excluded.vaccine_3rd,
        vaccine_other = excluded.vaccine_other,
        booster = excluded.booster,
        laps = excluded.laps,
        registered_year = excluded.registered_year,
        remarks = excluded.remarks,
        created_at = excluded.created_at,
        archived_at = excluded.archived_at
    `;
  }
}

async function snapshot(q: Tx, id: string) {
  const [row] = await q`
    select owner_scope, before_owners, before_pets, after_owners, after_pets, before_workspace,after_workspace,review_note, undone_at
      from ekapon.census_review_snapshots
     where submission_id = ${id}::uuid
     for update
  ` as unknown as [Snapshot?];
  return row;
}

async function reverseApproval(
  q: Tx,
  reviewer: { id: number; name: string },
  id: string,
  state: 'undo' | 'redo',
): Promise<void> {
  await registryLock(q);
  const [submission] = await q`
    select status from ekapon.census_submissions where id = ${id}::uuid for update
  ` as unknown as [{ status: string }?];
  if (!submission) throw notFound('Census submission not found.');
  const saved = await snapshot(q, id);
  if (!saved) {
    throw conflict('CENSUS_REVIEW_NOT_REVERSIBLE', 'This approval predates safe change snapshots and cannot be reversed automatically.');
  }
  if (state === 'undo' && (submission.status !== 'approved' || saved.undone_at)) {
    throw conflict('CENSUS_REVIEW_NOT_UNDOABLE', 'This census approval is not currently available to undo.');
  }
  if (state === 'redo' && (submission.status !== 'pending' || !saved.undone_at)) {
    throw conflict('CENSUS_REVIEW_NOT_REDOABLE', 'This census approval is not currently available to redo.');
  }
  const expectedOwners = state === 'undo' ? saved.after_owners : saved.before_owners;
  const expectedPets = state === 'undo' ? saved.after_pets : saved.before_pets;
  const current = await currentRows(q, saved.owner_scope);
  const expectedWorkspace=state==='undo'?saved.after_workspace:saved.before_workspace;
  const workspaceMatches=expectedWorkspace?sameRows(current.workspace,expectedWorkspace):!await censusWorkspaceEdited(q,saved.owner_scope);
  if (!sameRows(current.owners, expectedOwners) || !sameRows(current.pets, expectedPets)||!workspaceMatches) {
    throw conflict('CENSUS_REVIEW_CONFLICT', 'Registry records changed after this review. Resolve those changes before undoing or redoing the approval.');
  }
  await restoreRows(
    q,
    saved.owner_scope,
    state === 'undo' ? saved.before_owners : saved.after_owners,
    state === 'undo' ? saved.before_pets : saved.after_pets,
  );
  if (state === 'undo') {
    await q`
      update ekapon.census_review_snapshots set undone_at = now() where submission_id = ${id}::uuid
    `;
    await q`
      update ekapon.census_submissions
         set status = 'pending', reviewed_by = null, reviewer_name = null, reviewed_at = null, review_note = null
       where id = ${id}::uuid
    `;
    await q`
      insert into ekapon.census_submission_status_history
        (submission_id, actor_id, actor_name, from_status, to_status, action, note)
      values (${id}::uuid, ${reviewer.id}, ${reviewer.name}, 'approved', 'pending', 'undo',
              'Registry changes from the approval were safely reversed.')
    `;
    return;
  }
  await q`
    update ekapon.census_review_snapshots set undone_at = null where submission_id = ${id}::uuid
  `;
  await q`
    update ekapon.census_submissions
       set status = 'approved', reviewed_by = ${reviewer.id}, reviewer_name = ${reviewer.name},
           reviewed_at = now(), review_note = ${saved.review_note}
     where id = ${id}::uuid
  `;
  await q`
    insert into ekapon.census_submission_status_history
      (submission_id, actor_id, actor_name, from_status, to_status, action, note)
    values (${id}::uuid, ${reviewer.id}, ${reviewer.name}, 'pending', 'approved', 'redo',
            'The safely reversed approval was reapplied.')
  `;
}

export default route({
  GET: async (c) => {
    const reviewer = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin'] });
    const id = parse(idParam, c.query.id);
    const result = await tx(reviewer.id, async (q) => {
      const [submission] = await q`
        select status from ekapon.census_submissions where id = ${id}::uuid
      ` as unknown as [{ status: string }?];
      if (!submission) throw notFound('Census submission not found.');
      const saved = await snapshot(q, id);
      const history = await q`
        select actor_name as "actorName", from_status as "fromStatus", to_status as "toStatus",
               action, note, created_at as "createdAt"
          from ekapon.census_submission_status_history
         where submission_id = ${id}::uuid
         order by created_at desc, id desc
         limit 20
      ` as unknown as Array<Record<string, unknown>>;
      let canUndo = false;
      let canRedo = false;
      let undoReason: string | null = null;
      let redoReason: string | null = null;
      if (submission.status === 'approved') {
        if (!saved) undoReason = 'This older approval has no saved registry snapshot and cannot be safely undone.';
        else if (saved.undone_at) undoReason = 'This approval has already been undone.';
        else {
          const current = await currentRows(q, saved.owner_scope);
          canUndo = sameRows(current.owners, saved.after_owners) && sameRows(current.pets, saved.after_pets)&&(saved.after_workspace?sameRows(current.workspace,saved.after_workspace):!await censusWorkspaceEdited(q,saved.owner_scope));
          if (!canUndo) undoReason = 'Registry records changed after approval, so the change cannot be safely undone.';
        }
      }
      if (submission.status === 'pending' && saved?.undone_at) {
        const current = await currentRows(q, saved.owner_scope);
        canRedo = sameRows(current.owners, saved.before_owners) && sameRows(current.pets, saved.before_pets)&&(saved.before_workspace?sameRows(current.workspace,saved.before_workspace):!await censusWorkspaceEdited(q,saved.owner_scope));
        if (!canRedo) redoReason = 'Registry records changed after undo, so the approval cannot be safely redone.';
      }
      return {
        status: submission.status, canUndo, canRedo, undoReason, redoReason, history,
        hasSnapshot: Boolean(saved),
      };
    });
    return ok(result);
  },
  POST: async (c) => {
    const reviewer = await requireAuth(c.req, { roles: ['SuperAdmin', 'Admin'] });
    const id = parse(idParam, c.query.id);
    const input = parse(body, c.body);
    const result = await tx(reviewer.id, async (q) => {
      await registryLock(q);
      const [submission] = await q`
        select status from ekapon.census_submissions where id = ${id}::uuid for update
      ` as unknown as [{ status: string }?];
      if (!submission) throw notFound('Census submission not found.');
      if (input.action === 'undo' || input.action === 'redo') {
        await reverseApproval(q, reviewer, id, input.action);
        return { status: input.action === 'undo' ? 'pending' : 'approved', changed: true };
      }

      const target = input.status;
      if (target === submission.status) return { status: submission.status, changed: false };
      if (target === 'approved' && submission.status !== 'pending') throw conflict('CENSUS_REOPEN_REQUIRED', 'Reopen this census as pending, then review its current decisions and approval summary.');
      if (target === 'pending') {
        if (submission.status === 'approved') {
          await reverseApproval(q, reviewer, id, 'undo');
        } else {
          await q`
            update ekapon.census_submissions
               set status = 'pending', reviewed_by = null, reviewer_name = null, reviewed_at = null, review_note = null
             where id = ${id}::uuid
          `;
          await q`
            insert into ekapon.census_submission_status_history
              (submission_id, actor_id, actor_name, from_status, to_status, action, note)
            values (${id}::uuid, ${reviewer.id}, ${reviewer.name}, ${submission.status}, 'pending', 'status-edit', 'Status changed by an authorized reviewer.')
          `;
        }
        return { status: 'pending', changed: true };
      }

      if (target === 'rejected' && input.note.trim().length < 3) {
        throw unprocessable('CENSUS_REJECTION_NOTE_REQUIRED', 'Enter a rejection reason of at least 3 characters.');
      }
      if (submission.status === 'approved') await reverseApproval(q, reviewer, id, 'undo');
      else if (submission.status !== 'pending') {
        await q`
          update ekapon.census_submissions
             set status = 'pending', reviewed_by = null, reviewer_name = null, reviewed_at = null, review_note = null
           where id = ${id}::uuid
        `;
        await q`
          insert into ekapon.census_submission_status_history
            (submission_id, actor_id, actor_name, from_status, to_status, action, note)
          values (${id}::uuid, ${reviewer.id}, ${reviewer.name}, ${submission.status}, 'pending', 'status-edit', 'Reopened for a new review.')
        `;
      }
      const decision = target === 'approved' ? 'approve' : 'reject';
      const reviewed = await recordCensusDecision(q, reviewer, id, decision, input.note, input.reviewToken);
      return { ...reviewed, changed: true };
    });
    return ok(result);
  },
});
