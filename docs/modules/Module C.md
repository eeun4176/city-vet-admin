# Module C — census capture and review

## Mission

Maintain the end-to-end field census workflow: Paravet form/CSV/image intake, pending submissions, attachments, owner-level review decisions, approval/rejection, resubmission/withdrawal where supported, and census summary/front-page output. Preserve the invariant that field submissions do not become approved registry data until staff review. This module owns the normalized census workflow, not the JSONB dashboard-record CRUD contract.

Read the [Integration Guide](./Integration%20Guide.md) and inspect `server/census.ts`, census handlers, tests, dispatcher registrations, and the current database schema before changing anything.

## Current surface and ownership

Primary files:

- `server/census.ts`, `api-handlers/v1/census/**`
- `src/pages/census/**`, `src/lib/census.ts`, `src/lib/csv.ts`, census i18n, `src/components/CensusSheetEditor.tsx`, `PrintSheet.tsx`
- The accepted normalized schema is in the migration sequence, especially `db/007_operations.sql`, and its local/test snapshot. `db/007_operations.sql` is an established baseline migration: do not alter or re-run it on remote data.
- Tests: `tests/census.test.ts`, `tests/api-dispatch.test.ts`, and focused additions for import/attachments/review.

Changes to route composition, navigation, shared capabilities, API route table, central i18n message types, or schema snapshots require the integration owner's coordinated patch.

## Submission model and invariants

The current submission is a census-sheet batch, not a loose collection of independent dashboard-record writes. The API persists a submission in `ekapon.census_submissions`, submitted owners in `census_owners`, their pets in `census_pets`, and optional images in `census_attachments`. Approved registry state uses `registry_owners` and `registry_pets`.

Current create-body rules are implemented in `server/census.ts`:

- `label`, a real non-future `censusDate`, and source `form | csv | image`;
- nonnegative bounded `householdsVisited`;
- owner/pet schema validation, including dog/cat, male/female, optional bounded demographics/flags, a per-owner pet limit, and bounded submission totals;
- image-source submissions may be created without encoded owners; non-image sources require at least one owner.

The present shape is `{label, censusDate, source, householdsVisited, owners}`. Each owner needs `ownerName`, `address`, and at least one pet; `contact` is optional and must match the Philippine mobile validation rule. A sheet is bounded to 200 owners and 1,000 pets total, with at most 30 pets per owner. Each pet needs `petName`, `species` (`Dog` or `Cat`), and `sex` (`Male` or `Female`). Optional validated pet fields include `ageMonths`, `breedType` (`Mongrel` or `Pure`), `color`, `sterilized`, `confinement` (`Confined`, `Semi-confined`, or `Free-roaming`), `vaccine1st`, `vaccine2nd`, `vaccine3rd`, `vaccineOther`, `booster`, `laps`, `registeredYear`, and `remarks`. Boolean flags default to false. The shared Zod schema remains authoritative for exact bounds and blank/default behavior.

Use the exact shared schemas instead of duplicating frontend-only validation. The handler enforces that only a signed-in Paravet with an assigned barangay can create a submission, and the server takes the barangay and submitter from the session. A client-provided barangay/actor must not override them.

### Review lifecycle

- Paravets can list/view only their own submissions; staff can see the staff review list.
- Only Admin/SuperAdmin may set owner decisions and finalize review.
- Decisions are per submitted owner: `new`, `merge`, `replace`, `keep`, or `reject`. Decisions requiring an existing owner must reference an active normalized owner in the same barangay.
- Staff approval is blocked until all submitted owners have explicit decisions. Applying approved changes must remain transactional and preserve audit/reviewer information. Rejection requires a reason according to the existing server/schema validation.
- Pending-only edit/withdraw/resubmit behavior is guarded by state and ownership checks. A reviewed submission is not reopened by casual update.
- Paravets cannot directly mutate normalized approved owners/pets.

These rules are security and data-integrity boundaries, not UI suggestions. Keep the logic in server handlers/database functions, with tests for cross-account privacy, barangay isolation, invalid decisions, repeated/final decisions, atomicity, and large submissions.

## Endpoint families

The dispatcher currently registers these families; use handlers as the final method/body/output authority:

