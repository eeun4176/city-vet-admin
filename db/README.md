# Supabase schema setup

**Current hosting preparation:** use [hosting/README.md](../hosting/README.md)
and its generated [empty-install schema](../hosting/01-fresh-schema.sql).
That bundle includes migrations through **024**, excludes the legacy default
accounts, refuses existing installations and uses a separate private setup
template for the first SuperAdmin and API login. Do not run both the bundle
and the legacy sequence below. The legacy sequence remains the source/test
history and is not the recommended new hosted installation.

This guide is for a **brand-new Supabase project with an empty database**. The
numbered SQL files are the source of truth. Run them in the Supabase SQL Editor
in the order below; do not use the partial legacy snapshot
[`final_supabase_schema.sql`](./final_supabase_schema.sql).

## Fresh project: exact order

1. Run [`000_ekapon_schema.sql`](./000_ekapon_schema.sql). It creates the
   `ekapon` and `extensions` schemas, base auth/account/operations tables,
   helper functions, indexes, initial reference data, and bootstrap staff
   accounts.
2. Run [`001_create_api_role.sql`](./001_create_api_role.sql) **after replacing
   its placeholder password only in the SQL Editor**. This creates the
   restricted `ekapon_api` login used by the Vercel API. Do not commit a
   modified copy containing a real password. If the role already exists, this
   script does not rotate its password; rotate it explicitly in Supabase and
   update Vercel's `DATABASE_URL` together.
3. Run [`005_census_submissions.sql`](./005_census_submissions.sql), then
   [`006_census_submitter_retention.sql`](./006_census_submitter_retention.sql).
4. In [`007_operations.sql`](./007_operations.sql), select and run only the
   standalone statement under **PART 1** (`ALTER TYPE ... ADD VALUE`). Run it
   as its own SQL Editor request and wait for success.
5. In a separate SQL Editor request, run **PART 2** of `007_operations.sql`,
   beginning at `BEGIN;` and ending at `COMMIT;`. This intentionally replaces
   the empty census submission table created by 005/006. It aborts if that
   table contains submissions; never remove that safeguard or run this against
   a populated database as if it were a fresh install.
6. Run [`008_profile_preferences_undo.sql`](./008_profile_preferences_undo.sql),
   [`009_notification_archive.sql`](./009_notification_archive.sql), and
   [`010_reporting_workflows.sql`](./010_reporting_workflows.sql), in that
   order.
7. Run [`011_program_interest.sql`](./011_program_interest.sql). It clears
   stored ID image bytes while preserving verification history, retires the
   resident verification workflow, and creates the staff program-interest
   tables.
8. Run [`012_qr_stubs.sql`](./012_qr_stubs.sql). It adds staff stub batches,
   single-use QR tickets, program attendance, and their audit trail. It preserves
   the historical generic stub records.
9. Run [`013_program_workspace.sql`](./013_program_workspace.sql). It adds
   actual timing, version checks, and program history for the unified workspace.
10. Run [`014_read_performance_indexes.sql`](./014_read_performance_indexes.sql).
    It adds partial indexes for owner lookups and pet ownership links without
    changing or merging records.
11. Run [`015_data_quality_reviews.sql`](./015_data_quality_reviews.sql).
    It adds versioned duplicate-review decisions and reasoned activity history;
    registry records and pet relationships are preserved.
12. Run [`016_registry_workspace.sql`](./016_registry_workspace.sql) for reviewed
    owner/pet saves and record history.
13. Run [`017_census_registry_bridge.sql`](./017_census_registry_bridge.sql), then
    [`018_census_unknown_fields.sql`](./018_census_unknown_fields.sql), for stable
    census registry aliases, reversal snapshots, and unknown field values.
14. Run [`019_census_review_consistency.sql`](./019_census_review_consistency.sql)
    for reviewed match reasons, exact approval result IDs, and decision history.
15. Run [`020_navigation_badges.sql`](./020_navigation_badges.sql) for compact
    staff-change counters and account-specific seen state.
16. Run [`021_field_record_consistency.sql`](./021_field_record_consistency.sql)
    for reviewed standalone service snapshots and source-aware update markers.
    This migration is prepared and tested in disposable local setup only.
17. Run [`022_daily_read_indexes.sql`](./022_daily_read_indexes.sql) for measured
    registry, Recent updates, attendance, standalone-service, and interest reads.
    It adds indexes and preserves existing records. It has been tested only in
    disposable local databases.

18. Run `023_workflow_redesign.sql` after 022. It adds saved report drafts, policy acceptance, controlled breed references, verified intake links, shared-demand guards and Paravet directory synchronization. This change was applied only to the local test copy. Existing duplicate active requests must be resolved by staff; the migration preserves them and prevents new competing requests.

