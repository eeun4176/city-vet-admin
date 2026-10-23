# Module integration guide

## Purpose and baseline

This guide keeps four independently developed workstreams mergeable. The target is only `Modules/local-test-copy`, a React 18 / TypeScript / Vite application with TypeScript API handlers, PostgreSQL SQL, and a local PGlite test stack. It is not the repository-root static application and is not either sibling snapshot.

Treat the selected copy's checked-in files as the baseline. Do not copy a newer-looking file from another branch, snapshot, archive, or working directory without comparing its API, role, and schema assumptions. Do not read or copy `.env.local`, `.env` files, database URLs, tokens, or credentials into prompts, commits, test fixtures, or documentation.

### Source-of-truth order

When references disagree, use this order:

1. Current code in `src/`, `api-handlers/`, `server/`, `shared/`, and the route table.
2. Current tests in `tests/` and the SQL migration/schema files that the local test setup actually loads.
3. These module briefs and the Integration Guide.
4. Older readmes, API notes, progress reports, and sibling/repository-root snapshots.

The older API notes remain for historical context; they are not permission to revive an obsolete route or payload. Correct the code and the module documentation together when an accepted contract changes.

## Runtime and local verification

Run commands from `Modules/local-test-copy`:

```powershell
npm run dev:test
npm run typecheck
npm test
npm run build
```

`dev:test` is the isolated local UI/API/PGlite stack. Use the test runner's disposable database by default. If a test specifically requires the persistent local PGlite server, follow the copy's `README-BACKEND.md` instructions and verify the database target before running it. Never point a test, migration, or seed script at staging or production. `npm run build` builds the frontend; it does not substitute for the typecheck or tests.

The app requires Node 20 or later. Use the checked-in lockfile (`npm ci` when dependencies need restoring); do not add or upgrade dependencies just to make one module easier to implement.

## Architecture and stable boundaries

| Area | Current responsibility |
|---|---|
| `src/App.tsx`, `src/nav/nav.ts` | Route/page composition, capability-gated navigation, and the deliberate pending-page fallback |
| `src/lib/api.ts`, `src/lib/auth.tsx` | Browser API/error events and signed-in client state |
| `shared/permissions.ts` | Shared role/capability/grant vocabulary, imported by client and server |
| `api/index.ts`, `server/api-dispatch.ts` | Vercel entry point and the explicit local/Vercel API route registry |
| `api-handlers/v1/**` | HTTP method handlers; use the existing `route`, validation, error, auth, and database helpers |
| `server/auth.ts`, `server/http.ts`, `server/db.ts` | Session and authorization enforcement, request/response conventions, and PostgreSQL access |
| `server/dashboard.ts`, `server/census.ts` | Dashboard-record and normalized census domain contracts |
| `db/*.sql` | PostgreSQL schema/migration history and local test schema |
| `tests/**` | Route, API, database, permission, and domain contract checks |

Do not add a second API client, auth provider, dispatcher, route registry, or database connection path. Keep browser requests on the existing `/api/v1` client and server requests on the existing helpers.

### Shared API behavior

- Register API endpoints in `server/api-dispatch.ts` as well as providing the handler file; a handler file alone is not a usable endpoint.
- Use the project's API route helper, Zod parsing, structured application errors, and shared database/transaction helpers. Keep SQL parameterized; never interpolate user-supplied table, column, sort, or dataset identifiers.
- Enforce authorization in every server handler. Hiding a button or route in React is UX, not access control.
- Preserve the shared session cookie flow (`ekapon_session`), same-origin write protections, error handling, and request logging.
- Browser API calls use `src/lib/api.ts`; consumers should handle rejected requests and should not invent success-shaped fallbacks.
- Add dispatcher tests when routes change. Route path, HTTP method, request body, response shape, status, role, and feature-switch behavior are one contract.

### Roles, grants, and feature switches

The role union is `SuperAdmin | Admin | Paravet | User`. Capabilities and optional grants are declared in `shared/permissions.ts`. The server resolves the account from the session and database on each request. `Paravet` data access is barangay-scoped where the domain requires it; the browser must never supply its own authoritative actor or barangay identity.

