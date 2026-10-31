# e-Vet Admin

**The office dashboard and API of the City Veterinary Office, City of San Jose del Monte, Bulacan.**

e-Vet Admin is where City Vet staff review and approve census submissions, keep the owner and pet registry, run vaccination, Kapon and microchipping programs, manage Paravet accounts, and report. It is also the API that the Paravets' offline phone app, **[e-Vet Field](https://github.com/eeun4176/e-Vet-Field)**, signs in to and sends its records to.

Code name **e-Kapon** (code and database names keep it: package `ekapon`, schema `ekapon`).

| | |
|---|---|
| **Live site** | https://admin-evetsjdm.vercel.app |
| **Who signs in** | City Vet staff (**Admin**, stored as `SuperAdmin`). Paravets sign in only to e-Vet Field. |
| **Hosting** | Vercel (dashboard and one serverless API function, region `sin1`) and Supabase PostgreSQL |
| **Deploys** | Automatically on every push to `main` |

## Features

- **Dashboard:** what needs attention today (pending reviews, requests, stubs, issues), current and upcoming programs, recent updates.
- **Registry:** owners, pets and program participants, with search, filters, history and edits.
- **Census:** review submissions from e-Vet Field (approve publishes them to the Registry; reject needs a reason), staff entry and import, and the official census summary and front page.
- **Field operations:** programs with interest, stubs and attendance; program day; barangay program requests (review, approve, merge, schedule); stub batches; service records.
- **Paravets and barangays:** create Paravet accounts with a one-time temporary password, reassign, deactivate and restore; the 62 barangays and their active Paravets.
- **Insights:** KPI analytics with formulas and charts, program outcomes, registry statistics, the Spay and Neuter monthly workbook, filtered reports, and duplicate checks. Export to CSV, Excel, PDF or PNG.
- **Data:** Excel/CSV import (up to 8 MB / 10,000 rows) with column matching, review before saving, and Undo of the last import; export of any record type.
- **System:** audit log, time-limited access grants, issue reports, notifications, English and Filipino, light and dark theme.

## How it works

```text
e-Vet Field (phones) ──HTTPS + Bearer token──┐
                                             ▼
Dashboard (React) ──cookie session──▶  /api/v1 (one Vercel function)  ──▶  Supabase Postgres (schema ekapon)
                                                                      ──▶  Supabase Storage (private bucket)
```

- One function (`api/index.ts`) routes every `/api/v1/*` path to its handler in `api-handlers/v1/`.
- Staff use an `HttpOnly` cookie session; e-Vet Field uses a Bearer token, allowed only from the origins in `ALLOWED_ORIGINS`.
- The API reaches the database through a restricted role (`ekapon_api`). Passwords are stored only as bcrypt hashes, and every request re-checks the account.

## Getting started

Requires Node.js 24.x (the Vercel runtime).

```powershell
npm ci
npm run db:setup-local   # once: prepare the local database
npm run dev:test         # dashboard on http://localhost:5175, API on :3000, local database on :5433
```

Local work uses a local PostgreSQL-compatible database (PGlite), never Supabase. API settings and the local database setup are in [README-BACKEND.md](./README-BACKEND.md).

| Command | What it does |
|---|---|
| `npm run dev:test` | Dashboard, API and local database together |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check (don't use `tsc -b`: it writes `.js` files beside the sources) |
| `npm test` | Test suite on a disposable local database |
| `npm run hosting:check` | Check that the hosting SQL matches the migrations and `vercel.json` is set up |

## Deployment

1. **Database:** for a new Supabase project, follow [hosting/README.md](./hosting/README.md) (fresh schema through migration 032, restricted API role, private Storage, one Admin account). For an existing database, apply only the numbered migrations in [`db/`](./db/README.md) it lacks, after a backup.
2. **Vercel:** root directory `.`; `vercel.json` sets the build, rewrites and the daily maintenance cron.
3. **Server variables** (Vercel → Settings → Environment Variables, Production): `DATABASE_URL` (Supabase transaction pooler), `JWT_SECRET`, `CRON_SECRET`, `ALLOWED_ORIGINS` (the e-Vet Field site), `GMAIL_USER`, `GMAIL_APP_PASSWORD`, and optionally `SESSION_HOURS` and `SALIN_SESSION_DAYS`. Details are in [README-BACKEND.md](./README-BACKEND.md).

Never put secrets in `VITE_*` variables, in the repository, or in browser code.

## Documentation

| Document | What |
|---|---|
| [README-BACKEND.md](./README-BACKEND.md) | Backend setup: Vercel, Supabase, environment variables, security |
| [hosting/README.md](./hosting/README.md) | SQL for a new Supabase project, including clearing test records |
| [db/README.md](./db/README.md) | Numbered migrations and how to apply them |
| [docs/README.md](./docs/README.md) | Index of this repository's documents |
| [docs/QR-STUB-WORKFLOW.md](./docs/QR-STUB-WORKFLOW.md) | Stubs and attendance from blank stub to program day |

Documents shared by both apps (system guide, architecture, API integration, design system, limitations) are in the [e-Vet Field repository's `docs/` folder](https://github.com/eeun4176/e-Vet-Field/tree/main/docs).

## Stack

React 18, TypeScript, Vite, Tailwind CSS, React Router, lucide-react; Vercel serverless functions (Node 24); Supabase PostgreSQL (`postgres` driver) and Storage; zod, jose (JWT), pgcrypto/bcrypt, ExcelJS, nodemailer. Tests: Vitest on PGlite.

---

Built for the City Veterinary Office, City of San Jose del Monte, Bulacan.
