# Module A — platform, authentication, accounts, and preferences

> **Status (2026-10-27): historical record.** Written before e-Vet Field (Salin) was connected on 2026-10-24. Roles, names, stubs and sign-in have changed since; see [what changed](../README.md#what-changed-since-the-phase-records-below). Where this differs from the code, the code is right.

## Mission

Deliver and maintain the shared identity foundation that the other three modules consume: sign-in/session lifecycle, account/profile management, role and capability vocabulary, account preferences, SuperAdmin controls, and safe shared API conventions. Keep account credentials and security enforcement on the server. This module does not own registry records or census submissions.

Read the [Integration Guide](./Integration%20Guide.md) first. It is the shared contract. The source files and tests listed below describe the current implementation; inspect their latest versions before changing behavior.

## Current surface and ownership

Primary files:

- `shared/permissions.ts`
- `server/auth.ts`, `server/config.ts`, `server/http.ts` (shared changes require integration-owner review)
- `api-handlers/v1/auth/**`, `api-handlers/v1/accounts/**`, `api-handlers/v1/admin/controls.ts`, `api-handlers/v1/admin/backup.ts`
- `src/lib/auth.tsx`, `src/lib/api.ts`, `src/pages/LoginPage.tsx`, `src/pages/AccountsPage.tsx`, `src/pages/SettingsPage.tsx`
- Auth/profile/preferences schema is in the established migration history; `db/008_profile_preferences_undo.sql` adds account preferences and edit undo. Do not rewrite earlier migrations to add feature fields.
- Primary tests: `tests/auth-accounts.test.ts`, plus dispatch, HTTP, and permission coverage where relevant.

The integration owner coordinates `App.tsx`, `nav.ts`, `server/api-dispatch.ts`, central capability changes, and shared database/schema snapshots. Module A may propose a focused diff there but must not merge a competing version of a shared file.

## Existing contract to preserve

### Roles and enforcement

The shared roles are `SuperAdmin`, `Admin`, `Paravet`, and `User`. Capabilities/grant names are typed in `shared/permissions.ts`. The client uses the same helper to hide or show controls; the API must independently enforce authorization with server-side session and capability/role checks. Grants are time-limited; barangay-scoped grants must be checked in the route that uses them.

`server/auth.ts` verifies the signed `ekapon_session` cookie and re-reads account status, role, barangay, locale, and active grants from the database on every request. A temporary-password/reset session has a restricted `reset` scope and must not be accepted as a normal `full` session. Preserve the existing cookie flags, same-origin write protection, login throttling/lock behavior, maintenance handling, and role feature switches.

Do not infer that a hidden navigation item is protected. Do not trust a role, account ID, grants list, or barangay ID supplied in a request body.

### API surface

The dispatcher registers the following auth/account/control families. Confirm the current handler contract and tests before altering them.

| Endpoint | Current purpose |
|---|---|
| `POST /api/v1/auth/login` | Start sign-in and establish the appropriate session |
| `POST /api/v1/auth/first-signin` | Verify a temporary credential and enter the restricted password-creation step |
| `POST /api/v1/auth/set-password` | Complete password setup/reset and establish the normal session |
| `POST /api/v1/auth/logout` | Clear the session cookie |
| `GET /api/v1/auth/me` | Return the current non-secret account/session view |
| `GET /api/v1/auth/profile`, `PATCH /api/v1/auth/profile` | Read/update the signed-in person's permitted profile fields |
| `PUT /api/v1/auth/preferences` | Write supported locale, theme, and error-notice preferences; current values are exposed through the signed-in account view |
| `GET`/`PUT`/`DELETE /api/v1/auth/photo` | Read, store, or remove the signed-in person's profile photo under handler validation |
| `/api/v1/accounts`, `/api/v1/accounts/{key}` | Staff account list/create/detail/update/delete behavior |
| `POST /api/v1/accounts/archive` | Batch account archive/restore |
| `POST /api/v1/accounts/{key}/reset-password` | Issue a temporary password through the existing one-time display flow |
| `POST /api/v1/accounts/{key-or-id}/renew-temp-password` | SuperAdmin/Admin (including migrated Encoder) can issue a one-time temporary password for a selected Paravet; this invalidates the current password and requires a new password at sign-in |
| `GET`/`PUT /api/v1/admin/controls` | Read/update maintenance and role feature-access controls, with server role checks |
| `GET /api/v1/admin/backup` | SuperAdmin-only sanitized application export; not a database restore endpoint |

The API's exact method/body/response/status is defined by each handler and test. Do not copy a legacy example payload when it differs from current code. Account output must not expose password hashes, temporary credentials, JWTs, or secret environment configuration.

### Client contract

`src/lib/auth.tsx` exposes account/session status, the signed-in account, `can(capability)`, feature checks, refresh/logout, and locale update. `src/lib/api.ts` is the browser transport and raises `ApiError`/application error events. Preserve loading/anonymous/maintenance handling, cookie-based same-origin requests, and explicit error notices. Avoid silently swallowing failures in new identity or account flows.

The `Account` view contains identity and display preferences used by the UI; it is not a database row type and must not grow secret fields. Profile photos are self-service JPEG/PNG/WebP images capped at 2 MB and are stored in the existing preferences row. Profile updates must not accidentally change role, account key, username, password, or barangay unless the relevant existing endpoint explicitly allows it.

## Compatibility rules for other modules

- Publish capability additions before Module B, C, or D consumes them. Agree on capability spelling and role matrix; do not duplicate the role map.
- Add API endpoints through the dispatcher integration owner and provide a focused route-dispatch test.
- When changing account/session response fields, find all client consumers (`useAuth`, shell, settings, pages, request guards) and preserve optional-field compatibility.
- Do not change a role's access as a side effect of adding a screen. Separate permission policy from UI composition.
- Do not combine an identity migration with domain migrations owned by another module. Propose an additive migration after the agreed baseline and document local/test update requirements.
- Module B/C/D must be able to use a session and capability contract without importing auth handler internals or querying credentials.

## Ready-to-paste contributor prompt

```text
You are the Module A contributor for CityVet e-Kapon. Work only in the React/Vite project `Modules/local-test-copy`; the repository-root app and sibling snapshots are not your target. Your assignment is limited to shared platform contracts, authentication/session behavior, roles/capabilities/grants, staff/portal accounts, profile, preferences, and SuperAdmin controls.

Before editing, read `docs/modules/Integration Guide.md` and this Module A brief. Inspect the current source, route dispatcher, SQL migrations, and tests; do not assume this brief replaces source-of-truth verification. Use the existing React/TypeScript, API handler, Zod, database, and Vitest patterns. Do not add a framework, dependency, alternate auth provider, client-side database access, or a second API client.

Keep security server-side: authenticate and authorize every protected handler, re-read account state through the existing auth helper, enforce same-origin writes and feature/maintenance rules, validate bodies/queries, and never trust actor identity or role from the browser. Preserve the `ekapon_session` cookie and the restricted temporary-password reset scope. Never expose credentials, hashes, tokens, connection strings, or private profile data in responses or logs. Do not weaken lockout, rate-limit, or account-status behavior to make a test pass.

Use `shared/permissions.ts` as the single capability/role vocabulary. A capability change must include the server enforcement, client gating, relevant account/role tests, and documentation. UI hiding alone is not protection. Keep the `Account` client view non-secret and preserve its callers. Do not alter permissions for Module B, C, or D without an explicit, narrow contract note and coordination with the integration owner.

The API is dispatched through `server/api-dispatch.ts`; a new handler file is not live until a coordinated route-table change is integrated. Shared files (`src/App.tsx`, `src/nav/nav.ts`, `server/api-dispatch.ts`, `server/auth.ts`, `server/http.ts`, `server/db.ts`, `shared/permissions.ts`, migration snapshots, package manifests) have a single integration owner. Return a focused proposed diff for these files rather than replacing whole files.

Make only the requested Module A change. Do not implement registry, census, reports, calendar, notifications, or deployment work. Do not edit the established `db/007_operations.sql`; any new schema must be an additive, reviewed migration and included in disposable local-test setup. Never connect to staging/production or inspect/copy `.env.local`.

Add or update focused tests for success, validation, unauthenticated/unauthorized cases, role boundaries, and failures affected by your change. Check that no secret/generated/database files are included. Run from `Modules/local-test-copy`: `npm run typecheck`, `npm test`, and `npm run build` as relevant, and report exact outcomes.

Finish with a merge handoff listing: behavior changed; endpoints/types/capabilities/schema affected; shared-file integration needed; tests and commands run; migration/setup notes; known limitations. If requirements would change a role policy, session behavior, or account data exposure and the correct behavior is not explicit, stop and ask the project owner rather than guessing.
```
