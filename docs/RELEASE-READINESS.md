# Local release-readiness review

> **Status (2026-10-27): historical record.** Written before e-Vet Field (Salin) was connected on 2026-10-24. Roles, names, stubs and sign-in have changed since; see [what changed](README.md#what-changed-since-the-phase-records-below). Where this differs from the code, the code is right.

Date: 2026-10-19. Scope: the local staff application, disposable databases only.
No push, deployment, live migration, or existing database change is included.
User acceptance is still pending. This document does not declare production ready.

## Findings and changes

| Finding | Local action / evidence |
|---|---|
| Settings called a selected-record JSON export a “full backup”; no application restore route exists. | Renamed the UI to Project data export / Download data export. Added busy feedback and duplicate-click disabling. The existing endpoint/format remain compatible; recovery metadata states its limitations. |
| No current native database recovery rehearsal covered the redesigned workflows. | Added `npm run rehearse:recovery`, which creates and restores its own synthetic PGlite archive. It accepts no existing database URL, archive, or data directory. |
| The permission helper could unlock an old User grant even though API auth rejected resident sessions. | The helper now denies every retired User capability, including grant-backed ones. Login, valid old-cookie, and capability tests cover the boundary. |
| Actual monthly-workbook service dates and generic historical service dates could be in the future. | Their new writes now reject future dates using the Philippine calendar date. Real past dates remain valid. Existing records are not rewritten or deleted. |
| The migration checklist repeated migration 020 and omitted 022. | Corrected the sequence through 022. Existing-installation warnings remain. |
| Resident history references remain in active code and old SQL. | [Inventory and recommendations](./RESIDENT-CODE-INVENTORY.md); no resident code or history removed. |

## Recovery rehearsal

Run `npm run rehearse:recovery` from the project folder. It does not load `.env`
files or `.local-test-db`. It always starts a new in-memory database and synthetic
staff/legacy accounts, then applies the local migration sequence through 022.

Current fixture covers program creation, interest/stub relationships, issuance and
redemption, approved census publication, linked owner/pet records, a standalone
service, manual census/profile PNGs, a temporary staff grant, notifications, and
verification history. Workflow records are created through the normal local API;
synthetic accounts, photos, grants, and legacy verification fixtures are inserted
directly for recovery coverage.

It then:

1. Re-runs migration 011 over a synthetic legacy verification image and checks
   that bytes are purged while the decision/log remain. This checks idempotent
   retirement behavior on the current local schema, not a production upgrade from
   every possible older schema.
2. Checks the selected-record export identifies its recovery limitations.
3. Closes API database connections, writes a native archive to a local file, closes
   the source database, and loads that file into a new PGlite instance.
4. Compares exact row counts and SHA-256 digests for **all 48 ekapon tables**, plus
   the definitions of indexes, constraints, and functions. This is a small
   correctness fixture, not a large-data recovery-time measurement.
5. Verifies restored passwords, photo bytes/API retrieval, grants, owner links,
   global search, zero ages, attendance totals, and rejection of QR reuse.
6. Checks the restored restricted database role can read workflow tables but
   cannot read the retired ID-image column; then checks identity sequences can
   allocate a new account ID.

Artifacts:

- `output/release/recovery-results.json`: counts, digests, scope, and passed checks.
- `output/release/recovery-synthetic.tgz`: native PGlite archive with synthetic
  credentials and records only. It is **not a Supabase recovery file**.
- `output/recovery-rehearsal.log`: command output, including deliberate rejection
  checks. An expected 409 for QR reuse is not a rehearsal failure.

The selected-record JSON export excludes account password hashes and temporary
credentials, dedicated profile-photo/census-attachment storage, grants/requests/
issues/notifications, import-batch/undo metadata, schema, roles, and sequences.
It contains sensitive records and QR inventory and remains Super Admin only.
Legacy JSON fields are exported as stored; this is not an anonymized public report.
The API retains its older `cityvet-supabase-backup-v1` format identifier for
compatibility and declares `completeDatabaseBackup: false` and
`applicationRestoreSupported: false` in its recovery metadata.

## Permissions reviewed

Verification recorded for this phase: build and type checks passed;
**211 tests across 32 files** passed; the native recovery rehearsal passed six
check groups. Browser verification confirmed the revised Super Admin export
wording, a successful compatible JSON download with recovery metadata, and no
export section in Paravet Settings. Screenshot: `output/release/settings-export.png`.
The build's existing large-bundle advisory remains.

| Actor | Current boundary |
|---|---|
| Paravet | Permanent module access, scoped by current barangay/assignment and program eligibility; own census submissions, interest, assigned stub issuance, permitted attendance, and duplicate flags. No program timing, final census approval, owner-link correction, standalone service creation, citywide search, or project data export. |
| Admin | Staff registry review/correction, census decisions and approval, scheduling/timing, batch approval/printing/handover, attendance, standalone services, reports and quality decisions. Certain archive/restore/delete operations require a supported current grant. No Super Admin data export or grant administration. |
| Super Admin | Administrative workflows plus staff/access/system controls and protected project data export. Current role checks and record constraints still apply. |
| Retired User | No active login, first sign-in, current session, or capability, including old grants. Historical identities remain referenced. |

Tests cover revoked/changed access, current barangay and invited-program scope,
owner links, role feature switches, and source-managed record protection across
the existing workflow suites. The native-role check above is narrower than a
full production least-privilege audit. The schema remains private to the server;
it has no application RLS policy and must not be exposed directly to browsers.

## Date, time, status, and process inventory

| Field / action | Allowed values / date boundary | Enforcement |
|---|---|---|
| New program / Program day date | Today or future, Philippine calendar | UI minimum and API validation. |
| Existing historical program date | May stay historical; protected schedules cannot be casually rewritten | Version checks, schedule locks, and workflow API rules. |
| Planned program start/finish | Selectable times; both required for new schedules, finish after start | UI review and API. No overnight schedule model. |
| Actual program start/finish/correction | Program date onward, never future; finish at/after start | UI bounds and API. Admin/Super Admin only; correction requires reason. |
| Stub issue | Staff records the action when issuance is permitted; no editable issue date | Server timestamp; current/future issuable program and handover required. Older paper distribution is encoded through the separate attendance path. |
| Stub redemption / walk-in participation date | Program date through today; delayed entries may be backdated | UI/API; closed collection needs Admin and a late-entry reason. |
| Census form / import / manual-photo census date | Real date, today or past | UI maximum, parser, and API. Blank or ambiguous age units require review. |
| Standalone actual service date | Real date, today or past | UI maximum and API review/save. |
| Monthly workbook actual service date | Real date, today or past, matching its month section | Workbook parser; future-date gap fixed in this phase. |
| Historical service CSV date aliases | `date`, `serviceDate`, `service_date`, `servedOn`, `served_on`, `visitDate`, `visit_date`: real dates, today or past | Shared normalization for new imports; future-date gap fixed in this phase. |
| Report/search/calendar date filters | May select past/future dates to inspect records | Read filters, not scheduling or actual-event writes. |
| Generic retained record dates | Real-date normalization; no blanket ban on future values of unrelated planning/reference fields | Intentionally not reclassified without a field-specific policy. |
| Access-grant duration | 1–30 days; expiry computed by server | Selectable numeric duration and API/database checks. |
| Audit, approval, print, handover, void timestamps | Generated by server/database | Staff cannot type an arbitrary timestamp into these actions. |
| Program status | Planned, Open, In progress, Completed, Postponed, Cancelled | Select control; API enum/lifecycle. In progress/Completed follow timing actions. |
| Program processes | Microchipping, Anti-Rabies Vaccine, Neuter/Spay; multi-select; All of the Above selects all | Checkboxes and API whitelist; no free text or single-choice restriction. |
| Procedure outcomes | Completed, Deferred, Not eligible, per process | Select controls and API enum; actual attendance preserved. |
| Historical status/process text | Preserved as historical data | Does not drive a new active program or recreate a consumed QR. |

## Remaining release gates

1. User acceptance of both checklist journeys, actual printing/scanning conditions,
   and representative completed XLSX/CSV files.
2. Review the actual deployed migration state and take a verified database backup.
   No migration ledger exists; do not run the fresh-install sequence blindly on
   populated data. Rehearse the applicable upgrade and full restore in isolated
   hosted staging, including credentials, photos, grants, and QR consumption.
3. Review retention of older backups containing retired ID images. Do not use an
   old backup to reintroduce those images into the active system.
4. Measure staging Vercel/Supabase latency, payload/transfer size, connection
   handling, and cold starts. Broad global search, the main bundle advisory,
   large exports, and write/storage overhead remain performance follow-up.
5. Consider inventory recommendations only through a separately reviewed change.
   This phase does not approve deletion of history, compatibility routes, or SQL.

No production readiness claim should be inferred from the local tests or this report.
