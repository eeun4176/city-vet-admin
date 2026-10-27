# Project progress and product discussion

**Updated:** 2026-10-27 (the phases below 2026-10-24 are kept as written on 2026-10-19)
**Scope:** Local staff workflows and reporting in `Modules/local-test-copy`; from 2026-10-23 this repository (`city-vet-admin`).

## 2026-10-23 to 2026-10-27: e-Vet Field integration and analytics

- **Imported** into its own repository (`city-vet-admin`), deployed on Vercel from `main`.
- **Connected to e-Vet Field (Salin):**
  - Bearer-token sessions for the phone app, and CORS (also on error replies).
  - Paravets sign in only to e-Vet Field.
  - Shared barangay program requests, with merging.
  - Stubs printed in e-Vet Field, and census submissions with a `requestId`.
  - Migrations 026–029.
- **One staff role:** Admin, stored as SuperAdmin (migration 028).
- **Password reset by email** for Paravets, through the office Gmail (migrations 030–031). Paravet reassignment notices. Admins can change their username (032).
- **Renamed for users** to e-Vet Admin, with the City Vet seal. The code and database keep `e-Kapon` / `ekapon`.
- **Blank stubs and attendance:**
  - Numbered blank stubs per barangay, printable once the barangay has requested owners; Paravets encode them after hand-over.
  - QR attendance with present and absent.
  - The Paravet terms text is finalised.
- **Analytics:** KPI dashboard with formulas (`server/programKpis.ts`, `/program-kpis`), column charts, reconciliation checks, and CSV/Excel/PDF exports.
- **Data rules:** phone numbers are 11 digits starting with 09, stored as digits, in every form and endpoint. `hosting/08-clear-records.sql` empties test records.
- **Hosting fixes:**
  - The API reconnects to the database after an idle gap on Vercel and allows up to 5 connections per instance.
  - Database time limits (`hosting/07-query-timeouts.sql`).
  - Fixed a 403 error.
- **Look:** e-Vet Field's colour palette in light and dark mode (`night-*` tokens), sentence-case status labels, readable multi-line table cells.

Current documents: [`docs/README.md`](README.md). Shared design and integration documents: `salin/docs/`.

## Latest local phase: Local release-readiness checks

Reviewed on 2026-10-19 with user acceptance still pending. Added a disposable
native recovery rehearsal: all 48 application tables, indexes, constraints, and
function definitions match after restoring a synthetic archive into a new local
database. Restored API checks preserve owner links/search, credentials, photos,
staff grants, zero ages, attendance totals, and consumed QR protection. Synthetic
ID image bytes are purged while verification decisions/history remain. This is
local PGlite evidence only, not a verified Supabase restore or upgrade.

Settings now accurately calls its selected-record download Project data export;
the compatible JSON endpoint explicitly declares it cannot restore a full
database. Busy feedback is included. Old User grants cannot unlock capabilities.
Monthly workbook and historical CSV service imports now reject future actual
dates while retaining past dates. The migration checklist is corrected through
022. No resident-related code or history was removed; the
[resident-code inventory](./RESIDENT-CODE-INVENTORY.md) lists dependencies and
recommendations only.

Build/type checks and **211 tests across 32 files** passed. The recovery rehearsal
passed six check groups. Browser checks verified the revised Super Admin export
label/download/metadata and its absence from Paravet Settings. See
[Release readiness](./RELEASE-READINESS.md) for date/role rules, recovery scope,
artifacts, and remaining acceptance/staging gates. No push, deployment, live
migration, or existing/practice database change was made.

## Previous local phase: Acceptance practice and workflow rehearsal

Prepared on 2026-10-19. `npm run preview:acceptance` starts a separate in-memory
practice database on port 5179, with real-password Paravet, Admin, and Super Admin
accounts. It starts with zero attendance, 12 unused handed-over stubs, a pending
six-stub request, a two-pet capacity for warning checks, and census match/new-owner
review examples. Fresh credentials, QR image, a two-owner/three-pet CSV, and an
unchanged copy of the paper-layout Excel template are generated in
`output/acceptance/`. Restarting discards data and replaces these practice files.

