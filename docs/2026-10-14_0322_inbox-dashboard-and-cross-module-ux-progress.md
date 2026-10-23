# Project Progress Record: Inbox, Dashboard, and Cross-Module UX

**Project:** CityVet e-Kapon, `Modules/local-test-copy`  
**Record created:** 14 October 2026, 03:22 (UTC+08:00)  
**Record purpose:** Capture the requests, implementation decisions, responses, and verification from the project conversation to date. This is a progress record, not a release certification or deployment guide.

## 1. Executive summary

The active working copy is `Modules/local-test-copy`, a React/Vite front end with a TypeScript API, PostgreSQL persistence, a local PGlite test workflow, and numbered SQL migrations. The desired later hosting target is Vercel plus Supabase on their free tiers; this work has not deployed or provisioned either service.

The conversation started with plans for independent, merge-compatible modules and later moved through data-model questions, backend and quality gaps, account and ID-verification improvements, analytics and reports, and a broad dashboard/inbox usability request. The latest implementation added a persistent notification archive lifecycle, role-scoped dashboard counts, a barangay search validity guard, application-wide write feedback, back-navigation affordances, a Return to Top control, a more compact dashboard calendar, and calendar links to program records. It also added API/setup documentation and workflow tests.

The latest code changes were verified with both TypeScript checks, a production Vite build, and the full test suite against a disposable in-memory PGlite database. All 62 tests passed. The production build reports an advisory that its main JavaScript chunk exceeds 500 kB; this did not fail the build. The existing local database and its listener were not used for the successful integration run.

## 2. Project context and design decisions carried forward

### 2.1 Module collaboration goal

The original documentation request was for detailed, reusable module briefs and prompts that let four different people or AI contributors build separate pieces and merge them without incompatible assumptions. The project uses four workstreams:

| Module | Main responsibility |
|---|---|
| A | Platform, authentication, roles, accounts, profile, preferences |
| B | Registry, barangay references, pre-listings, operational data, import/export |
| C | Census capture/import, attachments, review, owner-by-owner decisions, census reporting |
| D | Dashboard/insights, reports, calendar, inbox/notifications, audit, data quality, integration |

The working rule is to use current source, tests, migrations, the module briefs, and the integration guide as the contract. Contributors should not copy entire folders from sibling snapshots or independently edit shared schema/dispatcher files without coordinating. The module pack and integration guide are in `docs/modules/`.

### 2.2 Census records are not user accounts

The question “is census data and user data same table?” was answered by distinguishing a census submission from an account. A user account represents an authenticated person and login/role identity; census data represents submitted household, respondent, animal, owner, or pet information. A submission is attributed to its submitter, but its data is not the person’s account row.

### 2.3 Two operational persistence models

The discussion “Owners and pets have two persistence models” refers to different purposes and contracts:

1. `ekapon.dashboard_records` stores UI-shaped dashboard datasets as JSONB, including `owners` and `pets`, behind an allowlisted records API. This is a compatibility bridge for dashboard modules that previously relied on CSV-shaped data.
2. Census review and the approved registry use normalized submission, owner, pet, and registry tables, with database-backed review and approval workflows.

These are not automatically synchronized replicas. A risk of treating them as interchangeable is divergent values/counts, duplicate records, reports reading one store while a workflow writes another, and a corrected registry entry not changing a dashboard JSONB row. The intended rule is to use the normalized census/registry path for census submissions and approved registry calculations; do not bypass review by writing a census submission directly to dashboard JSONB. Finalizing one canonical cross-module owner/pet source remains a broader data-model task and requires an explicit migration/reconciliation decision before production use.

## 3. Conversation request history and recorded outcomes

The initial prompts and some of the intermediate discussion were summarized during the session. The history below records the substance of each request and the outcomes available in the current session/checkpoints. “Previously completed” describes earlier reported work; the latest test run did not re-verify every historical feature.

### 3.1 Module planning and local project

