# Vercel Hobby + Supabase Free hosting package

Prepared **October 20, 2026** for repository [Reiiimr/congenial-parakeet](https://github.com/Reiiimr/congenial-parakeet) and the existing Vercel site [congenial-parakeet-tan.vercel.app](https://congenial-parakeet-tan.vercel.app/login). This is a preparation package. Nothing has been pushed, deployed, provisioned or applied to Supabase. The remote repository layout and private Supabase project have not been inspected.

The hosted installation starts with **zero owners, pets, census submissions, programs, service records, Paravets or sample accounts**. It contains the official 62 barangays and system/reference definitions. One real SuperAdmin is created separately with values chosen by the operator. Local synthetic records, database files, photos and before-change snapshots are not copied.

## 1. Choose an empty database without erasing an existing project

In the intended Supabase project, run [00-inspect-existing-project.sql](00-inspect-existing-project.sql). It is read only. If `existing_ekapon_install` is true, or `ekapon_api` already exists, stop the fresh-install path. Preserve that project and its backups; use a separate empty Supabase project for the clean installation. Do not delete data to make the installer pass. Other `public` tables also need ownership review before choosing the project. Planner row estimates are not a full data inventory.

Keep `ekapon` out of the exposed Data API schemas. Do not expose the database or its functions to the browser. Existing authentication stays in the application's signed, secure, HttpOnly session cookie; this preparation does not migrate accounts to Supabase Auth.

## 2. Install the current empty schema

Run the complete [01-fresh-schema.sql](01-fresh-schema.sql) in one SQL Editor request as the project owner. It includes the current schema through migration **024**, removes the legacy default staff seed from the generated installation, creates the API role with **NOLOGIN**, and records source hashes in `ekapon.schema_migrations`.

The script refuses any existing `ekapon` schema or API role and rolls back on failure. It declares the full account-status enum upfront, so the legacy migration 007 enum change does not require a separate request in this fresh bundle. **Do not also run the numbered legacy SQL files**, the Prisma snapshot, `final_supabase_schema.sql`, local setup, or reference seeding against this database.

The bundle is generated from checked-in migrations, never exported from the local database:

```powershell
npm run hosting:schema
npm run hosting:check
```

## 3. Create the API login and first SuperAdmin

Open [02-configure-access.sql](02-configure-access.sql) in a private SQL Editor request. Replace its five placeholders there, using the real administrator's chosen username/name and distinct strong API/admin passwords. Run once. Do not save the edited script in the repository or share its contents. The template refuses unchanged placeholders and an existing account population.

The API password must be at least 32 characters. The administrator password must be 16–72 ASCII characters with letters and numbers. Use a password manager or independently generated random values. There is no public setup endpoint and no default hosted username/password.

After deployment, sign in with this SuperAdmin and create Admin and Paravet accounts through **Accounts**. Assign each Paravet to one official barangay. Provide first-sign-in credentials privately through the existing workflow. Retained local accounts and passwords are not transferred. Staff account recovery is an owner-operated database procedure; arrange administrator access before launch.

## 4. Prepare private uploads

Run [03-private-storage.sql](03-private-storage.sql) in the SQL Editor. It creates `ekapon-private`, a private bucket restricted to JPEG/PNG/WebP/PDF, with a 3 MB maximum object size. It refuses an existing bucket or unreviewed Storage policies, rather than silently changing access.

The browser calls the application's existing API. The API verifies the account and the owning record's role/barangay scope before reading files. A server-only Supabase secret key accesses Storage through the apikey header; no publishable/anonymous key or broad Storage policy is needed by this application. Never expose the secret as a `VITE_*` variable. Use a dedicated project where possible because the server secret can bypass Storage RLS.

Hosted profile photos, census sheet photos and uploaded stub PDFs use Storage. PostgreSQL retains opaque file references and metadata. Existing inline files remain readable in upgraded local databases; they are not automatically moved or uploaded. Local development/tests default to inline storage and need no Supabase keys.

Limits are: profile photo 2 MB; census photo 500 KB, six per submission; stub PDF 3 MB; monthly workbook 3 MB. Structured dataset files are parsed in the browser up to 8 MB and sent in bounded JSON batches of up to 100 records / approximately 2 MB. A single oversized record is rejected before any import writes.

Daily maintenance removes expired census attachments, then deletes unreferenced Storage objects in bounded batches (up to 50 per invocation) after a one-hour grace period. A photo shared by a resubmission is retained while referenced. Failed uploads/database writes leave cleanup metadata, rather than losing track of orphaned objects. A failed provider deletion is retried on a later maintenance run. Stubs/profile files remain until replaced/unlinked; the organization's final retention schedule is still required.

## 5. Configure the existing Vercel project

Use the files from this application, not the older static application or `Backup Files`. The generated source package puts `package.json`, `vercel.json`, `api/`, `server/` and `src/` at the repository root. For that layout set **Root Directory = `.`** in Vercel. If the GitHub repository instead retains the full monorepo layout, set **Root Directory = `Modules/local-test-copy`**. Do not assume the current remote layout; inspect it before publishing.

| Setting | Prepared value |
|---|---|
| Repository | `Reiiimr/congenial-parakeet` |
| Framework | Vite |
| Node.js | 24.x |
| Install | `npm ci` |
| Build | `npm run build` |
| Output | `dist` |
| API | One Node function at `api/index.ts`, all `/api/v1/*` routes dispatched internally |
| Function maximum duration | 60 seconds |
| Region | Singapore (`sin1`); change to the nearest supported region if Supabase is elsewhere |
| Maintenance cron | Once daily at 19:00 UTC / approximately 03:00–03:59 Asia/Manila (Hobby scheduling precision) |

The workbook logo is explicitly bundled with the API. SPA routing excludes API and asset paths. The build does not connect to a database, create accounts, run migrations, or seed records. Camera access remains available for same-origin attendance scanning.

Use [vercel-env.example.txt](vercel-env.example.txt) to enter **Production-only server variables**. Supabase project URLs/keys do not need to be shared in chat. Copy the exact **Transaction pooler** endpoint from Supabase's Connect dialog, port **6543**. Change the username to `ekapon_api.<project-ref>` and use the API-role password, URL-encoded. Do not guess the pooler hostname or use the `postgres` owner credentials in Vercel. The API disables prepared statements and uses one connection per warm instance.

Create `JWT_SECRET` and `CRON_SECRET` independently from each other, the database password and the Storage key. Each needs at least 32 random characters. The application and API share the same origin; `ALLOWED_ORIGINS` can remain empty. `NODE_ENV=production` is supplied by Vercel. Production requires the Supabase storage configuration and does not silently fall back to storing new files in PostgreSQL.

Do not connect Preview deployments to the operational database. Keep automatic deployments paused while preparing the existing project; configure a separate disposable Supabase project and secrets for Preview, or disable Preview until that exists. Select the intended production branch in the Vercel dashboard; no branch was assumed or changed here. A Git push to a connected production branch can trigger deployment, so publishing is a separate action.

## 6. Validate before publishing

Run [04-verify-install.sql](04-verify-install.sql). Expected: one Active SuperAdmin, zero operational records, 62 barangays, API login enabled without elevated flags, no API access to password hashes, private bucket. Verify `ekapon` is not exposed in Supabase API settings. Do not test against the operational database with `npm test`.

From the source project run:

```powershell
npm run hosting:check
npm run typecheck
npm test
npm run build
npm run hosting:package
```

The package command creates a new source folder under ignored `output/hosting/`, with an integrity manifest. It uses an explicit directory/file allowlist; it does not read `.env` files or copy the local database, user-supplied dataset, outputs, old static scripts or backup directories. Automated fixtures remain in `tests` for regression checks but are excluded from Vercel deployment. Packaging does not push to GitHub or call Vercel/Supabase.

On an isolated hosted preview, verify HTTPS sign-in/out, nested routes, empty records, account creation, Paravet assignment, census upload/read/access denial, stub PDF upload/printing, report exports, and cron authorization. Attempt cross-barangay file access and confirm denial. Check that a missing/wrong Storage key produces a clear error without saving a false file reference. Verify only one API function is built and that tests, fixtures and local records are absent from the deployment artifact.

## Free-tier fit and remaining launch decisions

Checked against official provider documentation on October 20, 2026:

- **Vercel Hobby:** personal, non-commercial use only; 4.5 MB request/response payload ceiling. This package uses one function, a 60-second duration and one daily cron. Confirm whether the intended City Veterinary Office use qualifies; this preparation is not a plan-eligibility decision. [Hobby plan](https://vercel.com/docs/plans/hobby), [Function limits](https://vercel.com/docs/functions/limitations), [Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).
- **Supabase Free:** 500 MB database, 1 GB Storage, 5 GB egress, inactivity pause after one week, no automatic backups or uptime SLA. Watch database/file/egress usage in the dashboard. Separate files from database data to avoid using the database quota for images. The cron is retention cleanup, not an availability promise or a keep-alive workaround. [Pricing](https://supabase.com/pricing), [Transaction pooler](https://supabase.com/docs/guides/database/connecting-to-postgres), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
- Keep a separately verified database **and Storage-object** backup/restore procedure. Application JSON export omits credentials, parts of the schema and uploaded files. Free-tier automatic recovery must not be assumed. Back up role setup securely and rehearse restoring into a separate project.
- The production dependency audit still reports **two moderate React Router advisories**. Their suggested fix requires a major version upgrade; it was not silently applied during hosting preparation. Review/resolve them with navigation regression checks before launch. See `VERIFICATION.md` for the exact advisory links and validation results.
- The existing account-existence timing behavior still needs the recorded security decision. Complete the official privacy contact, retention schedule and policy approval before loading real personal records. The Paravet agreement remains visibly labelled as a draft.

No remote schema or provider settings were verified. This package prepares a reviewable installation; it does not certify production launch or free-tier suitability for institutional use.
