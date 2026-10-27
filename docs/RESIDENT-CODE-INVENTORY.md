# Remaining resident-related code and history

> **Status (2026-10-27): historical record.** Written before e-Vet Field (Salin) was connected on 2026-10-24. Roles, names, stubs and sign-in have changed since; see [what changed](README.md#what-changed-since-the-phase-records-below). Where this differs from the code, the code is right.

Reviewed 2026-10-19. **Inventory and recommendations only. No listed code or
historical records were removed.** “User” in this document means the retired
resident account role, not a staff member or a generic programming variable.

## Active access is retired

- No resident route or navigation category exists in `src/App.tsx` or `src/nav/nav.ts`.
- `server/accountSchemas.ts` permits new portal accounts only for Paravets.
- Login and first sign-in reject the User role. `server/auth.ts` rejects an
  otherwise valid resident session before granting staff access.
- `shared/permissions.ts` now also denies a retired User's old grant-backed
  capabilities. This closes a permission-helper inconsistency; the API already
  rejected these sessions.
- Resident ID-photo routes are absent from the dispatcher. Migration 011 drops
  their SQL functions, purges image bytes, and retains decision history.
- Resident pre-listing POST returns 410; staff program interest is the active flow.

## Inventory and proposed treatment

| Component / location | Why it remains and dependencies | Recommendation before any removal |
|---|---|---|
| User enum, account-key generation, account foreign keys — `db/000_ekapon_schema.sql`, `db/007_operations.sql` | Historical accounts are referenced by verification decisions, audit rows, pre-listings, and other historical records. Old SQL password helpers accept User as well as Paravet. API entry points block residents. | Keep the enum and referenced identities. Consider a separately reviewed migration preventing new resident credential issuance at SQL level. Do not drop account rows or rewrite old migrations. |
| Retired role types and guards — `shared/permissions.ts`, `server/auth.ts`, `api-handlers/v1/auth/login.ts`, `auth/first-signin.ts`, `src/pages/LoginPage.tsx` | Types let staff tools interpret historical accounts; explicit guards prevent their return through old cookies/login paths. | Keep. Removing a denial guard is not cleanup. |
| Legacy account references — `server/accountSchemas.ts`, `server/accountsView.ts`, `api-handlers/v1/accounts/[key].ts`, `api-handlers/v1/accounts/archive.ts` | The US-key parser and numeric lookup can resolve historical resident identities. The regular list excludes User. Super Admin can address some historical accounts directly; reset-password/renewal endpoints allow only Paravet. | Keep history lookup. Review a dedicated read-only historical-account mode before narrowing direct edit/archive actions. Do not remove the shared account view used for staff accounts. |
| Old account undo condition — `api-handlers/v1/undo.ts` | The Admin branch still accepts User for an existing actor-owned account undo token. Tokens are short-lived; the account list does not expose resident editing. | Candidate for later removal of the User branch after an approved compatibility review. Preserve saved history; keep Paravet/staff undo behavior. |
| Archived pre-listing table, GET route, retired POST response — `ekapon.prelistings`, `api-handlers/v1/prelistings/index.ts`, `server/api-dispatch.ts` | Staff GET reads historical rows with Paravet barangay limits. Reports and the selected-record export depend on this table. POST is a deliberate 410 response. | Keep historical data and scoped reads. The 410 compatibility route can be reconsidered after external callers/bookmarks are inventoried; deleting it would change their response to 404. |
| Archived pre-listing / verification reporting — `api-handlers/v1/reports.ts`, `src/pages/InsightsPages.tsx` | Barangay profiles and report categories display archived pre-listings and verification outcome counts. Some account report options include historical User identities. | Keep the history; consider a clearer Include resident history control so account reporting cannot be mistaken for current staff counts. No automatic migration of pre-listings into named program interest or attendance. |
| ID history storage / purge — `ekapon.id_verifications`, `ekapon.id_verification_log`, `db/011_program_interest.sql` | Decision metadata remains useful after image bytes are purged. The restricted API role has no SELECT permission on the image column. Protected export reads explicit non-image fields. | Keep metadata and the purge migration. Do not restore old image payloads through a rollback. Review older external backups separately before release; this phase never accesses them. |
| Old notification links — `db/007_operations.sql`, `ekapon.notifications`, `src/pages/InboxPage.tsx` | The old submit-photo function generated `/id-verification` links. Migration 011 removes the producer, but stored messages can retain a link to the retired route. Inbox follows stored internal links. | Candidate for a later compatibility message/link handler explaining retirement. Preserve message text, dates, recipients, and read/archive history. Do not silently redirect it to an unrelated record. |
| Historical schema snapshots — `db/final_supabase_schema.sql`, `db/003_dashboard_records.sql`, earlier numbered migrations | The “final” snapshot is partial and still contains resident-era objects. `db/README.md` already directs fresh installs to numbered migrations. | Candidate for moving the partial snapshot into an explicitly labelled historical folder after approval. Keep numbered migration history and dependencies. Never use the partial snapshot for a new deployment. |
| Portal terminology — `server/createPortalAccount.ts`, capability `accounts.manage_portal`, account UI/helper names | These are active Paravet account features despite their old names. `ownerId`/`paravetId` account fields may also carry historical links. | Keep behavior and IDs. Naming cleanup can be reviewed separately; do not delete Paravet account creation, temporary passwords, or first sign-in. |

## Items that are not unused resident features

- `src/pages/InsightsPages.tsx` remains imported by the redesigned Reports page
  for Registry statistics, evidence search, the report builder, and workbooks;
  Audit also uses it. Its exported ReportsPage is active through an alias.
- Owner/pet records are staff registry data, not resident accounts.
- QR camera/image reading serves staff encoding and must remain. Paper OCR/API
  remains cancelled; no recognition dependency or endpoint was found to remove.
- Manual census photos, profile photos, and existing attachments are separate
  retained staff features.
- “Resident barangay” in program eligibility means owner residence, not a login.
- Tests that create historical User fixtures prove retirement safeguards and
  should remain.

## Proposed future cleanup order — no approval requested in this phase

1. Review historical account edits/undo and account-report history labels.
2. Add a retirement explanation for old notification links.
3. Inventory any external users of the legacy pre-listing endpoint.
4. Review SQL-level credential restrictions without deleting historical identities.
5. Relocate misleading legacy snapshots and rename internal helpers only after
   references and deployment instructions have been checked.

No source file was classified as safe to delete solely from its filename or a
keyword match. Any proposed deletion still needs the concrete dependency and
history review requested by the user.