When adding or changing a capability, update the shared type/map, server enforcement, client gating, relevant API tests, and documentation as one coordinated change. Do not widen a role because a page needs access; define the narrow capability and obtain integration approval. A capability check does not replace data-row scope checks.

## Persistence contracts contributors must not conflate

There are two different operational-data models in this copy:

1. **Dashboard datasets** use `ekapon.dashboard_records` JSONB through `server/dashboard.ts` and `/api/v1/records/{dataset}`. The server-side dataset allowlist is `owners`, `pets`, `paravets`, `respondents`, `households`, `animals`, `stubs`, `services`, `programs`, and `participants`. Records require a stable `id`. They are an existing persistence bridge; they do not become normalized entities just because a UI uses similar labels.
2. **Census review and the approved owner/pet registry** use the normalized `ekapon.census_submissions`, `census_owners`, `census_pets`, `census_attachments`, `registry_owners`, and `registry_pets` tables and the `server/census.ts` workflow. Admin/SuperAdmin decisions are persisted per submitted owner; approval applies the decided changes transactionally. Do not implement census by writing directly to JSONB dashboard datasets or bypassing review.

The census schema is introduced/replaced by the numbered migrations, including `db/007_operations.sql`. That migration has explicit ordering and refuses to replace a census table that still has submissions; do not run it against a real database as part of parallel feature work. `db/final_supabase_schema.sql` is a deprecated partial schema snapshot and must not be run. Use the fresh-install order in `db/README.md` or the existing-install instructions in `README-BACKEND.md`.

Before changing a column, enum, table, function, grant, role, or migration, identify every API handler, local setup script, and test that depends on it. New database work must be additive, idempotent where appropriate, ordered, reviewed by the integration owner, represented in the local schema setup, and tested against a disposable local database. Never edit the established `db/007_operations.sql` in parallel; propose a subsequent migration instead.

## Four workstreams and dependency order

### Module A — platform, auth, accounts, preferences

Owns identity/session/account behavior and the stable role/capability contracts needed by the other modules. It is the proposed owner for changes to auth-specific shared code, but not a license to silently change the meaning of permissions for other modules.

### Module B — registry and operations

Owns the dashboard-record data surfaces, barangay references, public pre-listings, and operational record/import/export flows. It consumes Module A's session/capability contract and may not replace Module C's normalized census workflow.

### Module C — census

Owns Paravet capture/import/attachments, pending submissions, owner-level review decisions, approval/rejection/resubmission, and census summary/front-page behavior. It consumes Module A's auth model and coordinates with Module B if a feature displays or links registry data.

### Module D — insights and integration

Owns dashboard/analytics/read models, notification inbox, activity/audit and data-quality views, calendar integration, and the final composition of routes/navigation/feature flags. It consumes stable Module A–C APIs and must not bypass their authorization or persistence rules.

### Recommended merge sequence

1. Agree on a base commit and the shared contract changes before work starts.
2. Integrate Module A's accepted auth/capability additions first, if any.
3. Merge Module B and Module C independently against that contract; do not let both branches make competing edits to the same migration or dispatcher entry.
4. Integrate Module D after its consumers' response shapes and permission names have been frozen.
5. Run the complete local verification gate on the combined tree and resolve regressions before calling the merge ready.

The merge order is about dependency and conflict management, not a requirement that contributors wait to begin all independent UI work. Agree on mock fixtures/interfaces where an endpoint is still being implemented; replace mocks with the agreed API before integration.

## Shared-file ownership and merge protocol

These are collision-prone integration surfaces. A single integration owner should apply combined changes to them, using focused patches rather than accepting whole-file copies:

- `src/App.tsx`, `src/nav/nav.ts`
- `shared/permissions.ts`
- `server/api-dispatch.ts`
- `server/http.ts`, `server/auth.ts`, `server/db.ts`
- `db/007_operations.sql`, `db/final_supabase_schema.sql`, and future migration ordering
- `src/i18n/messages.ts` and shared i18n setup
- `package.json` and `package-lock.json`