- **Request:** Create extensive per-module documentation and highly detailed contributor prompts for `local-test-copy`; divide the work into four feasible, merge-compatible personas; keep the result compatible with the local project and consider Vercel/Supabase free-tier hosting after merge and testing.
- **Request:** Start building the local project and ask questions before starting.
- **Recorded outcome:** The module documentation pack, four role briefs, prompts, and integration guidance were created in earlier work. The chosen working copy is `Modules/local-test-copy`. Hosted deployment was intentionally not part of the latest change.
- **Design note:** Current source and tests outrank historical API snapshots if a contract differs. Use the shared integration guide and avoid simultaneous edits to migration/dispatcher files without coordination.

### 3.2 Data model and project gap review

- **Request:** Clarify whether census data and user data share a table.
- **Request:** Identify gaps, limitations, improper formats, dirty-worktree concerns, and problems in current progress.
- **Request:** Explain JSONB dashboard owners/pets versus normalized census registry persistence and unfavorable outcomes.
- **Request:** Put that specific issue and recommendations into a self-contained plain-text file, including schema and context.
- **Request:** Assess whether the recommendation is feasible based on client intent and project progress.
- **Request:** Finalize schema and records before building incomplete modules.
- **Recorded outcome:** The work distinguished identity records from census submissions and documented that JSONB dashboard records and normalized registry records have different purposes and are not inherently kept in sync. Earlier history reports that recommendations/schema work and the standalone owner/pet persistence explanation were completed. The key remaining architectural risk is dual sources of truth unless data ownership, reconciliation, and report sources are deliberately defined.

### 3.3 Backend, account and ID-verification workflows

- **Request:** Build missing APIs and backend support.
- **Request:** Add temporary-password renewal for Paravet accounts, available to Encoders/Admin/SuperAdmin when selecting a Paravet account.
- **Request:** Keep the ID-rejection free-text reason field and add a database-backed choice list, including the supplied image-quality, identity mismatch, validity, verification/system, and fraud-prevention categories, plus “Other”; use the two supplied mock valid-ID images as examples.
- **Request:** Fix the ID-verification one-character-at-a-time text entry problem.
- **Request:** Investigate repeated `422 RULE_VIOLATION` / PostgreSQL `22023` responses for ID-photo retrieval and fix photos not showing.
- **Recorded outcome:** Earlier progress reports say the Paravet renewal endpoint/UI and ID-verification enhancements were implemented, including grouped rejection reasons saved with reviewer details in the existing decision-reason field. The mock-image workflow tests were added earlier. Existing API docs state that photo review uses a restricted database function and returns `404` for missing verification or `410` for unavailable/purged image data.
- **Verification scope note:** These older features were exercised as part of the latest full API test suite, but the exact repeated production-like `422` log scenario was not independently recreated in this documentation task.

### 3.4 Record-table usability, QA and data visualization

- **Request:** Add pagination and clear-filter controls to record tables; correct modal positioning when there are many rows.
- **Request:** Ensure search inputs accept continuous text and do not refresh on each character.
- **Request:** Recheck missing functions, tests/QA, logout, and possible errors across roles.
- **Request:** Add realistic, interpretable annual analytics across the five requested veterinary domains, with comparisons, trends, insights and recommendations; omit metrics unavailable in the current schema.
- **Request:** Remove simulation warnings and present the application as real; add charts/graphs/heatmap.
- **Recorded outcome:** Earlier progress says operational analytics and visualizations were implemented with explicit sample/live separation, trend comparisons where supported, and a visible statement when the current schema cannot support a requested metric. This safeguards users from interpreting generated sample rows as live data or unsupported metrics as fact. The current analytics limitation notes state that some requested epidemiology, clinic-capacity, shelter, inventory, and population denominators are unavailable; they are not fabricated.
- **Interpretation note:** The request to “remove all simulation warnings” conflicts with the need not to misrepresent synthetic rows. The recorded approach preserves clear sample/live separation rather than silently portraying test/sample records as real.
- **Earlier verification:** Prior summary reports 61 tests, both TypeScript checks, and a production build had passed before the latest feature batch. The latest batch was retested afterward, as recorded below.

