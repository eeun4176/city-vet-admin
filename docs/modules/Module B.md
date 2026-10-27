# Module B — registry and operational data

> **Status (2026-10-27): historical record.** Written before e-Vet Field (Salin) was connected on 2026-10-24. Roles, names, stubs and sign-in have changed since; see [what changed](../README.md#what-changed-since-the-phase-records-below). Where this differs from the code, the code is right.

## Mission

Own the existing dashboard-record surfaces used for registry and city operations: owner/pet and field datasets, barangay references, verified-user pre-listings, program/service data, and record import/export/undo. Keep those screens and APIs on the current authenticated API and JSONB persistence contract. Do not reinterpret this workstream as the normalized census registry or as account management.

Start with the [Integration Guide](./Integration%20Guide.md), then inspect the route table, `server/dashboard.ts`, handlers, database snapshot/migrations, and existing tests.

## Current surface and ownership

Primary files:

- `server/dashboard.ts`, `api-handlers/v1/records/**`, `api-handlers/v1/barangays/index.ts`, `api-handlers/v1/prelistings/index.ts`
- `api-handlers/v1/recently-added.ts`, `api-handlers/v1/search.ts`, `api-handlers/v1/sample-data*.ts` only when the assigned task explicitly includes the existing shared utility
- `src/pages/RecordsPage.tsx`, `ReferencePages.tsx`, `DataManagementPage.tsx`, related table/import components and CSV helpers
- Relevant existing SQL objects are in the agreed baseline, including `dashboard_records`, import history, barangays, and pre-listings. The current browser/API contract is not a license to edit migration 007.
- Tests: `tests/dashboard-contract.test.ts`, relevant API tests in `tests/auth-accounts.test.ts` or focused additions, and `tests/api-dispatch.test.ts` for route changes.

Keep `src/App.tsx`, `src/nav/nav.ts`, `shared/permissions.ts`, and `server/api-dispatch.ts` changes coordinated with the integration owner.

## Dashboard-record contract

`server/dashboard.ts` is authoritative for the current dataset allowlist:

`owners`, `pets`, `paravets`, `respondents`, `households`, `animals`, `stubs`, `services`, `programs`, `participants`.

These values are server-approved dataset keys, not SQL table names. Records are JSONB rows in `ekapon.dashboard_records`, keyed by `(dataset, record_id)`. They require a stable string or positive integer `id`; write batches contain 1–100 rows and each persisted record is capped at 20 KB in the handler. The server validates and normalizes Philippine mobile fields and date-like fields. Archive writes use stable IDs and are separately bounded. Follow the current handlers for accepted query fields, pagination, sorting, error envelope, and undo-token lifecycle.

The existing records endpoint is `GET`/`POST /api/v1/records/{dataset}`. Related endpoints include:

- `POST /api/v1/records/{dataset}/archive`
- `POST /api/v1/records/{dataset}/import`
- `POST /api/v1/records/{dataset}/undo-import`
- `GET /api/v1/barangays`
- `GET` for authorized staff review and `POST` for verified `User` intake at `/api/v1/prelistings` (the submitter must have an active account and approved ID)

The server is the boundary for dataset allowlisting, role checks, input validation, barangay scoping, transactions, undo, and audit behavior. Never construct SQL identifiers from `{dataset}` or let a browser provide its own authorization scope.

`SuperAdmin` and `Admin` have broader operational write access than `Paravet`. Paravets may only use explicitly permitted read datasets and must remain scoped to their assigned barangay. Do not broaden the `PARAVET_READ_DATASETS` policy or infer access from route visibility; pair any requested policy change with Module A and the integration owner.

## Critical distinction: dashboard data versus normalized registry

This module's familiar `owners`/`pets` dashboard records are currently JSONB dashboard rows. Module C's census workflow instead stores submissions and related data in normalized census tables, then applies Admin/SuperAdmin owner decisions to normalized `registry_owners`/`registry_pets`. A shared label does not mean the two stores have the same fields, IDs, validation, ownership, or source of truth.

Do not:

- write approved census records directly to `dashboard_records` to avoid review;
- silently switch an existing screen or endpoint between JSONB and normalized tables;
- create duplicate owner/pet APIs or schema migrations without coordination;
- assume a public pre-listing is an approved registry record;
- use sample/demo data as live or audited clinic data.

If the requested task requires the JSONB and normalized registry to converge, document the migration/import/backfill and compatibility plan first; do not infer that the conversion is part of ordinary CRUD work.

## UI and API integration

The existing React pages consume the shared `src/lib/api.ts`; preserve loading, error, pagination, filter, sort, archive, import/undo, and export semantics used by current callers. The verified-user prelisting page is `/prelistings/new`; its submission schema, ID-verification prerequisite, and user role are distinct from the staff review list at `/prelistings`. Validate imported files before submission and show field-specific failures without silently dropping invalid rows. Maintain stable IDs and consistent dates/mobile representations across list, editor, CSV, report, and API payloads.

When a page is added or its URL changes, propose the matching capability, navigation entry, `BUILT` mapping, dispatcher handler, and tests together. Do not insert independently conflicting full copies of shared routing files.

## Ready-to-paste contributor prompt

```text
You are the Module B contributor for CityVet e-Kapon. Work only in `Modules/local-test-copy`, not the repository-root app or sibling snapshots. Your assignment is the existing registry/operational data domain: dashboard records, barangay references, verified-user pre-listings, operational data, and assigned import/export/undo behavior.

Read `docs/modules/Integration Guide.md` and this Module B brief first. Verify the current source contract in `server/dashboard.ts`, `api-handlers/v1/records/**`, the relevant API handlers, route table, migrations, and tests before editing. Follow established TypeScript/React, Zod, SQL, CSV, and Vitest patterns; do not add dependencies or duplicate API/database abstractions.

Treat the server-side dataset allowlist as the only accepted dashboard dataset vocabulary: owners, pets, paravets, respondents, households, animals, stubs, services, programs, participants. These records use the existing JSONB `dashboard_records` persistence bridge, with stable `id`s, validated batches, bounded record size, normalized mobile/date values, and existing archive/import/undo semantics. Never interpolate user-controlled dataset, sort, table, or column strings into SQL.

Preserve the distinction between JSONB dashboard rows, normalized `registry_owners`/`registry_pets` used by the reviewed census workflow, pending census submissions, and verified-user pre-listings. Pre-listing intake is restricted to active authenticated Users with an approved ID; staff review is separate from the User submit screen. Do not bypass Module C's submission/review process or silently migrate a UI from one store to another. Never use synthetic/demo rows as live records. If the feature requires changing this boundary, stop and provide an explicit compatibility/migration proposal for the integration owner.

Enforce access on the server. Admin/SuperAdmin operational writes and Paravet read/barangay restrictions are separate rules; do not broaden Paravet access or trust an actor/barangay/dataset supplied by the browser. Reuse the shared API client and server auth/db/transaction/error helpers. Keep the route method, body, output, errors, UI state, and tests consistent.

Make only the requested Module B change. Do not implement authentication/accounts, census review, analytics, or hosting work. Do not edit `db/007_operations.sql`, schema snapshots, `src/App.tsx`, `src/nav/nav.ts`, `shared/permissions.ts`, or `server/api-dispatch.ts` unilaterally. If one is needed, send the integration owner a focused proposed diff and the exact endpoint/capability/schema reason. Do not access staging/production and do not read/copy `.env.local`.

Add/update tests covering the changed domain contract, including validation, role/barangay boundaries, and failure cases as applicable. Check no generated files, database directories, credentials, or unrelated worktree changes are included. Run `npm run typecheck`, `npm test`, and `npm run build` from `Modules/local-test-copy` as relevant, and report actual results.

Return a merge handoff with changed files, API and record shape changes, persistence source, permissions, shared-file proposals, migrations/setup, tests run, and known limitations. If requirements leave a data ownership, merge, delete, or privacy behavior ambiguous, ask the project owner rather than inventing a default.
```