Feature owners may propose a small diff to one of these files, but must state why it is needed, its public contract, its dependent changes/tests, and any behavior change. The integration owner resolves conflicting edits and applies one consistent result. No module may silently rename a route, dataset, capability, database object, shared type, or response field.

Each contributor should:

1. Work on a branch/worktree from the agreed baseline; avoid copying generated `dist/`, `node_modules/`, `.local-test-db/`, build output, or environment files.
2. Stay within its module's owned files; notify the integration owner before crossing a boundary.
3. Keep API handlers, UI consumers, role gates, schema, tests, and docs in the same change.
4. Return a concise merge handoff: changed files, endpoints/types/schema affected, required migration/setup steps, tests run, remaining known limits, and any shared-file diff that needs integration.
5. Never claim compatibility based only on a successful frontend build.

## Cross-module API and data rules

- Existing routes and schemas are the default. Extend them compatibly; do not create parallel endpoints for the same concept.
- Prefer additive optional response fields and backward-compatible request changes. If a breaking change is necessary, coordinate every caller and test in the same integration change.
- Validate all external input on the server, including query parameters and nested/batch data. Bound query sizes and request/record sizes.
- Use stable IDs and the existing serialization conventions. Dates are ISO `YYYY-MM-DD` where the domain uses a date; do not compare formatted display strings.
- Keep personal information, account identifiers, profile photos, submitted images, and audit content out of logs, sample output, and prompts unless a specific test safely uses synthetic data.
- Keep role scope server-enforced. Census Paravets submit only for their assigned barangay; staff review is not equivalent to permission to read credentials or unrelated private data.
- Do not add client-side Supabase access or expose service-role credentials. The current API is the server boundary.

## Vercel/Supabase deployment preparation

This copy is configured for one Vercel app/API with Supabase PostgreSQL. The repository-only preparation is documented in [system-admin-ready](../../system-admin-ready) and [README-BACKEND.md](../../README-BACKEND.md): Vercel's project root is `Modules/local-test-copy`; `vercel.json` owns the Vite build, SPA/API rewrites, and daily maintenance cron; and database access remains server-side through the restricted `ekapon_api` role.

This preparation did not provision cloud resources, apply remote migrations, or deploy. Before launch, an authorized administrator must verify the current provider quotas, database pause/availability behavior, function limits, backup and restore process, privacy requirements, and connection-pool behavior. No promise is made that a free plan will remain free or continuously available. The daily maintenance cron performs cleanup; it is not a keep-alive or an uptime guarantee. Avoid adding a paid dependency, external queue, object store, or long-running process without a separate decision.

Production approval remains blocked on the unresolved security and dependency items listed in [system-admin-ready](../../system-admin-ready), plus successful verification against the actual Vercel project and an isolated hosted test database. Do not deploy or migrate production as part of ordinary module work.

## Definition of done for a mergeable module

- Only intended source/docs are changed; no generated or secret files are included.
- The route is registered, validated, authenticated, authorized, and covered by a test when a route is added or changed.
- UI permissions and server authorization agree; user-facing errors are explicit.
- Schema and local test setup agree; migration steps are documented and safe to test locally.
- `npm run typecheck`, `npm test`, and `npm run build` pass in the combined local copy, or any pre-existing/environment failure is stated precisely with evidence.
- Module-specific and integration docs describe the final API, role boundaries, data source, and known limitations.

## Current hosting preparation (October 20, 2026)

The current empty-install bundle and handoff are in `hosting/README.md`. The generated schema includes migration 024 without default accounts or local records. Production uploads use private Supabase Storage through the existing API; only the server holds the Storage secret. There is still no browser Supabase client. The restricted PostgreSQL API role and API-level record/role/barangay authorization remain unchanged. Node is pinned to 24.x; each function uses one pooled database connection. The source package assumes application contents at repository root (`.`); monorepo deployment still uses `Modules/local-test-copy`. No remote change or publication is authorized by this preparation.