### 3.5 Barangay drill-down and report builder

- **Request:** Make barangays interactive and show barangay code/ID, active Paravets, census, and all related data.
- **Request:** Let Admin choose a barangay/category/account/pet/Paravet as report filters and combine sections into a single printable report with visualizations.
- **Recorded outcome:** Earlier work implemented an authorized reports API, barangay detail panel, category/record filters, and a printable census-inspired report with charts and supported source data. Existing `docs/API-02-dashboard.md` records the report/selection behavior, role controls, sample isolation, and data limitations.
- **Data limitation:** Reports only use fields and relationships available in current storage; unsupported metrics are not inferred. The report feature does not resolve the broader dual-persistence question by itself.

### 3.6 Latest broad UX request

The most recent substantive user request combined these items:

1. Separate notifications/inbox into read and unread; let a user open a message, archive it, and follow an internal destination when present.
2. Add a right-aligned item count to each dashboard navigation card.
3. Add a back action in modals and tabs/pages.
4. In Census Summary, show a centered prompt before a barangay is selected; change the selector into a search/select control limited to existing barangays.
5. Show progress during operations, particularly slower operations, and top-right confirmation/status feedback.
6. Add a Return to Top button after scrolling down.
7. Arrange the dashboard with welcome/navigation on the left, calendar/events on the right, and Recently Added below; compress the calendar/cards to reduce unnecessary vertical scrolling.
8. Make calendar events open relevant program details, and make program details navigable where supported.
9. The original message ended with an incomplete “add a” fragment. It was not expanded into an assumed feature.

**Recorded implementation response:** These features were implemented in the local copy, with a persistent notification archive migration, count API, UI feedback wiring, census validation, dashboard layout changes, and calendar links. The details and current behavior are specified in Sections 4–6.

## 4. Latest implementation details

### 4.1 Notification inbox lifecycle

Notifications remain stored for their recipient; archiving hides them from the regular inbox instead of deleting them. All reads and writes are scoped by the authenticated session account ID in the API.

**List request**

```http
GET /api/v1/notifications?view=unread
```

Supported `view` values: `unread`, `read`, `archived`, `all`. The response contains at most 200 newest-first rows, the current view, and counts:

```json
{
  "data": [
    {
      "id": 123,
      "kind": "program",
      "title": "Program update",
      "body": "Details...",
      "link": "/programs",
      "created_at": "2026-10-14T00:00:00.000Z",
      "read_at": null,
      "archived_at": null
    }
  ],
  "unread": 1,
  "counts": { "unread": 1, "read": 0, "archived": 0 },
  "view": "unread"
}
```

**State-change request**

```http
PATCH /api/v1/notifications
Content-Type: application/json

{ "action": "archive", "id": 123 }
```

Supported actions:

| Action | Effect |
|---|---|
| `read` with `id` | Sets `read_at` if the recipient owns an unarchived row. |
| `read-all` | Marks the recipient's unarchived unread rows as read. |
| `archive` with `id` | Sets `archived_at`; also marks the row read. |
| `restore` with `id` | Clears `archived_at`; preserves its read state. |

The mutation response includes `{ "updated": n }`; `0` is returned when the row is not owned by the caller or is not in a state eligible for that transition. External destinations are not followed: the UI only offers a related-page action for paths that start with `/` and are not protocol-relative `//...` URLs.

### 4.2 Persistence migration

- `db/007_operations.sql` defines the notification archive column for the operations schema.
- `db/009_notification_archive.sql` upgrades an existing operations schema idempotently with `ADD COLUMN IF NOT EXISTS archived_at` and grants update rights only to the notification state columns.
- `scripts/prepare-local-db.mjs` applies 009 after the operations schema in both fresh and existing local test setups.
- `README-BACKEND.md` documents applying 009 after operations schema creation and before deploying the inbox changes.

