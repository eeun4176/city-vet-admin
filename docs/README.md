# e-Vet Admin documentation

e-Vet Admin (code name **e-Kapon**) is the City Veterinary Office's dashboard and API. Since 2026-10-24 it is connected to **e-Vet Field** (code name **Salin**), the offline phone app Paravets use. Last reviewed 2026-10-27.

## Current documents

| Document | What |
|---|---|
| [`../README.md`](../README.md) | What this repository is, and how to run it |
| [`../README-BACKEND.md`](../README-BACKEND.md) | Backend setup: Vercel, Supabase, environment variables, security |
| [`../hosting/README.md`](../hosting/README.md) | SQL files for a new Supabase project (01–08), including clearing test records |
| [`QR-STUB-WORKFLOW.md`](QR-STUB-WORKFLOW.md) | Stubs and attendance: blank stubs, encoding in e-Vet Field, program day |
| [`PROJECT-PROGRESS.md`](PROJECT-PROGRESS.md) | Progress log; its first section covers 2026-10-23 to 2026-10-27 |

Documents shared with e-Vet Field are kept in the `e-Vet-Field` repository's `docs/` folder (shown below by its folder name, `salin/`):

| Document | What |
|---|---|
| `salin/docs/E-VET_SYSTEM_GUIDE.md` | How to use both apps: accounts, roles, every page |
| `salin/docs/ARCHITECTURE.md` | How the two apps are built, connected and deployed |
| `salin/docs/ADMIN_INTEGRATION.md` | The API calls e-Vet Field makes, census sending, migrations 026–032 |
| `salin/docs/TECHNOLOGIES.md` | Technologies and AI models: purpose and why they fit |
| `salin/docs/LIMITATIONS.md` | What the system can't do |
| `salin/docs/DESIGN_SYSTEM.md` | Colours (including the `night-*` dark theme), type and components shared by both apps |
| `salin/docs/DEVELOPMENT_PLAN.md` | Phases, status and what's left before going live |

## What changed since the phase records below

The phase records in this folder were written between 2026-10-14 and 2026-10-19, before the e-Vet Field integration. Since then:

- **Names:** the app is shown as **e-Vet Admin**, with the City Vet seal; code and database names stay `e-Kapon` / `ekapon`.
- **Roles:** there is one staff role, shown as **Admin** and stored as `SuperAdmin` (migration 028), plus **Paravet**. Paravets sign in only to e-Vet Field; e-Vet Admin refuses them. Resident (`User`) accounts are retired: their sign-in is refused, and the pre-listing flow is no longer used.
- **e-Vet Field sign-in:** Bearer-token sessions (`SALIN_SESSION_DAYS`, default 14) alongside the staff cookie; CORS for the origins in `ALLOWED_ORIGINS`.
- **Shared program requests:** one request per barangay, built in e-Vet Field, which the office can merge with other barangays' requests (migration 026).
- **Blank stubs:** numbered blank stubs per barangay, printed in e-Vet Field once the barangay has requested owners, and encoded by the Paravet after hand-over; QR attendance scanned in e-Vet Field; present and absent (migration 027). See `QR-STUB-WORKFLOW.md`.
- **Census from e-Vet Field:** submissions carry a `requestId`, so a resend isn't counted twice (migration 029).
- **Passwords:** Paravets can reset their password with an emailed code (migrations 030–031); Admins can change their own username (032).
- **Analytics:** a KPI dashboard (`/program-kpis`) with formulas, column charts, reconciliation checks and CSV/Excel/PDF export.
- **Phone numbers:** 11 digits starting with 09, stored as plain digits, checked the same way in both apps.
- **Hosting:** deployed from `eeun4176/e-Vet-Admin` on Vercel (region `sin1`); up to 5 database connections per instance with reconnect after idle; database time limits (`hosting/07-query-timeouts.sql`); `hosting/08-clear-records.sql` empties test records.
- **Look:** the same colours as e-Vet Field in light and dark mode; status labels in sentence case without a dot.

## Historical phase records

These record decisions and checks made during each local phase. Each one begins with a status note. Where they differ from the current code, the code and the current documents above are right.

| Document | Phase |
|---|---|
| [`API-01-auth-and-accounts.md`](API-01-auth-and-accounts.md), [`API-02-dashboard.md`](API-02-dashboard.md), [`API-03-operations-workflows.md`](API-03-operations-workflows.md) | Early API snapshots |
| [`API-04-inbox-and-dashboard-feedback.md`](API-04-inbox-and-dashboard-feedback.md), [`API-05-reporting-and-census-review.md`](API-05-reporting-and-census-review.md) | Inbox, dashboard counts, reporting and census review contracts |
| [`ACCEPTANCE-TESTING.md`](ACCEPTANCE-TESTING.md) | Local acceptance checklist |
| [`CENSUS-IMPORT-AND-SEARCH.md`](CENSUS-IMPORT-AND-SEARCH.md), [`CENSUS-REVIEW-AND-APPROVAL.md`](CENSUS-REVIEW-AND-APPROVAL.md) | Census import, review and approval |
| [`DAILY-WORKFLOW-PERFORMANCE.md`](DAILY-WORKFLOW-PERFORMANCE.md), [`PERFORMANCE-AND-LOADING.md`](PERFORMANCE-AND-LOADING.md) | Performance |
| [`DASHBOARD-AND-SHARED-UI.md`](DASHBOARD-AND-SHARED-UI.md), [`REDESIGN-IMPLEMENTATION.md`](REDESIGN-IMPLEMENTATION.md), [`INSIGHTS-REDESIGN.md`](INSIGHTS-REDESIGN.md) | Dashboard, redesign and insights |
| [`FIELD-RECORD-CONSISTENCY.md`](FIELD-RECORD-CONSISTENCY.md), [`OWNER-PET-WORKSPACE.md`](OWNER-PET-WORKSPACE.md), [`OWNER-PET-DATA-STORES.txt`](OWNER-PET-DATA-STORES.txt) | Owner, pet and field records |
| [`NAVIGATION-BADGES.md`](NAVIGATION-BADGES.md), [`SEARCH-AND-NAVIGATION.md`](SEARCH-AND-NAVIGATION.md) | Navigation and search |
| [`PROGRAM-WORKSPACE.md`](PROGRAM-WORKSPACE.md) | Program workspace |
| [`RELEASE-READINESS.md`](RELEASE-READINESS.md), [`RESIDENT-CODE-INVENTORY.md`](RESIDENT-CODE-INVENTORY.md) | Release readiness, resident code |