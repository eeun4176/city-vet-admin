# Owner and pet workspace

Local phase completed on 2026-10-18. Migration 016 is prepared and included in
disposable setup only. Nothing was pushed, deployed, or migrated in Supabase or
the existing local database.

## Staff flow

1. Open **Registry → Owners** or **Pets**. Lists are searched and paginated;
   filters are collapsed until needed. Opening a record immediately opens a
   dialog with a loading indicator while its details arrive.
2. Owner details show the owner, all pets linked by owner ID (including archived
   pets), possible name-only/conflicting associations, and recent history.
   Pet details show its confirmed owner and that owner's linked pets. Pet
   sections expand to show full details. Name-only associations are review cues.
3. **Add owner and pets** starts one new registration with at least one dog or
   cat. **Add pets to an owner** requires selecting an existing owner record;
   entering a name alone never establishes the link. Selection shows the owner
   and its current pets before continuing.
4. Review the owner, proposed pets, currently linked pets, possible matches, and
   changes before saving. Changes and link corrections require a reason.
5. Save the reviewed owner and pets together. A failure rolls the whole save
   back; retrying the same save returns the original record IDs.

There is no total pet limit per owner. A form accepts up to 30 new pets per
transaction; further pets can be added afterward. The separate stub rule remains
1–3 pets per stub.

## Roles

| Actor | Registry access |
|---|---|
| Paravet | Read records and linked details within their assigned barangay. Existing field encoding and interest/attendance workflows remain available under their own permissions. |
| Admin | Create and edit owner/pet records, review possible matches, and correct owner links with a reason. |
| Super Admin | Same registry workflow, plus existing archive/restore and protected backup permissions. |

Current account and feature access are checked on every request. This phase
does not grant Paravets registry editing or owner-link correction rights.

## Correcting older links

Use **Pets → open pet → Correct / change owner link**. Select the verified owner,
enter the reason, inspect the current pet and selected owner's pets, then confirm
the separate link change. Missing links and multiple name matches are never
resolved automatically. Changing an already confirmed link follows the same flow.

The current owner ID and derived owner/barangay display values change together.
Other pet details remain. Before/after snapshots, actor, reason, and time are
recorded. Program attendance snapshots and past owner information are retained.
Moving the last pet away retains the former owner as a historical record rather
than automatically deleting or archiving it. New owner registrations still need
at least one pet.

Changing an owner's name or barangay updates derived display values on all pets
explicitly linked to that owner, including archived pets, in the same transaction.
Potential name-only associations are not moved. Existing vaccination flags and
other fields outside the form are retained. Legacy `age` values have no reliably
specified unit: they remain visible as original values, while verified age is
stored separately in months. Zero months is valid; blank means not recorded.

## Duplicate and save safeguards

- Possible owner matches use name or contact within the same barangay; possible
  pet matches use name/species and compatible sex under the selected owner.
  These are review cues, not proof that two records are the same.
- A possible match or repeated pet within a draft requires acknowledgement and
  an explanation for keeping separate records. No automatic merge or deletion
  is provided. The review shows up to 20 matching records and the full count.
- A review expires after 10 minutes. A changed draft, owner, pet, linked-pet set,
  archive state, or matching record requires a fresh review before saving.
- Registry writes share a transaction lock. Request IDs protect retries from
  creating duplicate registrations. Preview requests do not emit a Saved toast.
- Owner/pet list and detail responses exclude private image, credential, and
  verification fields. History snapshots use the same filtering. Protected
  backups include the new request and activity tables.

The history panel shows the latest 100 workspace actions per record. Older
workspace actions remain in the database and protected backups. Existing records
without workspace history are clearly identified; no history is fabricated.

## Other write paths

Generic pet creation/import requires an explicit active owner ID; even a single
matching name is insufficient. An existing confirmed link can be retained, but
changing or supplying a missing link requires the correction flow. Generic writes
and CSV imports cannot overwrite records already managed by this workspace.
Generic owner identity/residence changes and duplicate-name creation are directed
to review. Owner-only CSV import remains blocked.

Old quick-undo actions for owner/pet records are blocked: staff make a new,
reviewed correction so links and history remain consistent. Import undo also
checks whether workspace-managed records would be affected. Existing census
submission approval and its separate structured census tables retain their
established review workflow.

Owner archive marks only pets archived with that owner. Restoring that owner
restores only those marked pets; pets previously archived independently stay
archived. Older unmarked cohorts need individual review. A pet cannot be restored
under an archived or unconfirmed owner. The last active pet cannot be archived
alone. Archive operations retain the existing database audit trail.

## Verification and local review

- Local production build, then type checks and the disposable database suite:
  **132 tests across 19 files passed**, including 12 registry tests.
- Tests cover atomic rollback after a forced pet insert failure, retry IDs,
  stale reviews, duplicate acknowledgement, explicit owner selection/import,
  reasoned correction/history, legacy age preservation, field retention,
  private-field filtering, role/feature boundaries, and archive/restore cohorts.
- Built-browser checks covered creating an owner with two pets, reviewing the
  linked records, and correcting an unlinked pet through explicit selection and
  a recorded reason.
- The existing large main JavaScript chunk advisory remains; this phase is not
  a new Vercel/Supabase performance benchmark.

`npm run preview:registry` serves the built application at
<http://127.0.0.1:5178/registry/owners> with disposable synthetic data. It never
reads `.env.local` or opens the existing local database. Restarting resets its
test records. Build first when reviewing source changes.