For an existing hosted project, the migration must be applied to the intended database using the reviewed migration process. The local test run did not apply migrations to Supabase or any other hosted system.

### 4.3 Dashboard count API and badge meanings

```http
GET /api/v1/dashboard/counts
```

The response has a `counts` object keyed by the navigation node IDs used in the UI. Counts are computed server-side; archived dashboard records are excluded. SuperAdmin/Admin are city-wide, Paravet is barangay-scoped where applicable, and User does not receive staff record totals.

Meaningful keys include:

- `owners`, `pets`, `paravets`, `respondents`, `households`, `animals`, `stubs`, `services`, `programs`, `participants`: active dashboard-record totals by dataset.
- `accounts`: active visible accounts; Admin count excludes Admin and SuperAdmin accounts.
- `prelistings`: service pre-listing total; `id-verification`: visible ID-verification submissions.
- `census-pending`, `census-approved`, `census-rejected`: in-scope submission counts by review status.
- `census-submit` and `census-mine`: caller's own submissions; `census-import`: CSV-origin submissions in scope.
- `census-review`: pending submissions; `census-summary` and `census-front`: accessible barangays; `program-day`: program records.

**Interpretation warning:** A badge is a count of associated items, not necessarily the number of rows rendered on the destination page. For example, the census summary/front-page badge counts accessible barangays, and program-day is backed by program records. The UI presents a loading marker while counts load and an explicit error notice if the request fails; it should not portray a failed request as a verified zero.

### 4.4 Census summary barangay search

The existing barangay list populates a search/datalist control. A value is accepted only when it exactly matches an existing barangay name, case-insensitively. Invalid free text does not trigger the summary request. Summary mode displays the centered instruction to select or search for a barangay before showing data. The separate front-page flow may allow its citywide/empty-barangay state.

### 4.5 Dashboard layout, app feedback, and navigation

- Dashboard navigation cards show a right-aligned badge.
- At wide breakpoints, navigation/welcome sit beside the embedded calendar; the embedded view suppresses its redundant monthly event sidebar to conserve space. Recently Added is centered below.
- Non-GET API requests dispatch global start/end/success events. The app shell displays a pending-operation indicator and a short top-right confirmation; existing API errors remain visible as error feedback. Authentication/logout requests are excluded from generic mutation-success notices.
- Modal headers expose a back/close arrow wired to the existing modal close callback. The app shell exposes browser-history back navigation on non-dashboard routes.
- Return to Top becomes available after the app's main pane passes its scroll threshold and scrolls that pane.
- Calendar day entries and event-list entries navigate to `/programs?recordId=<encoded-id>`.

### 4.6 Documentation and test updates

- Added `docs/API-04-inbox-and-dashboard-feedback.md` for endpoints, state rules, count semantics, interaction behavior, and verification instructions.
- Updated `README-BACKEND.md` to link to API-04 and retain the ordered migration guidance.
- Updated the integration guide to clarify that `db/final_supabase_schema.sql` is an older partial snapshot and not a substitute for the current ordered migrations.
- Added inbox lifecycle and recipient-isolation tests; expanded count API assertions for role scope and accessible barangay counts; ensured dispatcher coverage includes `/dashboard/counts`.

## 5. Verification record

The following commands were run from `Modules/local-test-copy` after the implementation:

| Validation | Result |
|---|---|
| `npm run typecheck` | Passed (`tsc --noEmit` and application `tsc -p tsconfig.app.json --noEmit`). |
| `npm run build` | Passed. Vite emitted its advisory that the main JS chunk is over 500 kB minified; this is a bundle-size optimization warning, not a build failure. |
| Full Vitest suite | Passed: 9 test files, 62 tests. |
| `git diff --check` | Passed with no whitespace errors. |