A separate rehearsal on port 5180 passed seven check groups: real login, scoped
rosters/access, interest without automatic issuance, print/handover order,
redemption/retry/reuse protection, walk-in capacity/timing, and CSV review/approval
through registry/global search/participant lookup. The checker refuses the user
practice port. Browser checks covered the capacity warning and attendance results,
explicit census match selection, and the fresh Paravet program with zero visits.
The singular capacity warning was corrected to say “1 pet”. Build/type checks and
204 tests across 31 files passed locally with disposable data.

The [acceptance checklist](./ACCEPTANCE-TESTING.md) contains role changes and
expected results, program/stubs first and census second. User acceptance, physical
printing, real camera conditions, and the user's own completed workbooks remain
unverified. No push, deployment, live migration, or existing database change.

## Previous local phase: Daily workflow performance

Implemented on 2026-10-19. Added a current-workflow disposable benchmark covering
10,000 owners, 20,000 pets, 50,000 service projections, canonical attendance/
standalone sources, staged census, stubs, and ten simultaneous staff journeys.
Registry/picker lists now load compact fields; full details and complete report
fields load on selection. Named registry search fields replace whole-JSON matching.
Recent updates bounds each source without building search text, and program tabs
load on demand. Migration 022 prepares measured read-order indexes for local use.

Local median Recent updates improved 283→16 ms and registry search 297→46 ms.
Registry list bodies fell 39.6→5.2 KB raw (estimated gzip 869→559 B); concurrent
p95 improved 2.11→1.66 seconds. Global search remains near 0.31 seconds. These
are local PGlite results, not Vercel/Supabase speed or bandwidth guarantees.

Build/type checks and **204 tests across 31 files** passed with disposable data.
Browser checks covered details/report field preservation, lazy program tabs,
Recent updates, and current/history search. No push, deployment, live migration,
or existing local database change. See [Daily workflow performance](./DAILY-WORKFLOW-PERFORMANCE.md).

## Previous local phase: Dashboard and shared UI consistency

Implemented on 2026-10-19. Dashboard now prioritizes role-specific unresolved work,
a bounded current/upcoming program list, six permitted shortcuts, and Recent updates.
Admin/Super Admin task counts reuse the sidebar rules. Paravet actions separate
census corrections, barangay gathering lists, and assigned stub batches from items
awaiting Admin. Existing permissions and physical handover responsibilities remain.

Full calendar loads separately; All sections expands the complete permitted list.
Compact, freshly scoped overview reads replace the Dashboard's all-dataset counts
and initial calendar fetch. Shared empty/retry states, visible loading, confirmation
busy feedback, phone layouts, and toast transitions are included. No schema change.

Build/type checks and **198 tests across 30 files** passed with disposable data.
Browser checks covered staff/Paravet views, program/calendar links, full sections,
dialogs, and phone layouts. No push, deployment, live migration, or existing local
database change was made. See [Dashboard and shared UI](./DASHBOARD-AND-SHARED-UI.md).

## Previous local phase: Search and navigation consistency

Implemented on 2026-10-19. Global search and Recent updates now read the current
registry, census, interest, program, attendance, stub, and standalone sources with
clear source/status labels. Current records are the default; Include history
reveals permitted older manual/imported, archived, rejected, and voided records.
Standalone visits remain findable even without a completed procedure.

Current roles, features, assignments, program invitations, owner residence, and
batch-recipient access are checked on each search and exact-ID preview. Paravet
search follows existing workflow access without new permissions. QR tokens and
private image/credential fields stay out of search matching/results. Previews
retain source navigation context and link to correct permitted workspaces;
interest and batch dialogs now accept explicit URL IDs. Page-load failures have
a clear reload recovery screen instead of leaving a blank page.

Build/type checks and **188 tests across 28 files** passed locally in disposable
data. No push, deployment, live migration, or existing local database change was
made. See [Search and navigation](./SEARCH-AND-NAVIGATION.md) for access rules,
source/history definitions, performance limits, and local trial steps.

## Previous local phase: Field-record consistency

