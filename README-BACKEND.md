# e-Kapon dashboard backend — setup (Vercel + Supabase)

Stack: React dashboard + Vercel serverless functions (`/api`, Node 24.x, TypeScript) + Supabase PostgreSQL. The dashboard and API deploy together. The current empty-install and private-file setup is [hosting/README.md](./hosting/README.md), including all SQL files and a server-variable template. It replaces the legacy fresh-install/default-account steps below. The admin handoff is [system-admin-ready](./system-admin-ready).

> For parallel module development, use the current [Module A–D reference pack](./docs/modules/README.md) and its [integration guide](./docs/modules/Integration%20Guide.md). Inbox lifecycle, dashboard count, and global feedback contracts are documented in [API-04](./docs/API-04-inbox-and-dashboard-feedback.md). The older API snapshots in `docs/API-01-auth-and-accounts.md` and `docs/API-02-dashboard.md` are not authoritative where they differ from current source and tests.
>
> For the analytics/reporting feature contract, see [API-05](./docs/API-05-reporting-and-census-review.md). Project decisions, implementation progress, and verification status are summarized in [PROJECT-PROGRESS](./docs/PROJECT-PROGRESS.md); notable changes are listed in the [changelog](./CHANGELOG.md).

## 1. Database (authorized administrator only)

For this hosting preparation, run the inspection, generated empty schema,
private one-time access setup and Storage setup in [hosting](./hosting/README.md).
Do not use legacy bootstrap accounts or run local reference seeding on Supabase.
Migration `024_private_file_storage.sql` is additive for reviewed existing
installations; it preserves inline files and adds private Storage references.

For a brand-new Supabase project, follow [db/README.md](./db/README.md)
exactly. It includes fresh-install migration order, the separate two-stage
`007_operations.sql` instructions, bootstrap-account password replacement,
and restricted database-role setup. For an existing database, inventory
applied migrations and follow only the applicable changes after a verified
backup; do not run the fresh schema over an existing install. Never run
migrations against production without a verified backup, confirmed target,
and administrator-approved migration window.

## 2. Vercel deployment

Create a Vercel project linked to the new private application repository. If the contents of this application folder are placed at that repository's root as described in [README.md](./README.md), set **Root Directory** to `.`. Let the checked-in `vercel.json` configure the Vite framework, `vite build` command, `dist` output directory, SPA/API rewrites, and daily maintenance cron. Use the repository lockfile (`npm ci`) and a Vercel-supported Node runtime matching the package's Node 20+ requirement. If deploying this folder from the existing monorepo instead, use `Modules/local-test-copy` as Root Directory.

Add environment variables to **Production**. Preview deployments must use a separate non-production database and secrets, or be disabled until that is available:

| Name | Value |
|---|---|
| `DATABASE_URL` | Supabase → Connect → **Transaction pooler** string (port 6543), with user `ekapon_api.<project-ref>` and your role password |
| `JWT_SECRET` | A unique random secret; generate with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `CRON_SECRET` | A different unique random secret, generated the same way; required by the maintenance endpoint |
| `ALLOWED_ORIGINS` | Optional; set only when a separate trusted site must call the API |
| `FILE_STORAGE_DRIVER` | `supabase` in production |
| `SUPABASE_URL` | Exact HTTPS project URL from Supabase |
| `SUPABASE_SECRET_KEY` | Server-only Storage secret key; never a `VITE_*` variable |
| `SUPABASE_STORAGE_BUCKET` | `ekapon-private`, created as a private bucket |

Do not put database passwords, `JWT_SECRET`, or `CRON_SECRET` in `VITE_*` variables or browser code. The app uses the server-side PostgreSQL API; do not configure a Supabase client in the browser or expose the Supabase `service_role` key. Pick a Vercel function region close to the Supabase database region. Verify the current Hobby/Free limits, project availability/pause behavior, function limits, cron behavior, and backup options in the provider dashboards before launch; free-tier terms and quotas can change.

## 3. Run the local React test copy
```
Set-Location 'Modules\local-test-copy'
npm install
npm run dev:test
```
Tests default to `postgres://ekapon_api:ekapon_api_test@localhost:5432/ekapon_test`; override with `TEST_DATABASE_URL`.

Never commit `.env.local` or paste database credentials into source files. Do not reuse production secrets in local or Preview environments.

`dev:test` initializes the ignored `.local-test-db` when needed, then starts PGlite (5433), the API (3000) and the UI (5175). Legacy mock simulation is no longer recreated. It uses fixed local settings and does not read `.env.local` or connect to hosted databases. Open http://127.0.0.1:5175/ and stop the stack before offline maintenance.

The local-only initial administrator is `localadmin` / `LocalTest!123` if setup creates it. Existing staff and Paravet accounts remain; mock staff access was archived. Paravet names requiring correction are listed in `output/local-data-replacement/PARAVET-CORRECTIONS.md`.

To load or reproduce the user-supplied synthetic reference dataset, stop the preview and run `npm run db:seed-reference`. It uses only the fixed `.local-test-db` folder, takes a native before-change snapshot and loads 500 owners, 864 pets, 1,518 service examples and 69 historical program examples for 2021-01-01–2026-09-26. All generated records have synthetic provenance; they never satisfy the decision report's predictive evidence gate. The snapshot contains local account data and must remain local; publication ignores exclude it.