19. `024_private_file_storage.sql` follows 023. It adds private file metadata and
    references for profile photos, census photos and stub PDFs while retaining
    existing inline files. It does not upload or delete existing files. The
    hosted fresh-install bundle already includes it; do not apply it twice via
    separate setup paths. Supabase bucket setup remains a separate operator step.

`002_fix_verify_password.sql` is a repair migration for selected older
installations; `003_dashboard_records.sql` and `004_dashboard_roles.sql` are
for older existing installations. The fresh base schema already contains
those dashboard/role objects, so **do not run 002–004 on a fresh project**.

## Before connecting the application

1. In Supabase, keep the `ekapon` schema out of the exposed Data API schemas.
   The browser must not connect directly to the database. Do not expose
   `ekapon` or enable Data API access to its tables/functions without reviewed,
   tested database policies. PostgreSQL RLS is not currently configured for
   this application.
2. In the Supabase SQL Editor, replace the initial passwords for both
   bootstrap staff accounts before allowing access. Use two different strong
   secrets and do not put them in this repository. Example query shape:

   ```sql
   select ekapon.set_permanent_password(id, '<new-unique-admin-password>')
   from ekapon.accounts where username = 'admin';

   select ekapon.set_permanent_password(id, '<new-unique-encoder-password>')
   from ekapon.accounts where username = 'encoder';
   ```

   Confirm each statement updated exactly one account. Replace the example
   values with the actual secrets only in the Supabase SQL Editor.
3. Confirm the `ekapon_api` role can log in through the Supabase **transaction
   pooler** connection. Configure Vercel `DATABASE_URL` with that restricted
   role and pooler endpoint, not the `postgres` owner or Supabase
   `service_role` key.
4. Enable database SSL enforcement and protect Supabase/Vercel accounts with
   MFA. Review backups, restoration, network restrictions, data retention,
   access, and privacy requirements before loading real records.

## Existing installation

The Settings **Project data export** contains selected records and history; it is
not a complete database backup and has no application restore endpoint. It omits
credential tables, dedicated photo/attachment tables, operational tables, and
schema/sequence/role definitions. Keep a verified database backup for recovery.
The local native-snapshot rehearsal in
[Release readiness](../docs/RELEASE-READINESS.md) verifies only the disposable
PGlite environment; a Supabase restore rehearsal remains a release prerequisite.

Do not follow the fresh-project sequence on an existing database. Inventory
the deployed schema and applied migrations, take and verify a backup, and
review each applicable numbered migration before applying it. In particular,
`004_dashboard_roles.sql` renames enum values and must only be applied once
where applicable; `007_operations.sql` replaces the census submission table
and refuses to proceed when that table contains rows. The application does
not maintain a migration ledger, so the administrator must establish what has
already run.

Migration 011 belongs after 010 on an existing installation. It permanently
clears ID image payloads; verification decisions and audit metadata remain
available to protected reports and Super Admin backups. Legacy resident
pre-listings remain read-only history. New interest gathering is handled by
Paravets and staff through `program_interest_*` records and is included in the
Super Admin backup without ID image data.

## Validation

Migration 013 follows 012 and adds program runtime and activity history. It
preserves existing schedules and attendance. See
[Program workspace](../docs/PROGRAM-WORKSPACE.md) for lifecycle, capacity, and
paper-encoding rules. Its tables are included in Super Admin backups.

Migration 014 follows 013 and only adds read-performance indexes. It has been
validated in disposable local databases, not applied to Supabase. See
[Performance and loading](../docs/PERFORMANCE-AND-LOADING.md) for measurements
and refresh/cache boundaries.

Migration 015 follows 014 and adds Data Quality review metadata only. It is
included in disposable local setup and protected Super Admin backups. See
[Insights redesign](../docs/INSIGHTS-REDESIGN.md) for role scopes, review rules,
and counting definitions. It has not been applied to Supabase.

Migration 016 follows 015 and adds owner/pet reviewed-save requests and activity
history. Existing registry and attendance records are preserved. It is included
in disposable setup and Super Admin backups, not applied to Supabase. See
[Owner and pet workspace](../docs/OWNER-PET-WORKSPACE.md) for review, link
correction, import, and archive/restore rules.

Migration 017 follows 016 and publishes structured census registry identities
into the staff workspace through stable aliases, with complete workspace review
snapshots. Migration 018 follows 017 and permits explicitly unknown census flags
while preserving existing values. These are included in disposable setup only;
neither was applied to Supabase. See
[Census import and search](../docs/CENSUS-IMPORT-AND-SEARCH.md).

The local disposable PGlite setup uses the same current schema migration
sequence. Before deployment, run `npm run typecheck`, `npm test`, and
`npm run build` from the application root. For this redesign, build locally
first, then run type checking and the disposable database test suite. Database-backed tests require the
isolated test database described in the main setup guide; never point them at
production.