- `GET`/`POST /api/v1/census/submissions`
- `GET`/update/delete behavior on `/api/v1/census/submissions/{id}` as currently implemented
- `/api/v1/census/submissions/{id}/attachments` and `/{attachmentId}`
- `PUT /api/v1/census/submissions/{id}/decisions`
- `POST /api/v1/census/submissions/{id}/review`
- `/api/v1/census/submissions/{id}/resubmit`
- `GET /api/v1/census/summary`, `GET /api/v1/census/front-page`

List filters and sort keys are validated by the handler. Do not assume an older API doc's JSON shape or route methods are current. Register/test any route addition through the dispatcher.

## Attachment and privacy rules

Paper-sheet attachments are JPEG, PNG, or WebP image bytes sent as base64 JSON `{mime, data}` to the pending-submission attachments route. The current handler limits each decoded photo to 500 KB and each submission to six photos; the HTTP body limit is 1 MB. The database stores the image in `ekapon.census_attachments.image` with a `purge_after` field. Attachments are for staff-assisted paper-sheet review; the current migration explicitly says there is no OCR. GET returns `{mime, data}` after checking access to the parent submission; Paravets may delete only their own attachment from a still-pending submission. The maintenance/retention implementation and current source determine when a photo is purged—do not infer or extend a retention period.

Never invent a public attachment URL or expose one Paravet's private submission to another. Avoid logging submitted image bytes, owner contact details, or unnecessary personal data. If storage limits or a new object store is needed, treat that as a separate provider/retention decision, not an implicit free-tier assumption.

## Reports

Census summary and front-page calculations must use the established approved/normalized registry source and current date/barangay semantics, not pending data or arbitrary demo rows. Keep report totals reconcilable with the review decisions and test whether pending/rejected/withdrawn items are excluded as intended.

## Ready-to-paste contributor prompt

```text
You are the Module C contributor for CityVet e-Kapon. Work only in `Modules/local-test-copy`. Your scope is the normalized field census lifecycle: Paravet form/CSV/image submissions, attachments, pending state, owner-by-owner Admin/SuperAdmin review decisions, approval/rejection, supported resubmission/withdrawal, and census summary/front-page output.

Read `docs/modules/Integration Guide.md` and this Module C brief. Inspect the current `server/census.ts`, every affected census handler, the `server/api-dispatch.ts` entries, UI callers, migration/schema snapshot, and `tests/census.test.ts` before editing. Treat current source and tests as authoritative over the older API-01/API-02 documentation.

Keep the data flow intact: Paravet-authored batch -> pending normalized census submission -> staff decisions per owner -> staff final approval/rejection -> normalized approved registry. Use session-derived submitter and barangay; never accept the browser as authority for account, role, barangay, review actor, or matched registry owner. Paravets may see only their own submissions and may not write approved registry data. Admin/SuperAdmin review must validate same-barangay active owner matches, explicit owner decisions, required rejection reason, legal status transitions, transaction/atomicity, and audit attribution.

Reuse the Zod schemas and server/database helpers in the existing implementation. Preserve field bounds, supported enum values, real non-future census dates, household/pet limits, attachment type/size/retention policy, API error behavior, and current stable IDs. Do not put a second implementation of validation in the UI and assume it secures the API. Do not log PII or image contents.

Keep this workflow separate from JSONB `dashboard_records` owned by Module B. Census approval must not be replaced by direct record writes, and pending submissions must not appear as approved report data. Make only the requested Module C change; do not redesign the schema or role policy. Never edit established `db/007_operations.sql`; propose an additive future migration and coordinate the local snapshot/test schema if schema work is unavoidable.

Coordinate all changes to shared permissions, `src/App.tsx`, `src/nav/nav.ts`, `server/api-dispatch.ts`, central i18n types, and schema snapshots with the integration owner. A handler is not live until its route is dispatched. Preserve Module A auth contracts and coordinate any Module B registry read/ID assumptions before integration.

Add focused tests for allowed/denied roles, own-submission privacy, barangay boundaries, malformed/oversized payloads, owner decisions and matches, state transitions, rollback/atomic behavior, attachments, and report inclusion as relevant. Do not access staging/production or inspect/copy `.env.local`. Run `npm run typecheck`, `npm test`, and `npm run build` in `Modules/local-test-copy` as relevant and report outcomes.

Return a handoff listing UI/API/schema/test files, request/response changes, submission-state implications, role/privacy guarantees, shared-file proposals, migration/setup notes, test results, and known limits. If retention, merge-versus-replace semantics, owner matching, or data exposure is ambiguous, stop and ask the project owner; do not make an irreversible data-policy assumption.
```
