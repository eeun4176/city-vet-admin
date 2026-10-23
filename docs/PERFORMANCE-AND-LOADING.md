# Performance and loading — local phase

For the newer canonical workflow benchmark and migration 022, see
[Daily workflow performance](./DAILY-WORKFLOW-PERFORMANCE.md). The measurements
below describe the earlier fixture and should not be combined with that comparison.

## Approved behavior

- Active program details, stub stock, and attendance refresh every 30 seconds
  while visible. Open/In progress programs on or before today qualify, provided
  attendance collection remains open. Future/inactive programs do not poll.
- Dashboard counts and report summaries may reuse results for up to 60 seconds.
  Last updated and Refresh controls show when displayed data was obtained.
  Refresh bypasses stored summaries; simultaneous requests may share a fresh
  calculation already in progress.
- Background refresh preserves displayed data and open forms. Initial reads
  retain loading indicators. Route loading keeps surrounding navigation.
- Hidden views pause polling and check whether an update is due on return.
  Detail views without an interval verify again on focus/visibility return.
- Saving and QR redemption continue to validate current server data. Reused
  totals are informational, never permission or capacity enforcement.

## Implementation

The browser shares identical concurrent GET requests and cancels abandoned
searches. Only selected summaries/reference lists are retained, in memory,
with a maximum of 64 entries. Individual records, QR lookups, custom report
snapshots, authentication, and permission decisions are not retained by this
query cache. Account, role, barangay, grants, and feature changes clear its
scope. Successful writes invalidate browser summaries. Cross-tab account
changes trigger re-verification without transmitting credentials between tabs.

Dashboard counts and analytics use a bounded, per-API-instance memory cache.
Authentication and current feature checks run before every server cache read.
Successful API writes invalidate summaries on that instance. Another instance
or external database writer can leave a summary stale until its 60-second
expiry; Refresh obtains a new calculation. Responses remain `no-store` for
HTTP caches. Data-age headers prevent browser/server cache layers from
extending the 60-second reuse window to 120 seconds. Late responses cannot
repopulate an invalidated cache.

Pages and API handlers load on demand. Workbook processing loads inside
authorized workbook operations. The calendar requests the displayed month and
returns only event fields. Report filter options omit unrelated owner/pet
lists when compact mode is requested. Shared dialogs now animate, trap
keyboard focus, restore focus on close, and let only the top dialog handle
Escape. Reduced-motion preferences are respected.

Migration **014**, after 013, adds partial indexes for owner names/barangays
and pet owner links. It does not merge identities or alter records. It has
been exercised only on disposable databases; it is not applied to Supabase
or the existing local database.

## Synthetic benchmark

Scale was unknown, so the starting baseline uses 10,000 owners, 20,000 pets,
50,000 services, 100 programs, and 10 simultaneous Admin sessions with citywide
access. Each session visits five views sequentially, for 50 requests. Normal
database constraints and audit triggers remain enabled.

| Measurement | Before | After |
|---|---:|---:|
| Initial main JavaScript, raw | 1,191.26 kB | 505.16 kB |
| Initial main JavaScript, estimated gzip | 227.89 kB | 142.25 kB |
| Calendar response body, raw | 28,190 B | 7,237 B |
| Mixed staff workload, median request | 889.97 ms | 148.02 ms |
| Mixed staff workload, 95th percentile request | 10,057.63 ms | 441.16 ms |
| First dashboard request | 67.03 ms | 77.98 ms |
| Fresh analytics calculation | approximately 1.08 s | approximately 1.01 s |

The main entry bundle is about 58% smaller raw, or 38% smaller compressed.
Other route bundles load when needed; these numbers do not represent total
application code. The build still reports a large-chunk advisory. Calendar
response bodies are about 74% smaller raw in this fixture.

The repeated mixed workload benefits from reused summaries and link indexes.
Fresh analytics still takes about one second and remains a candidate for
query-specific work. The first dashboard request did not improve. Dispatcher
import fell from 660.01 ms to 9.94 ms, but this shifts route initialization
to first use and is not a measurement of Vercel cold-start latency.

These are single local PGlite runs, with one API database connection causing
requests to queue. They do not establish Vercel/Supabase throughput, bandwidth,
or production latency. Gzip figures exclude headers/TLS and assume compression.
Artifacts: `output/performance/baseline.json` and `after.json`.

Reproduce after building with:

```text
npm run build
npm run benchmark:performance -- current
npm run typecheck
npm test
```

The benchmark creates an in-memory disposable database. It never loads `.env`
files or opens `.local-test-db`. This phase uses polling rather than realtime
subscriptions and does not add offline submission or persistent private-data
caching. No push, deployment, or live migration is part of this phase.

## Validation

Local build and type checks passed. All **112 tests across 17 files** passed,
including request cancellation/coalescing, scope invalidation, expiry, visible
refresh, current account/feature checks, compact month projection, and existing
program, QR, census, workbook, and account workflows.

The built browser review verified timestamps/manual refresh, active program
refresh preserving unsaved form input, and dialog close behavior. It also found
and corrected duplicate Reports section keys; repeated refresh retains one
evidence section and one report builder.
