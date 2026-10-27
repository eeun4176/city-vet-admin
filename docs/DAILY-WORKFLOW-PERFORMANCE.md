# Daily workflow performance

> **Status (2026-10-27): historical record.** Written before e-Vet Field (Salin) was connected on 2026-10-24. Roles, names, stubs and sign-in have changed since; see [what changed](README.md#what-changed-since-the-phase-records-below). Where this differs from the code, the code is right.

Local phase completed on 2026-10-19. Priority: Dashboard, search, registry,
program attendance, and slower connections. No push, deployment, live migration,
or existing local database change was performed.

## What changed

### Smaller registry and picker lists

Owners/Pets now request `summary=true` for their paginated lists. The server
projects only list fields and relationship warnings, selecting the page before
building JSON and checking links. Owner picker lists also return compact fields.
Opening a record still fetches full permitted details, linked pets, and history.

Adding one or all visible registry rows to Report Basket uses one explicit,
current-access-checked batch read. It loads the full report fields rather than
turning the smaller list into an incomplete report. Loading feedback and disabled
buttons prevent repeat clicks. An account/scope change or intervening write
invalidates a late selection response. No additional private record cache is added.

Registry search reads named identity/contact/address/pet fields rather than casting
the entire stored JSON to text. Private images/credentials and arbitrary retained
import metadata cannot produce registry-search matches. Retained details remain
available when the record opens. `%`, `_`, and backslashes are treated literally.
Date filters remain available separately. Other datasets retain their existing
list contracts; compact mode is explicitly limited to owners and pets.

### Recent updates and global search

The source reader bounds each source before merging the global results. The
ordering, exact/prefix ranking, current/history rules, and hasMore behavior are
preserved; regression tests compare the result to the previous unbounded query
for Admin and Paravet access. Recent updates does not construct search text or
load unused name/pet aggregates just to find the newest records. Explicit metadata
fields leave internal search text out of the database-to-API response.

Migration **022**, after 021, prepares B-tree indexes for registry list/recent/area
ordering, attendance recent activity, standalone recent activity, and interest
person updates. No extension, identity change, data deletion, materialized search
copy, or new permissions are introduced. Indexes have storage and write-maintenance
costs; write throughput was not measured in this read-focused phase. The migration
has been applied only to fresh disposable databases, not Supabase or `.local-test-db`.

### Load program tabs when needed

Program overview no longer eagerly imports the Interest and Stub/Attendance
workspaces. Those modules load when their tabs open, with a visible loading
fallback. Existing timing controls, capacity warnings, refresh intervals, QR
validation, and attendance saves are unchanged. No claim is made that the main
entry bundle or every route became smaller; the large-bundle advisory remains.

## Benchmark method

`npm run benchmark:daily -- <label>` creates a fresh in-memory PGlite database and
never loads `.env.local` or opens the existing local database. Normal constraints
and audit triggers stay enabled. Synthetic records are inserted for read testing;
they do not measure API approval, creation, redemption, or write throughput.

The same fixture version was used before and after:

- 10,000 registry owners and 20,000 registry pets, with retained synthetic notes.
- 50,000 completed service projections: 30,000 procedures from 15,000 two-pet
  attendance visits, 15,000 standalone visits, and 5,000 older imported services.
  Managed projections are not counted again as independent canonical visits.
- 100 programs, 10,000 interest entries, and 6,200 QR stubs.
- 1,000 pending census sheets, 10,000 staged census owners, and 20,000 staged pets;
  these staging rows are separate from registry counts.
- Ten simultaneous staff journeys: five Admin and five barangay-scoped Paravets.
  Each performs twelve sequential reads, for 120 requests in the concurrent run.

Each individual read is repeated three times. Table times below are medians of
those three sequential trials. The script's per-read p95 is merely the largest of
three samples, not a reliable tail-latency estimate. Query plans are collected
after timing so they do not warm the measured reads. The local API has one database
connection, so concurrent requests queue; this is not hosted throughput evidence.

## Recorded local results

| Read | Before median | After median |
|---|---:|---:|
| Dashboard overview | 9.14 ms | 6.68 ms |
| Recent updates | 283.18 ms | 15.70 ms |
| Global owner search | 318.61 ms | 312.70 ms |
| Global pet search | 316.75 ms | 307.82 ms |
| Registry owner list | 25.61 ms | 8.15 ms |
| Registry owner search | 297.48 ms | 45.53 ms |
| Owner picker | 59.03 ms | 54.68 ms |
| Owner with linked pets | 29.64 ms | 14.65 ms |
| Program workspace | 8.98 ms | 8.20 ms |
| Attendance list and summary | 9.53 ms | 7.04 ms |
| Current QR lookup | 6.00 ms | 4.76 ms |
| Pending census list | 7.07 ms | 5.89 ms |

| Response | Raw body before → after | Estimated gzip before → after |
|---|---:|---:|
| Registry owner list | 39,603 → 5,239 B | 869 → 559 B |
| Registry owner search | 17,478 → 2,356 B | 513 → 356 B |
| Owner picker | 17,620 → 2,498 B | 504 → 347 B |

The registry list body is approximately 87% smaller raw and 36% smaller using
estimated gzip. Repetitive synthetic notes compress unusually well; these figures
do not represent a production bandwidth bill. Body measurements exclude headers,
TLS, static assets, and any actual CDN compression behavior.

The mixed concurrent run improved from **305.16 → 96.30 ms median** and
**2,110.30 → 1,655.94 ms p95**. First Dashboard requests were 71.56 and 64.39 ms;
they do not measure a Vercel cold start. Global search remains approximately
0.31 seconds per sequential read and received no material speed improvement.
Its remaining work includes scanning canonical snapshots and staged census text.
Smaller differences on other fast reads should not be treated as robust gains.

Actual final query plans confirm use of the new registry list/recent, attendance,
standalone, and interest ordering indexes. Intermediate query-only and profiling
runs are retained separately; the primary comparison uses:

- `output/performance/daily-before.json`
- `output/performance/daily-after-final.json`
- `output/performance/daily-after-final-plans.json`

The baseline was captured before this phase's query/index changes. Running the
script on the current code produces current measurements; it does not recreate
the earlier implementation automatically. The older `benchmark:performance`
script and its historical results remain separate from this current-workflow fixture.

## Verification and local trial

Build and type checks passed; **204 tests across 31 files passed** in fresh
disposable databases. New coverage includes list payload bounds, retained full
details/report fields, unknown and zero values, literal search, private-field
exclusions, current scope/feature/archive checks, reassignment, and equivalence
of bounded search/recent results with the previous query.

Built-browser checks covered compact Owners, full owner/linked-pet details,
bulk report selection and verified preview, lazy Interest/Stubs/Attendance tabs,
Dashboard Recent updates, and current versus historical search. No records were
created, approved, voided, archived, or redeemed during these browser checks.
Four synthetic owners were selected only in the temporary Report Basket.

The small practice preview remains at `http://127.0.0.1:5178/registry/owners`
through `npm run preview:registry`. It is separate from the large benchmark.
Try opening owner details, adding visible rows to Report Basket, previewing the
report, and switching program tabs. Screen evidence is in
`output/daily-performance-ready.png`.

## Remaining limits

Actual Vercel/Supabase latency, network conditions, connection-pool behavior,
serverless cold starts, large exports, workbook processing, and write overhead
remain unmeasured here. No production telemetry or live account data was accessed.
A separately authorized staging measurement is needed before making hosted speed
or cost claims. Broad global-search indexing should be chosen from hosted query
plans and real search patterns; this phase does not introduce a new search service.
