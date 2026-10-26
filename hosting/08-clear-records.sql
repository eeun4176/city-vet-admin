-- 08: Remove all records (owners, pets, census, programs, stubs, attendance, imports) and keep the accounts.
-- Run it in the Supabase SQL Editor, for example before going live after testing.
--
-- Why deleting rows from one table is not enough: a person or pet is kept in several places — the registry
-- (dashboard_records), census submissions (census_owners / census_pets), program interest lists, stubs, attendance
-- snapshots and standalone services — and search reads all of them. This script empties every one of them at once.
--
-- Kept: accounts (Admins and Paravets), their Paravet directory rows, barangays, settings, feature access, breed
-- references, sign-in history and the audit log. Nothing here touches the database structure.
-- The TRUNCATE has no CASCADE on purpose: if a table that is not listed still points at these records, PostgreSQL
-- stops with an error instead of emptying more than this list.
BEGIN;

TRUNCATE
  ekapon.program_attendance, ekapon.stub_activity, ekapon.stub_tickets, ekapon.stub_batches,
  ekapon.program_interest_activity, ekapon.program_interest_people, ekapon.program_interest_allowed_barangays, ekapon.program_interest_campaigns,
  ekapon.program_runtime, ekapon.program_workspace_activity, ekapon.standalone_services,
  ekapon.census_decision_activity, ekapon.census_review_snapshots, ekapon.census_submission_status_history,
  ekapon.census_attachments, ekapon.census_pets, ekapon.census_owners, ekapon.census_submissions,
  ekapon.registry_intake_links, ekapon.registry_source_links, ekapon.registry_activity, ekapon.registry_requests,
  ekapon.registry_pets, ekapon.registry_owners,
  ekapon.data_quality_activity, ekapon.data_quality_reviews,
  ekapon.dashboard_import_items, ekapon.dashboard_import_batches, ekapon.spay_neuter_report_imports,
  ekapon.id_verification_log, ekapon.id_verifications, ekapon.prelistings,
  ekapon.edit_undo, ekapon.report_drafts, ekapon.notifications, ekapon.navigation_changes, ekapon.navigation_seen;

-- The registry, programs and services live in one table; the Paravet directory rows stay (they belong to the Paravet accounts).
DELETE FROM ekapon.dashboard_records WHERE dataset <> 'paravets';

COMMIT;

-- Optional part 2: keep only the Admin accounts. Run after part 1 (above), as its own request.
-- Paravet accounts go too: their accepted terms, sign-in codes and preferences, then the Paravet directory rows.
-- BEGIN;
-- DELETE FROM ekapon.policy_acceptances WHERE account_id IN (SELECT id FROM ekapon.accounts WHERE account_type NOT IN ('Admin','SuperAdmin'));
-- DELETE FROM ekapon.dashboard_records;
-- DELETE FROM ekapon.accounts WHERE account_type NOT IN ('Admin','SuperAdmin');
-- COMMIT;

-- Optional: the audit log still holds the old values of deleted rows. To remove that trace too, run separately:
--   TRUNCATE ekapon.audit_log;
-- Afterwards, press Refresh in e-Vet Admin (or reload the page): browsers keep recent results for a short time.