The test suite was run against a disposable in-memory PGlite instance initialized with the applicable schema/migration SQL and served on a separate temporary port. This was necessary because the default Vitest URL expects PostgreSQL at localhost:5432, where no test server was listening. The initial unconfigured `npm test` attempt consequently failed to connect; the full successful run used the isolated PGlite database. The existing local listener/database was left untouched.

The test output includes expected negative-path API logs (for example rejected invalid images, forbidden role actions, and invalid workflow transitions). Those are exercised error cases, not evidence of suite failures; the suite concluded with all 62 tests passing.

## 6. Current boundaries and follow-up considerations

1. **Hosted deployment is still future work.** No Vercel project, Supabase project, hosted schema, environment variables, domain, or production traffic was configured as part of this progress.
2. **Apply schema before UI on existing installs.** Migration 009 must be applied after operations schema creation. Confirm the migration target and backup procedures before any hosted database change.
3. **Counts have contextual meanings.** Keep the API-04 definitions close to the implementation and avoid presenting every badge as a count of exact rows on its linked page.
4. **Navigation back is history-based.** Browser-history back can return outside the app or have no useful prior page in some entry flows. A future UX revision may require explicit parent-route destinations, but no such behavior was assumed here.
5. **Generic feedback text is route-derived.** The global toast uses an operation verb and a resource derived from the request path; it is not a detailed audit entry. Validate its wording on newly added API mutation paths.
6. **Program routing depends on stable IDs.** Calendar navigation uses the event/program ID and the records page's `recordId` query convention. Confirm that each emitted calendar event ID maps to a program record; otherwise the destination may show the normal missing-record state.
7. **“Every modal and tab” coverage should be checked as modules evolve.** Shared modals now have a common back/close affordance and pages have a shell-level back affordance; this does not imply every internal tab has independent history or a separate back stack.
8. **Data-source consolidation is unresolved at system level.** Normalized registry data and JSONB dashboard datasets remain distinct. Define migration ownership, reconciliation, and report-source rules before treating them as a single canonical registry.
9. **Simulation truthfulness remains important.** Synthetic records must remain distinguishable in analytics and operational testing. Do not remove disclosures in a way that implies test rows are real municipal records.
10. **Bundle size can be improved later.** The current production bundle builds; code splitting is an optimization and was not bundled into this UX task.
11. **The user’s unfinished “add a” phrase remains unspecified.** No additional feature was guessed from the incomplete fragment.
12. **The repository worktree contains unrelated/pre-existing changes.** The root worktree also showed a modified `role-dashboard.js` and untracked `EKAPON-BUILD-GUIDE.md`, `Modules/`, and `samples/`. These were not reverted or altered except for changes inside the requested `Modules/local-test-copy` work area.

## 7. Relevant implementation references

- [API-04 inbox, dashboard counts, and feedback](./API-04-inbox-and-dashboard-feedback.md)
- [Backend setup and migration order](../README-BACKEND.md)
- [Module collaboration pack](./modules/README.md)
- [Integration Guide](./modules/Integration%20Guide.md)
- [API-02 historical dashboard/report snapshot](./API-02-dashboard.md) — useful context, but not authoritative where it conflicts with current source.
- [API-03 identity and operations workflows](./API-03-operations-workflows.md)

Primary latest-change implementation areas:

- `api-handlers/v1/notifications.ts`
- `api-handlers/v1/dashboard/counts.ts`
- `server/api-dispatch.ts`
- `db/007_operations.sql` and `db/009_notification_archive.sql`
- `scripts/prepare-local-db.mjs`
- `src/pages/InboxPage.tsx`
- `src/pages/DashboardPage.tsx`
- `src/pages/CalendarPage.tsx`
- `src/pages/census/CensusReports.tsx`
- `src/components/AppShell.tsx` and `src/components/ui.tsx`
- `src/lib/api.ts`
- `tests/operations-workflows.test.ts` and `tests/api-dispatch.test.ts`