Automated mock fixtures remain isolated in `tests/` and their helpers. The old interactive sample seeder is retired. See `docs/REDESIGN-IMPLEMENTATION.md` for the current reporting and intake contracts.


Account preferences (light/dark theme, language, error notice duration, and profile photo), record/account edit undo, Recently Added, and list filters are stored and served by the API. Apply migration `008_profile_preferences_undo.sql` before deploying these features. Record and import writes normalize Philippine mobile numbers and return field-specific validation messages for invalid contact numbers and dates. The login page includes show/hide controls for password fields.

`npm test` uses a disposable test database with the schema expected by the suite. Configure `TEST_DATABASE_URL` only with that test database.

Run `npm run typecheck` and `npm run build` from another terminal while `dev:test` is running. For the full integration suite against the included local database, stop `dev:test`, start `npm run db:local`, and in a second terminal run:

```powershell
$env:TEST_DATABASE_URL = 'postgres://postgres:postgres@127.0.0.1:5433/postgres'
npm test
Remove-Item Env:TEST_DATABASE_URL
```

Do not point the test suite at staging or production.

## Connected modules
- Staff sign-in, sessions, accounts and public barangay reference data use the existing `/api/v1` endpoints.
- The current dashboard's owners, pets, paravets, respondents, households, census animals, stubs, services, programs and participants use authenticated `/api/v1/records/{dataset}` endpoints. Admin/SuperAdmin create/import/archive/restore operations persist in PostgreSQL. Paravet census forms/imports are kept in `ekapon.census_submissions` pending Admin/SuperAdmin review and are applied to approved records only after approval.
- Verified `User` accounts can submit service pre-listings through `/api/v1/prelistings`; staff can review them through the dashboard. Submissions require an active account with an approved ID and are attributed to that account. Staff activity entries use the database audit log.
- The dashboard has `SuperAdmin`, `Admin`, `Paravet`, and `User` roles. SuperAdmin controls maintenance mode, feature availability for Admin/Paravet, account administration, and a server-generated database backup. Admin handles city-wide operational encoding and reporting. Paravets can submit census forms for their assigned barangay; they cannot directly mutate approved records. Users can manage their profile, verify ID, and request veterinary services.
- The SuperAdmin database backup downloads application records, accounts without credential hashes, barangays, pre-listings, audit history with credential-hash keys removed, and role/system controls as JSON. It is an export, not a database restore tool.
- The React dashboard at `/` uses the authenticated API for operational records and does not fall back to browser-local storage when the API is unavailable. Start it with `npm run dev:test` for isolated local work; do not use disconnected legacy static pages for clinic records.

## Security design (summary)
- Passwords and temporary passwords exist only as bcrypt hashes in the database; plaintext is shown once to the admin.
- Session = signed JWT in an `HttpOnly`, `SameSite=Strict`, `Secure` (production) cookie; the account is re-checked in the database on every request, so disabling, locking or archiving takes effect immediately.
- Temporary-password sign-in returns a restricted 10-minute cookie that can only be used to create the permanent password.
- Writes require a matching `Origin` (cross-site request blocking). Sign-in is limited per account (DB lockout) and per IP (`LOGIN_IP_MAX_FAILURES`, default 20 per 15 minutes).
- Every change is attributed in `audit_log` through `app.account_id` set per transaction.

## Role permissions and deployment note
- `db/004_dashboard_roles.sql` must be applied to an existing installation before deploying the redesigned dashboard. It is not safe to run against a new installation (the new account type names are already created by `db/000_ekapon_schema.sql`). The migration was not applied automatically.
- Paravet census submissions are scoped in the API using the signed-in account's barangay and checked against each submitted record. PostgreSQL row-level security is not configured; future normalized schemas should add database-enforced policies.
- Browser-native leave-site confirmation is used when a signed-in user attempts to leave; browsers do not permit a reliable custom close-tab modal.
- Live analytics use database-backed rows only. The trend compares the latest three months with the prior three months, while the simple next-month planning estimate is withheld until at least 10 dated live records across at least 3 months exist. The combined dataset count is an operational signal, not an audited KPI.

## Known limits (honest list)
- Unknown-account sign-ins skip the password hash, so response timing could reveal whether an account exists. Add a dummy hash check before production hardening.
- If pre-listing is ever broadened to unauthenticated public intake, configure Vercel WAF/rate limiting or CAPTCHA and establish personal-data retention/access practices before launch.
- Temporary passwords are shown to the admin; delivery by SMS/email is not built.
- Evolving dashboard operational rows use JSONB with an explicit dataset allowlist so the current UI can share durable data without pretending the unfinished Prisma model is active. Per-domain normalized models and row-level tenancy policies remain future work.
- Notification preferences, report selections, display/theme settings, and the existing restore workflow are still browser-local utility state; the standalone legacy `app.js` remains a separate local version. The new SuperAdmin JSON export is a separate database snapshot.
