# Hosting preparation verification

Date: October 20, 2026. Environment: Windows, Node 24.14.0, disposable local PGlite/PostgreSQL-compatible database. No `.env` contents or private cloud credentials were read. No remote database, Git push or deployment was used.

| Check | Result |
|---|---|
| `npm run hosting:schema` | Generated empty-install SQL and source-hash manifest from 21 migration sources, through 024 |
| `npm run hosting:check` | Passed: generated SQL matches sources; runtime/routing/cron configuration and local-data exclusions match the package contract |
| `npm run typecheck` | Passed |
| `npm test -- --silent` | **231 tests passed in 36 files** |
| `npm run build` | Passed; existing large shared/ExcelJS chunk warnings remain |
| Built frontend scan | No server key prefix, DATABASE_URL, JWT_SECRET, LOCAL_TEST_MODE or supplied dataset filename found |
| Dependency audit | Two moderate production advisories; no high/critical production advisories reported |
| Remote/hosted validation | Not performed; Supabase project and Vercel deployment artifact remain unverified |

New checks cover an atomic empty installation, absence of default accounts/operational data, one-time bootstrap refusal/success, restricted password-hash privileges, refusal to overwrite existing schemas, private bounded bucket creation, refusal of unreviewed Storage policies, UTF-8 request chunking, parsed Vercel body-size enforcement, required production storage configuration, and rejection of non-Supabase file destinations.

Storage integration checks use mocked provider responses and a real disposable local API/database. They cover private profile/census/PDF persistence, server-side role/barangay authorization before provider access, shared resubmission photo references, attachment byte metadata, sanitized provider failures and cleanup retry without deleting referenced files. They do not establish live Supabase connectivity, pooler TLS behavior, project quotas or actual Storage-key permissions. Those require the isolated hosted checks listed in README.md.

## Remaining dependency review

`npm audit --omit=dev --json` reports:

- [GHSA-wrjc-x8rr-h8h6](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6): React Router open redirect through backslashes in Link/useNavigate.
- [GHSA-337j-9hxr-rhxg](https://github.com/advisories/GHSA-337j-9hxr-rhxg): React Router SSR hydration constructor injection.

The affected packages are `react-router` and `react-router-dom`; the suggested installed-tree fix is React Router DOM 7.18.4, a major upgrade. This package retains the existing router and records the unresolved review rather than claiming a clean audit. SSR is not used by the current Vite SPA, but applicability and the upgrade/navigation checks still need review before launch. The existing account-existence timing issue and draft privacy contact/retention are also recorded in system-admin-ready.

## Installation and package integrity

`schema-manifest.json` hashes the generated SQL and its source migrations. The release source folder contains `PACKAGE-MANIFEST.json` with a SHA-256 for every packaged source file. The source allowlist excludes `.env` files, `.local-test-db`, supplied synthetic datasets, output artifacts, `tmp`, `Backup Files`, and legacy root static scripts. Fixtures required by regression tests remain inside excluded-from-deployment `tests`.

Do not treat selected-record JSON exports as complete recovery. Database schema/credentials and Storage objects require a separate verified backup and restore process. Never execute local test/seed scripts against hosted data.
