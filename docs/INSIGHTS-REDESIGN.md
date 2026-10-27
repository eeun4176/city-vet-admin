# Insights redesign — local implementation

> **Status (2026-10-27): historical record.** Written before e-Vet Field (Salin) was connected on 2026-10-24. Roles, names, stubs and sign-in have changed since; see [what changed](README.md#what-changed-since-the-phase-records-below). Where this differs from the code, the code is right.

Updated: 2026-10-18. Applies to the React/Vite application in this directory.
The user approved Insights next, program outcomes first, and barangay-scoped
Paravet flags with Admin/Super Admin review. No push or deployment is included.

## Screens

| Screen | Purpose |
|---|---|
| Reports → Program outcomes | Owner visits, pet visits, completed procedures, stub/walk-in visits, procedure outcomes, and paginated programs. Default view. |
| Reports → Registry statistics | Existing registry indicators, with trends, service planning, and monthly tables collapsed until opened. |
| Reports → Find records | Existing scoped evidence search and Add to report actions. |
| Reports → Create report | Existing source-isolated report builder and print output. |
| Reports → Monthly workbook | Existing template, validation, import, guarded undo, and export tools, moved out of Data Quality. |
| Report basket | Grouped record/field selection, clear confirmation, current-data preview, and verify-before-print. |
| Data quality | Searchable, paginated possible matches and missing-detail cues across all permitted active registry records. |

Reporting tabs support arrow keys, Home, and End. Tab changes use the shared
transition and reduced-motion preference. Comparison dialogs open immediately
with a loading spinner while record details/history load. Report previews and
workbook operations display a working dialog; saves show progress and outcomes.

## Program counting rules

The default outcomes endpoint reads canonical `program_attendance`, not its
generic participant/service mirrors. Only Submitted attendance contributes;
Voided attendance and programs marked as sample data do not contribute.

- Owner visits count attendance entries, including repeat owners and multiple
  stubs. They are not a count of distinct people.
- Pet visits count pets in those attendance entries, including repeat visits.
- Selected procedures count each selected process for each pet.
- Completed, Deferred, and Not eligible use the per-process outcome when
  supplied; older entries fall back to that pet's overall outcome.
- Stub and walk-in totals count owner visits by attendance source.
- Year refers to the actual attendance date. The barangay filter refers to
  the owner's residence, including approved guest barangays. Program cards
  include matching host/approved programs, even if attendance is zero.
- Archived programs keep their historical attendance; cards identify them as
  archived. Finishing a program continues to preserve later paper encoding.
- Imported monthly workbooks remain service-volume records under Registry
  statistics and Monthly workbook. They are not silently combined with
  canonical program attendance.

Program summaries may reuse results for up to 60 seconds using the existing
bounded cache/data-age rules. Authentication/feature checks run before a
server cache read. Refresh bypasses stored summaries. See
[Performance and loading](./PERFORMANCE-AND-LOADING.md).

## Data Quality rules and permissions

Data Quality checks all accessible active owner/pet records on the server;
the browser receives one result page. Sample rows are excluded.

| Cue | Rule |
|---|---|
| Owner matches | Same name after trimming, collapsing whitespace, and ignoring case, in the same named barangay. |
| Pet matches | Same normalized pet name, explicit owner ID, species, and sex. |
| Missing contact | No nonblank mobile, contact, or phone field. |
| Missing pet age | No recorded age or age in months; zero months is valid. |
| Unverified owner link | No matching active owner ID. Name-only relationships require verification. |

Matching is deliberately conservative. It does not detect every spelling
variation, and a lack of matches is not proof of unique identity. Counts of
owner/pet matches are pairs needing review, not a number of duplicate people.
Missing contact/age is not a reason to refuse service.

Paravets have permanent `quality.view` and `quality.flag` capabilities within
their assigned barangay. Both records must be accessible there. Admin and
Super Admin can flag and review citywide; `quality.review` remains unavailable
to Paravets. Current Data Quality and Registry feature switches are enforced
on the server. This does not grant Paravets registry write or citywide Reports
access, and it does not restore resident accounts.

The comparison shows selected owner/pet details, explicit owner-ID pet links,
and review history. It returns no ID image data. Owner comparisons show up to
50 linked pets per record with an explicit truncation notice; full registry
links remain available. Name-only links are not treated as confirmed links.

Review states are Needs review, Distinct records, Duplicate confirmed, and
More information needed. Every flag/decision requires a reason of 3–1,000
characters and records the actor, time, action, and data fingerprint. A flag
can reopen a review. Version checks reject conflicting staff decisions.
Changes to either compared record or an owner's linked pets require a fresh
comparison; prior decisions remain in history. Changed matching fields can
remove a pair from current candidates; its protected review rows remain.

**A decision never merges records, reassigns pets, deletes data, or blocks
attendance.** No automatic identity matching, cross-barangay owner merge,
fuzzy-name merge, or registry cleanup is performed. The UI shows the most
recent 100 review actions; all actions remain in protected Super Admin backups.

## Report basket integrity

Selections remain temporary in account/browser session storage (maximum 300
records). Common record identities deduplicate registry and analytics entry
points while keeping datasets separate. Empty field selections cannot print.
Restored selections are sanitized again; account keys, usernames, credentials,
internal ID fields, and image/photo fields are excluded.

Preview sends references, fetches current values, and checks current account,
feature, dataset, barangay, and census-submitter access. Admin account previews
include Paravets only, matching the existing account list. Paravets cannot
preview account-directory records or other Paravets' census submissions.
Unavailable/archived records are excluded and block the app's Print action
until removed. Verify and print repeats the server check. The preview itself
does not change source records. This cannot retract reports already printed
or information a staff member previously viewed.

The preview shares the office letterhead with print output. Up to six columns
use a table; wider selections use record details to avoid an unreadable wide
printed table. The browser print dialog determines final paper settings.

## Schema, APIs, and verification

Migration **015**, after 014, adds `data_quality_reviews` and the append-only
`data_quality_activity` API history. Both are included in Super Admin backups.
It changes no registry or historical attendance records. It is prepared and
applied only to disposable test/preview databases, not Supabase or the existing
local database.

New protected routes:

- `GET /api/v1/program-outcomes` — attendance year, owner barangay, pagination.
- `GET /api/v1/data-quality` — paginated cues or a scoped comparison/history.
- `POST /api/v1/data-quality` — reasoned flag or authorized review decision.
- `POST /api/v1/report-basket-preview` — read-only current values/access check.

Local build/type checks and **120 tests across 18 files** passed. Tests include
records beyond the old 100-record limit, normalized matches, valid zero age,
linked pets, barangay restrictions, feature changes, review conflicts/history,
changed owner/pet comparison data, mixed procedure outcomes, exclusion of
voided/mirrored attendance, account/census privacy, current basket values, and
private-field exclusion. Existing QR, program, census, workbook, and account
regressions remain in the suite.

The built browser review covered program outcomes, all five Reports sections,
report generation, saving/reopening review history, basket selection/preview,
and keyboard tab navigation. No browser console errors were observed. Physical
printing was not performed. Production build still has the existing large
main-bundle advisory; this phase makes no new cloud-performance claim.

To review locally with synthetic records:

```text
npm run build
npm run typecheck
npm test
npm run preview:insights
```

The Insights preview uses `http://127.0.0.1:5177/reports` and an in-memory
database. It does not read `.env` files or open the existing local database.
Focused tests can run with `npm test -- tests/insights-workflows.test.ts`.
