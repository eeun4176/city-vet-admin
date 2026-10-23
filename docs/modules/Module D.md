# Module D — insights, notifications, and integration

## Mission

Own cross-domain read experiences and integration quality: dashboard/analytics, reports, data quality, activity/audit presentation, notification inbox, calendar-facing behavior, and final app composition. Consume Module A–C contracts; do not duplicate their persistence, auth, or write rules. Make the merged app coherent without taking over every feature's domain logic.

Start with the [Integration Guide](./Integration%20Guide.md). Confirm which routes and pages are actually implemented before extending them; the menu intentionally includes pending pages and is not a feature-completion checklist.

## Current surface and ownership

Primary implemented surfaces include:

- `src/pages/DashboardPage.tsx`, `src/pages/InsightsPages.tsx`, `src/pages/InboxPage.tsx`
- `api-handlers/v1/activity.ts`, `notifications.ts`, `calendar/events.ts`, `search.ts`, `recently-added.ts`
- `server/api-dispatch.ts` route integration, with coordination for all route table changes
- `tests/api-dispatch.test.ts` and focused tests for any changed report, notification, or aggregation contract

`App.tsx`, `src/nav/nav.ts`, `shared/permissions.ts`, `src/i18n/messages.ts`, and `server/api-dispatch.ts` are shared integration files. Module D should own the final merge composition only through the integration-owner workflow; Module A–C remain owners of their domain behavior.

## Current implemented versus incomplete surfaces

- `/dashboard`, `/reports`, `/data-quality`, and `/audit` have page mappings in `src/App.tsx`; check their source data and role capability before adding new metrics.
- `/inbox` is explicitly wired to `InboxPage`; its current notification API is recipient-scoped and supports marking one/all as read.
- `GET /api/v1/calendar/events` is dispatched, but the current route/navigation composition does not provide a dedicated calendar page. Treat calendar UI work as a new implementation, not an already working page.
- ID verification, temporary access, permission requests, and issue reports now have dispatched APIs and page mappings. Their current request/response shapes, role scope, and privacy constraints are documented in [API-03](../API-03-operations-workflows.md). Verify those contracts against handlers, SQL functions, and focused integration tests before extending them. Calendar still has a read API but no dedicated page.
- `GET /api/v1/activity` is the current activity data route. Confirm whether a requested audit requirement means this feed or a different audited event view; do not relabel incomplete activity data as a complete security audit.
- `GET /api/v1/analytics` and `/reports` provide live/sample-separated summaries of supported JSONB pet, service, program, and census activity. Live excludes synthetic rows; sample mode is restricted to Admin/SuperAdmin; Paravet live results are barangay-scoped. Vaccine flags are not population coverage, and rolling-average estimates are planning cues only. See [API-02](../API-02-dashboard.md) for exact definitions and unsupported metrics.
- Feature switches and permissions can hide a route; the server must still enforce access for the API.

Report outputs must identify their data source and limitations. Do not mix seeded/demo data with live counts, count pending census items as approved registry totals, or represent operational signals as audited KPIs. If an analysis uses sample/preview rows, label them visibly and keep them out of live totals.

## Data dependencies and compatibility

Consume the existing APIs rather than importing another module's internal database helpers:

- Module A provides authenticated account, locale, role, capability, and feature state.
- Module B provides operational/JSONB dashboard datasets and reference/operational endpoints.
- Module C provides submission state and approved normalized census reporting endpoints.

Prefer server-backed calculations for sensitive/high-volume analytics when the API contract already supports them; keep pagination, filters, date windows, time zone, and empty/error states explicit. Do not add cross-domain SQL that bypasses the owning handler's permission and scope assumptions.

Notifications are private to the authenticated recipient; reading or marking notifications must not accept a different recipient ID from the client. Activity/audit content must not expose credential hashes, session tokens, full private images, or unnecessary personal data. Any new chart/report must have a definition, source, date range, missing-data behavior, and testable aggregation contract.

## Integration responsibilities

Module D coordinates route/page assembly only after the functional API contracts are stable:

1. Confirm the page URL, capability, feature key, page component, handler methods, and data source with the owning module.
2. Apply the combined changes to `src/nav/nav.ts`, `src/App.tsx`, and `server/api-dispatch.ts` through one reviewed integration patch.
3. Ensure new pages are actually mapped rather than silently rendering `PendingPage`.
4. Add localization keys in the existing i18n structure; do not hard-code new language-specific UI text when the project already uses translations.
5. Add dispatcher/permission/page-contract tests and run the full merge gate.

Do not resolve merge conflicts by keeping whichever full file is newer. Merge the intended route entries, navigation nodes, capabilities, and imports deliberately, and verify deep links, capability denial, feature disabled behavior, loading, empty, error, and not-found states.

## Ready-to-paste contributor prompt

```text
You are the Module D contributor for CityVet e-Kapon. Work only in `Modules/local-test-copy`. Your assignment is dashboard/analytics/read experiences, reports, data quality, inbox/notifications, activity/audit presentation, calendar integration, and cross-module app composition. You consume Module A–C contracts; you do not own their identity, registry, or census write workflows.

Read `docs/modules/Integration Guide.md` and this Module D brief, then inspect `src/App.tsx`, `src/nav/nav.ts`, the actual handler registry, relevant pages/API handlers, capabilities, tests, and local schema. Distinguish shipped pages from pending placeholders. In particular, do not claim a calendar page exists just because a calendar API handler exists. ID verification/access/issues now have partial end-to-end workflows; consult API-03 and report any remaining limitations precisely.

For every metric or report, define its exact source, inclusion/exclusion rules, date range/time zone, filters, empty/error behavior, and permission. Keep pending, rejected, withdrawn, synthetic/sample, and approved/live data distinct. Do not label an operational estimate or incomplete activity feed as an audited KPI/security audit. Avoid cross-domain SQL or direct database writes that bypass the owning module's authenticated API, barangay scope, review, or privacy rules.

Use the existing API client, useApi/loading/error patterns, capability checks, and i18n system. Notification reads/updates must remain recipient-scoped from the session. Never accept a client-supplied recipient or actor ID. Do not expose sensitive account fields, credentials, tokens, attachment contents, or unnecessary PII in analytics, logs, or exports.

Coordinate `src/App.tsx`, `src/nav/nav.ts`, `server/api-dispatch.ts`, `shared/permissions.ts`, i18n message types, and schema changes with the integration owner. Route additions need the page mapping, nav/capability/feature behavior, handler registration, and dispatch tests in one integrated patch. Keep Module A–C as owners of their domain response and persistence shapes; request a stable API contract rather than duplicating it.

Make only the requested Module D change. Do not implement authentication/accounts, registry CRUD, or the census decision engine. Do not edit the established migration 007 or replace shared files wholesale. Do not access staging/production or inspect/copy `.env.local`. Deployment/provisioning and remote database work remain out of scope; preserve serverless-friendly bounded queries and avoid introducing paid services.

Add focused tests for aggregation rules, date/filter boundaries, role/capability denial, notification recipient privacy, route dispatch, and empty/error/loading behavior as applicable. Run `npm run typecheck`, `npm test`, and `npm run build` from `Modules/local-test-copy` as relevant. Check the combined integration—not just the page bundle—and report exact test outcomes.

Return a handoff with pages/routes/APIs changed, metric definitions and sources, capabilities/feature flags, shared-file integration diff, cross-module dependencies, tests run, known unsupported/pending surfaces, and migration/setup notes. If a metric definition, calendar workflow, audit meaning, or data visibility rule is unclear, ask the project owner instead of inventing it.
```
