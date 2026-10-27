# API v1 — inbox, dashboard counts, and feedback

> **Status (2026-10-27): historical record.** Written before e-Vet Field (Salin) was connected on 2026-10-24. Roles, names, stubs and sign-in have changed since; see [what changed](README.md#what-changed-since-the-phase-records-below). Where this differs from the code, the code is right.

This document describes notification state changes, dashboard count badges, and the matching interface behavior in `local-test-copy`. The API is available through the normal `/api/v1` dispatcher and uses the common authentication, origin-validation, and error-response rules.

## Notifications

Notifications belong to the authenticated account. Every read, archive, and restore operation scopes the row by the server-side session ID; callers cannot select another recipient.

| Method & path | Who | Contract |
|---|---|---|
| `GET /notifications?view=unread\|read\|archived\|all` | SuperAdmin, Admin, Paravet, User | Returns up to 200 notifications for the caller, newest first, with `unread`, `read`, and `archived` counts. Read/unread views exclude archived notifications. `all` includes archived rows. |
| `PATCH /notifications` | SuperAdmin, Admin, Paravet, User | `{action:"read",id}`, `{action:"read-all"}`, `{action:"archive",id}`, or `{action:"restore",id}`. Archiving also marks a notification read. Restore removes the archive timestamp but leaves its read state unchanged. The response's `updated` count is zero when the row is absent or not eligible for that transition. |

`notifications.archived_at` is additive. Fresh local schemas include it in `db/007_operations.sql`; existing local schemas are upgraded with idempotent `db/009_notification_archive.sql`. Existing Supabase projects must apply migration 009 after the operations schema exists and before deploying the inbox archive UI. The migration grants the API role update access only to the `read_at` and `archived_at` columns.

The Inbox separates unread, read, and archived items. Opening an unread message marks it read. The detail view offers its related-page action when the stored destination is an internal absolute path beginning with `/` and not `//`; external destinations are never followed. Archive and restore preserve notifications rather than deleting them.

## Dashboard counts

| Method & path | Who | Contract |
|---|---|---|
| `GET /dashboard/counts` | SuperAdmin, Admin, Paravet, User | Returns `{counts}` keyed by visible navigation node ID. Record totals exclude archived dashboard records. Admin and SuperAdmin totals are city-wide; Paravet dashboard-record totals are restricted to the assigned barangay. User accounts receive no staff record totals. |

Dataset keys (`owners`, `pets`, `paravets`, `respondents`, `households`, `animals`, `stubs`, `services`, `programs`, `participants`) count active `dashboard_records`. `accounts` counts active accounts available in the caller's scope; Admin totals exclude Admin and SuperAdmin accounts. `prelistings` counts service pre-listings and `id-verification` counts submissions visible to the staff dashboard. Census keys report submission states, the caller's own submission count (`census-submit`/`census-mine`), CSV-origin submissions in scope (`census-import`), and accessible barangays for the summary/front-page nodes. `census-review` reflects pending submissions; `program-day` reflects program records.

The badge is a contextual count of associated items, not a claim that the linked page displays exactly that many rows; for example, a census summary badge counts accessible barangays. The UI displays request failures and a loading state rather than silently treating an unavailable count response as a verified zero.

## Global navigation and operation feedback

- Shared modal headers provide a back/close action using the modal's existing close callback. The authenticated app shell provides browser-history back navigation on non-dashboard pages.
- Mutating API requests dispatch global start/end/success events. The app shell uses them for pending-operation feedback and a short top-right confirmation; existing API errors remain explicit error feedback. Do not emit success for failed requests.
- The Return to Top control appears after the main content pane is scrolled beyond its threshold and scrolls that pane, not the whole document.
- Dashboard navigation cards place their count badges at the right edge; the calendar is embedded beside the welcome/navigation area at wide breakpoints, with Recently Added centered below.
- Census barangay search accepts exact case-insensitive matches from the existing barangay list only. Invalid free text is not sent to the summary endpoint; the summary prompts the user to select or search for a barangay before presenting a result.
- Calendar events link to the matching program record using `/programs?recordId={id}`. If a record ID cannot be resolved by the records page, the user must be shown the normal empty/not-found state rather than unrelated program details.

## Verification

The targeted API behavior is covered by `tests/operations-workflows.test.ts` and endpoint registration by `tests/api-dispatch.test.ts`. Run `npm test`, `npm run typecheck`, and `npm run build` from this module before changing the notification schema or dashboard count contract.
