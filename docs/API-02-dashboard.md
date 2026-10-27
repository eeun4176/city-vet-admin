# API v1 — Dashboard records and public pre-listing

> **Status (2026-10-27): historical record.** Written before e-Vet Field (Salin) was connected on 2026-10-24. Roles, names, stubs and sign-in have changed since; see [what changed](README.md#what-changed-since-the-phase-records-below). Where this differs from the code, the code is right.

> **Historical API snapshot.** The census and normalized registry workflow has evolved since this document was written. For current contracts, use [the Module B brief](./modules/Module%20B.md), [the Module C brief](./modules/Module%20C.md), and the [integration guide](./modules/Integration%20Guide.md), then verify source and tests. If this document conflicts with current code, the code and module guide take precedence.

All paths use `/api/v1`. Responses are JSON with the existing request-ID/error envelope. Dashboard writes require a signed-in account and a same-origin `Origin` header. The server validates dataset names, record identifiers, batch sizes and record size; user-supplied SQL identifiers are never accepted.

`SuperAdmin` and `Admin` have city-wide access to approved records. `Paravet` can read the owners/pets masterlist within their assigned barangay and submit census records for that barangay, but cannot create, replace, archive, or restore approved dashboard records. Census submissions stay pending until an `Admin` or `SuperAdmin` reviews them.

## Dashboard records

Supported dataset names: `owners`, `pets`, `paravets`, `respondents`, `households`, `animals`, `stubs`, `services`, `programs`, `participants`.

| Method & path | Purpose |
|---|---|
| `GET /records/{dataset}?page=1&pageSize=500&archived=false` | List active records. `archived=true` lists archived rows; `archived=all` lists both and includes `_archived`. Response: `{data,page,pageSize,total}` |
| `POST /records/{dataset}` | `SuperAdmin`/`Admin` only: upsert `{records:[{id,...fields}]}` (up to 100 rows/request). |
| `POST /records/{dataset}/archive` | `SuperAdmin`/`Admin` only: archive or restore `{ids:[...],archived:true\|false}`. |
| `POST /records/{dataset}/import` | `SuperAdmin`/`Admin`: apply `{batchId,label,records:[...]}` with a restore point. Paravet census-dataset imports instead append to a pending census submission; they do not touch approved records. |
| `POST /records/{dataset}/undo-import` | `SuperAdmin`/`Admin`: undo `{batchId}` if none of its records have changed. Paravets can remove only their own still-pending census submission. |
| `POST /census/submissions` | Paravet: submit `{submissionId,label,records:[{dataset,record}]}`. Datasets are limited to respondents, households, and animals; each record must match the assigned barangay. Repeated requests with the same UUID append/update records in the same pending form. |
| `GET /census/submissions?status=pending\|approved\|rejected\|all` | List the caller's own submissions for Paravets; city-wide list for Admin/SuperAdmin. |
| `GET /census/submissions/{id}` | Read submission details. Paravets can read only their own submissions. |
| `PUT /census/submissions/{id}` | Admin/SuperAdmin only: `{decision:"approve"\|"reject",note?}`. Approval atomically applies every record; matching record IDs are replaced. The review decision and reviewer are retained. |
| `GET /activity?page=1&pageSize=25&q=...&year=...&month=...&sort=time&dir=desc` | Search, filter, sort, and paginate staff activity entries. `pageSize` defaults to 25 and is capped at 500. Supported sort keys are `time`, `user`, and `action`. |
| `POST /activity` | Record `{action,detail?}` for the signed-in staff member. |
| `GET /analytics?source=live\|sample&year=2026` | Admin/SuperAdmin/Paravet read-only operational analytics. `source` defaults to `live`; sample mode is Admin/SuperAdmin-only. Live mode excludes `_sampleData=true` rows; sample mode includes only those rows. Paravet results remain barangay-scoped. Returns active pet/vaccine-record indicators, service/program/census counts, a 12-month calendar compared with the prior year, a trailing-three-month planning baseline when possible, and two rule-based recommendations. |

Analytics use `ekapon.dashboard_records` only. The monthly table compares each metric to the same month in the prior year and reports month-over-month changes for pet registrations and completed anti-rabies services; January compares with December of the prior year. The vaccine-record rate means “share of active pet records with at least one vaccine indicator,” not population coverage or proof of a current dose. Service completions require a supported `Completed` or `Attended` outcome. The current schema does not provide bite incidents, PEP, rabies outcomes, clinic consultations/capacity, shelter management, or inventory, so the analytics response explicitly omits these metrics. It also withholds low/medium/high risk classifications because no validated risk thresholds or epidemiological fields are available. Forecasts are simple planning averages, not epidemiological forecasts.

The Reports page visualizes pet-record counts against the prior year, monthly anti-rabies/Kapon/microchip completion counts, and a barangay-by-month heatmap of anti-rabies plus Kapon completions. Heatmap intensity represents recorded service volume only; it is not a disease-risk map. Visuals follow the selected source, and the sample/live disclosure must remain visible when sample records are shown.

### Barangay profiles and custom reports

`GET /reports?mode=options&source=live|sample` supplies the official barangay list and report-builder choices. Account and Paravet choices are restricted to active accounts; sample mode uses accounts explicitly tagged with the `Simulation` middle name. Pet options are limited to active `pets` dashboard records from the selected source.

`GET /reports?mode=barangay&barangayId={id}&source=live|sample` returns the barangay's ID, acronym/code, name, district and ZIP; active assigned Paravets; census submissions and their household/owner/pet counts; registry owner/pet totals; JSONB dashboard-record counts by dataset; service pre-listing totals; and ID-verification status counts. Sample mode lists only tagged Simulation Paravets and omits live-only service pre-listing and ID-verification data. It includes only explicitly marked sample dashboard records and submissions/registry rows linked to `SIMULATION ·` submissions; live mode excludes those records.

`GET /reports?mode=report&year=2026&source=live|sample&categories=overview,registry,pets,census,accounts,field-operations,prelistings&barangayId={id}&accountId={id}&petId={record-id}&paravetId={id}&title={title}` builds one printable report with a section for each requested category. Filters are optional; categories default to all supported sections. The report includes supported dashboard-record details (up to 300 rows per section), census submissions, applicable account/pre-listing information, and source/year metadata. Account and pet details are limited to report-relevant display fields; mobile numbers and credential data are not returned. Records without a valid supported date are not included in year-filtered dashboard sections. Unsupported domains and inferred metrics are not fabricated. Reports require `reports.view` and are restricted to Admin/SuperAdmin.

Selecting a barangay from the pet table or service heatmap opens its profile inline. Heatmap values remain service-volume counts, not epidemiological or disease-risk scores. Use the generated report's print action for a combined, sectioned document; the selected source badge is intentionally retained in the printed header.

Dashboard list filtering, sorting, CSV export, charts, and report views use the same UI record fields. Their durable source in live mode is `ekapon.dashboard_records`; the UI demo seed rows are not shown as real backend records.

The pending submission table is introduced by `db/005_census_submissions.sql`; `db/006_census_submitter_retention.sql` preserves submitter attribution while allowing account removal. It is a staging/review layer, not a normalized registry; reviewed records are applied to `dashboard_records` only through the Admin/SuperAdmin approval endpoint.

## Verified-user pre-listing

An authenticated `User` with an approved ID can submit a service request from `/prelistings/new`. The form accepts `{owner,mobile,barangay,program,pets:[{name,species,sex,age}]}`; the verified account ID is stored with the request, and the database rejects requests without a currently active verified User. The endpoint validates the selected barangay against the reference table and returns `{ref}`. Staff `SuperAdmin`/`Admin` sessions can search, filter, sort, and paginate submissions using `GET /prelistings?page=1&pageSize=25&q=...&year=...&month=...&sort=date&dir=desc`; Paravets only see submissions for their assigned barangay. `pageSize` defaults to 25 and is capped at 500. Supported sort keys are `date`, `owner`, `barangay`, and `program`.

The staff table screens use server-side pagination, so totals and filters cover the full matching result set rather than only rows already loaded in the browser. Clear filters resets search, date filters, sorting, and pagination to the default view.

These submissions contain personal information. If the intake is ever broadened to unauthenticated public use, enable Vercel WAF/rate limiting or CAPTCHA and define the office's retention/access policy first.

## SuperAdmin controls and database backup

| Method & path | Purpose |
|---|---|
| `GET /admin/controls` | Return current maintenance mode and feature access settings for the authenticated role. |
| `PUT /admin/controls` | SuperAdmin-only update of maintenance mode and Admin/Paravet feature availability. |
| `GET /admin/backup` | SuperAdmin-only JSON export of application records, accounts without credential hashes, barangays, pre-listings, audit history with credential-hash fields removed, and controls. |

The database export is intended for safekeeping and is not a restore endpoint. The pre-existing browser-local backup/restore utility remains separate and must not be used as a replacement for a Supabase database backup.

## Storage notes

Dashboard records currently use JSONB with a fixed server-side dataset allowlist because the local version's operational modules do not share the separate Prisma schema's field model. This is a persistence bridge, not a claim that all domain relationships or data validation are complete. Domain-specific relational schemas should replace it as those requirements are finalized.
