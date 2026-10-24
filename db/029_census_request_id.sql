-- 029: Salin sends census submissions from its outbox and may resend one after
-- a dropped connection; request_id makes the resend return the first
-- submission instead of creating a duplicate.
-- Additive and idempotent: safe to run twice. Apply after 028.
BEGIN;
ALTER TABLE ekapon.census_submissions ADD COLUMN IF NOT EXISTS request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS census_submissions_request_uq ON ekapon.census_submissions(request_id) WHERE request_id IS NOT NULL;
COMMIT;
-- Rollback:
--   BEGIN; DROP INDEX IF EXISTS ekapon.census_submissions_request_uq; ALTER TABLE ekapon.census_submissions DROP COLUMN IF EXISTS request_id; COMMIT;