Implemented on 2026-10-19. Respondents now reads accepted entries from approved
census submissions; Participants and program Services read attendance-managed
records. Each section keeps older manual/imported history in a separate,
read-only tab. Dashboard respondent/participant counts follow the main sources.
Program interest remains in its existing workspace.

Admin/Super Admin can record a reviewed standalone visit using an explicit
registry owner and linked pets, process checkboxes, actual date, location,
provider, and per-procedure outcomes. Current signed reviews, duplicate reasons,
atomic saves, and retry protection preserve consistency. Voiding requires a
reason and retains snapshots/history while removing completed-service
projections from active totals. New generic field-record creation is blocked;
historical service imports remain supported and labelled.

Migration 021, source links, current Report Basket validation, sidebar updates,
and protected backup coverage are included in disposable local setup only.
Build/type checks and **177 tests across 26 files** passed. Browser checks covered
approved census/history separation, detail history, mixed-outcome service saves,
repeat warnings, multi-process selection, and phone-width layout. The preview
at port 5178 has synthetic practice data; no push, deployment, live migration,
or existing local database change was made. See
[Field record consistency](./FIELD-RECORD-CONSISTENCY.md) for rules and trial steps.

## Previous local phase: Sidebar update and pending-work badges

Implemented on 2026-10-19. Sidebar numbers show unresolved work; dots show unseen
changes from other staff. Successful section data loads clear dots while pending
counts remain until resolved. Parents show one dot rather than adding overlapping
counts. Expanded, collapsed/flyout, and mobile navigation share the same state.

Badge reads and acknowledgements enforce current roles, features, assignments,
and program eligibility. Compact transactional counters contain no owner/pet
payloads. Seen state is account-specific and preserves changes arriving during
a page load. Visible 60-second refresh and write invalidation keep counts current;
the shell no longer fetches inbox bodies merely to count unread messages.

Migration 020 is prepared for disposable setup only. Local build/type checks and
**167 tests across 25 files** passed. Browser checks covered desktop/mobile badges,
collapsed-menu clicks, clearing a dot on opening, and retaining Pending **1**.
No push, deployment, live migration, or existing local database change was made.
See [Sidebar badges](./NAVIGATION-BADGES.md) for scope, counts, and the local trial.

## Previous local phase: Census review and approval consistency

Implemented on 2026-10-19. Admin/Super Admin explicitly select a registry owner,
compare the census and all linked pets, and record a reason for merge, replace,
or keep decisions. No first candidate is preselected. Unknown values, recorded
No, and zero-month ages remain distinct in review and door-to-door output.

Approval opens a current, server-checked summary of create/update/keep/exclude
actions. Changed or expired comparisons/summaries require a fresh review. Both
approval routes enforce these checks. Saved decisions retain actor, reason, and
before/after history; approved entries link to their resulting owner/pet workspace
within existing access limits. Pending sheet corrections preserve decision history.

Migration 019 is prepared and included only in disposable local setup. Local
build/type checks and **156 tests across 23 files** passed, including the actual
Excel/CSV-to-approval/search flow. Approval summaries batch matched records.
The initial browser access problem was resolved after the user reopened the
preview. Built-browser checks passed for explicit selection, comparison/reason,
unknown/No/zero display, saved decisions, approval summary, and opening the
resulting registry owner/pets. No captured browser console errors were present.
Fresh disposable practice records are ready at port 5178. No push, deployment,
live migration, or existing local database change was made.
See [Census review and approval](./CENSUS-REVIEW-AND-APPROVAL.md).

## Previous local phase: Census import and registry connection

QR images can now be read on-device without uploading or storing them. Approved
census owners/pets appear in the staff registry, global search, and scoped
participant selection through stable aliases. Registry edits and approval
undo/redo share conflict checks across structured and workspace-only fields.

The downloadable Excel form recreates the traditional three-owner/five-pet-row
layout, grouped headers, and signature area. Excel/CSV imports lead to editable
review and pending submission; explicit age units and unknown flags are preserved.
Migrations 017–018 are prepared and used only in disposable local databases.
See [Census import and search](./CENSUS-IMPORT-AND-SEARCH.md) for testing steps,
role rules, safeguards, and limits. Paper-photo OCR/API plans were cancelled on
2026-10-19 before implementation. Browser-only QR image reading and camera
scanning remain available. Manual census photo attachments and existing history
are preserved; paper data can still be encoded manually or imported from Excel/CSV.
Local build and type checks passed; **149 tests across 22 files** passed on
disposable data. Built-browser checks covered QR images, approved-census lookup,
XLSX loading, and editable/final CSV review. No push or live migration was made.

