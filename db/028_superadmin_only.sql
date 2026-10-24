-- 028: City Vet keeps one staff role. Every Admin account becomes a SuperAdmin;
-- existing SuperAdmins are unchanged. Account creation already offers Paravet
-- only, so no new Admin accounts are made. The 'Admin' enum value stays for old
-- audit rows and is simply no longer used.
-- Not in the local test schema (scripts/local-schema.mjs): the tests still sign in
-- as the seeded Admin to cover the old role checks.
-- Idempotent: safe to run twice. Apply after 027.
BEGIN;
UPDATE ekapon.accounts SET account_type = 'SuperAdmin' WHERE account_type = 'Admin';
COMMIT;
-- Rollback: not automatic. Before running, note the Admin accounts with
--   SELECT id, username FROM ekapon.accounts WHERE account_type = 'Admin';
-- and set those ids back to 'Admin' if needed.
