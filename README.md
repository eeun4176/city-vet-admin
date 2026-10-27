# e-Vet Admin (e-Kapon)

City Veterinary Office dashboard and API, shown to users as **e-Vet Admin**. It is the
office side of e-Vet: Paravets use the offline phone app **e-Vet Field**
(`salin` repository), which signs in here and sends its records to this API. How
the two connect is in `salin/docs/ARCHITECTURE.md`; this repository's documents
are listed in [docs/README.md](./docs/README.md).

This repository is designed for a
Vercel-hosted React/Vite frontend and serverless API backed by Supabase
PostgreSQL.

## New deployment

**Current deployment:** the app deploys to Vercel on every push to `main` of
`eeun4176/city-vet-admin`. Use [hosting/README.md](./hosting/README.md) for a new
Supabase project: an empty database through migration 032, private Supabase
Storage, one-time Admin setup, environment templates, query time limits and a
script to clear test records. For an existing database, apply only the numbered
migrations in `db/` it lacks, after a backup.

```powershell
npm run hosting:check
npm run hosting:package
```

The following older overview is retained for context. The current hosting
guide replaces its account/bootstrap and fresh-schema instructions.

1. Create a **private** GitHub repository for this application. Put the
   contents of this application folder at the repository root (including
   `package.json`, `package-lock.json`, `api/`, `api-handlers/`, `db/`, and
   `server/`). Do not copy `node_modules/`, `dist/`, `.local-test-db/`, or any
   `.env` file. Keep `.env.example`.
2. Create a new Supabase project. Follow the fresh-database sequence in
   [db/README.md](./db/README.md) exactly. It is the authoritative schema
   bootstrap guide; do not run the deprecated
   `db/final_supabase_schema.sql`.
3. Create a new Vercel project linked to the new private repository. Set the
   Root Directory to `.` and use the settings in
   [README-BACKEND.md](./README-BACKEND.md). Set Production environment
   variables only after the Supabase schema and restricted API role are ready.
4. Use [system-admin-ready](./system-admin-ready) to complete the pre-launch
   checks. Do not put credentials in GitHub, repository files, or `VITE_*`
   variables.

## Local development and verification

Use Node.js 24.x, matching the prepared Vercel runtime.

```powershell
npm ci
npm run dev:test
```

See [README-BACKEND.md](./README-BACKEND.md) for local test credentials,
database-backed test setup, API configuration, and Vercel deployment details.
Do not point local tests or migrations at a production database.

For parallel module development boundaries and contributor prompts, see the
[Module A–D documentation pack](./docs/modules/README.md).
# Local development and testing

Use Node.js 20 or newer and install the project dependencies with `npm install`.

- `npm test` starts a disposable local PostgreSQL-compatible database, applies the schema, runs the test suite, then shuts the database down. It does not use hosted Supabase data.
- `npm run dev:test` starts the interactive local app and API with the persistent local database. Run `npm run db:setup-local` once to prepare it.

The disposable test database is recreated for every `npm test` run. Do not put any data you need to keep in it.