## Previous local phase: Owner and pet consistency

Owners and Pets now open a shared detail/review workflow with explicit owner
selection, all linked pets, multiple new pets, possible-match acknowledgement,
and one atomic save. Admin/Super Admin can separately correct missing or
incorrect owner links with a required reason and before/after history. Owner
display changes propagate only to pets linked by ID; attendance snapshots and
other stored pet details remain. Paravets retain scoped read access.

Migration 016 adds reviewed-save requests and record activity. Generic imports,
undo, archive, and restore paths have link/history safeguards. Local build and
type checks passed; **132 tests across 19 files** passed on disposable data.
Built-browser checks covered a two-pet registration and reasoned link correction.
No push, deployment, live migration, or existing local database change was made.
See [Owner and pet workspace](./OWNER-PET-WORKSPACE.md) for current rules,
legacy-data handling, and the disposable local preview.

## Previous local phase: Insights redesign

Reports now starts with canonical program outcomes and separates Registry
statistics, Find records, Create report, and Monthly workbook. The basket has
field selection and a current-data preview with access rechecked before print.
Data Quality checks all accessible active records and offers scoped comparison,
linked pets, Paravet flags, and reasoned Admin/Super Admin decisions/history.
Records are never merged, removed, or reassigned by a review decision.

Migration 015 is prepared and applied to disposable databases only. Local
build/type checks and **120 tests across 18 files** passed. Built-browser checks
covered the Reports sections, report generation, comparisons/history, basket
preview, and keyboard tabs. No push, deployment, live database migration, or
existing local database change was performed. See
[Insights redesign](./INSIGHTS-REDESIGN.md) for current rules and limitations.

## Previous local phase: Performance and loading

Active program views now refresh every 30 seconds while visible. Dashboard
and report summaries reuse results for up to 60 seconds, with Last updated
and Refresh controls. Shared reads, cancellation, lazy page/API loading,
month-scoped calendars, compact filter options, and owner/pet link indexes
reduce repeat work and transferred data. Shared dialogs have focus handling
and entry transitions. Permissions and write validation remain current.

The local build and type checks passed; **112 tests across 17 files** passed
on disposable data. The synthetic baseline uses 10,000 owners, 20,000 pets,
50,000 services and 10 simultaneous staff. The initial main bundle fell from
1,191.26 to 505.16 kB raw; the local repeated mixed-workload 95th percentile
fell from 10.06 to 0.44 seconds. Fresh analytics remains about one second.
These are local measurements, not Vercel/Supabase performance guarantees.

Migration 014 is prepared and included in disposable setup only. Nothing was
pushed, deployed, or migrated in Supabase or the existing local database.
See [Performance and loading](./PERFORMANCE-AND-LOADING.md) for rules,
measurements, limitations, and reproduction steps.

## Previous local phase: Program workspace

Programs and Program day now share a workspace with current/upcoming/recent
programs and Overview, Interest, Stubs, and Attendance sections. It connects
approved demand requests, automatically lists assigned Paravets, uses canonical
attendance for capacity warnings, and records Admin/Super Admin actual timing
with reasoned corrections and overtime. Finishing does not close paper encoding.

Migration 013 is prepared for this phase and included in disposable local setup;
it has not been applied to Supabase. See [Program workspace](./PROGRAM-WORKSPACE.md)
and [QR workflow](./QR-STUB-WORKFLOW.md) for the current rules. The older reporting
notes below describe earlier work and its verification at that time.

Latest validation: local production build and type checks passed; **95 tests
across 13 files** passed against a disposable database. Browser checks covered
schedule creation/review, embedded interest saves, scoped stub and attendance
tabs, calendar links, actual timing, and overtime. No push, deployment, or
Supabase migration was performed.

This page records the user-facing goals, decisions made during discussion,
implemented progress, and remaining verification. For endpoint and workbook
details, see [API-05](./API-05-reporting-and-census-review.md). For a
chronological list of changes, see the [changelog](../CHANGELOG.md).

## Discussion and decisions

### Analytics and report quality

The initial request focused on making findings traceable and understandable:
evidence and source records, reproducible calculations, explanations of grades,
uncertainty, separation of measurements from interpretation, and clear review
of changes and potential bias. The work was scoped to the local React/Vite
application in `Modules/local-test-copy`, preserving current permissions and
source-data boundaries.

The user later asked to remove the **Data scope and limitations**,
**Executive AI Insight**, and **How to read this** sections. That later
direction superseded the earlier request to include a “How to read this”
panel; those sections are not part of the intended presentation.

### Follow-on features

Before implementation, the feature choices were clarified and the plan was
approved:

- **Live planning:** Show an estimate only when there are at least 10 dated
  live service records across 3 distinct calendar months. Synthetic/sample
  records must not satisfy this threshold.
- **Report basket:** Keep selections temporary to the account/browser session;
  do not create a saved or shared report. Existing permissions remain
  authoritative.
- **Spay and Neuter file:** Use `.xlsx` and reproduce the supplied blank
  workbook's structure. Validate the input strictly and make imported data
  searchable. The generated template is the standard to use when preparing a
  workbook.
- **Census statuses:** Support Pending, Approved, and Rejected, with a history
  of changes. Add the traditional Summary and Door-to-door layouts to each
  submission's detail view.
- **Approval reversal:** Allow safe undo/redo only when registry data has not
  changed since the approval. Do not overwrite conflicting edits. The user
  accepted that older approvals with no reliable snapshot cannot be safely
  reversed automatically.
- **Reviewer roles:** The legacy Encoder role maps to Admin, so the controls
  target Admin and SuperAdmin.

## Progress

| Area | Progress |
|---|---|
| Analytics evidence and search | Implemented earlier, including scoped evidence search, data-quality context, and methodology references. |
| Requested section removals | Implemented; the three named sections are removed from the applicable analytics/report views. |
| Live planning threshold | Implemented with live-record and distinct-month coverage; sample data cannot qualify. |
| Report basket | Implemented as session-scoped state with supported entry points for selected records/evidence and field selection. |
| Workbook template and validation | Implemented with the standard headers/month sections, date and barangay validation, non-negative integer procedure counts, and formula-only totals. |
| Workbook import | Implemented as live searchable service records, with exact-file duplicate protection and conflict-guarded undo. |
| Workbook export | Implemented for imported live report records, with year/month/barangay filters and recalculated totals. |
| Census status and history | Implemented for Admin/SuperAdmin, including status edits and review history. |
| Safe approval undo/redo | Implemented for approvals with snapshots; conflicts block reversal, and older unsnapshotted approvals are identified as not safely undoable. |
| Traditional census forms | Implemented as read-only Summary and Door-to-door tabs on submission details. |

The detailed workbook format, endpoint contracts, permissions, and migration
ordering are maintained in [API-05](./API-05-reporting-and-census-review.md).

## Verification status

The latest verification recorded for this work:

- `npm run typecheck` — passed.
- `npm run build` — passed, with the existing/advisory large JavaScript chunk
  warning.
- `npx vitest run tests/spay-neuter-workbook.test.ts` — passed (5 tests).
- Migrations 000–010 — applied successfully in isolated in-memory PGlite.
- `git diff --check` — passed.
- Census and operations integration tests, and the full suite — attempted, but
  could not connect to PostgreSQL at `localhost:5432`. Treat these tests as
  **not verified**, rather than passed.

No deployment or production database migration was performed as part of this
work.

## Remaining follow-up

The earlier database-connection gap recorded above was resolved by the disposable
test runner; the latest full suite passes. Current follow-up:

1. User acceptance testing of the fresh practice census, including their own
   completed Excel/CSV examples. Physical printing has not been exercised.
2. Keep the workbook format contract synchronized with the template/parser if
   the supplied paper form changes.
3. Arrange an independent review of important scoring or methodology changes
   before treating those results as independently validated.
