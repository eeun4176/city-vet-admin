-- 026: shared barangay program requests from Salin (the paravets' field app).
-- * Admin can merge requests from several barangays into one: the merged
--   request is kept as status 'merged' and points at the request it joined.
--   It still counts as the barangay's active request until that one finishes.
-- * Salin may resend an owner entry after a dropped connection; request_id
--   makes the resend return the first entry instead of adding a duplicate.
-- Additive and idempotent: safe to run twice. (025 is reserved for report performance.)
BEGIN;
ALTER TABLE ekapon.program_interest_campaigns ADD COLUMN IF NOT EXISTS merged_into_id bigint REFERENCES ekapon.program_interest_campaigns(id) ON DELETE RESTRICT;
ALTER TABLE ekapon.program_interest_campaigns DROP CONSTRAINT IF EXISTS program_interest_campaigns_status_check;
ALTER TABLE ekapon.program_interest_campaigns ADD CONSTRAINT program_interest_campaigns_status_check CHECK(status IN ('gathering','requested','approved','rejected','scheduled','closed','cancelled','merged'));
ALTER TABLE ekapon.program_interest_campaigns DROP CONSTRAINT IF EXISTS program_interest_campaigns_merged_check;
ALTER TABLE ekapon.program_interest_campaigns ADD CONSTRAINT program_interest_campaigns_merged_check CHECK((status='merged')=(merged_into_id IS NOT NULL) OR (merged_into_id IS NOT NULL AND status IN ('closed','rejected','cancelled')));
CREATE INDEX IF NOT EXISTS program_interest_merged_into_idx ON ekapon.program_interest_campaigns(merged_into_id) WHERE merged_into_id IS NOT NULL;
ALTER TABLE ekapon.program_interest_activity DROP CONSTRAINT IF EXISTS program_interest_activity_action_check;
ALTER TABLE ekapon.program_interest_activity ADD CONSTRAINT program_interest_activity_action_check CHECK(action IN ('created','interest-added','interest-updated','interest-withdrawn','request-submitted','request-approved','request-rejected','program-scheduled','program-access-updated','closed','reopened','request-edited','request-cancelled','request-merged','requests-merged-in'));
ALTER TABLE ekapon.program_interest_people ADD COLUMN IF NOT EXISTS request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS program_interest_people_request_uq ON ekapon.program_interest_people(request_id) WHERE request_id IS NOT NULL;
-- A barangay finishes its request (closed, rejected or cancelled) before starting another; a merged one is not finished yet.
CREATE OR REPLACE FUNCTION ekapon.enforce_active_demand() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.campaign_type='program_request' AND NEW.status IN ('gathering','requested','approved','scheduled','merged') THEN
  PERFORM pg_advisory_xact_lock(73023,NEW.host_barangay_id);
  IF EXISTS(SELECT 1 FROM ekapon.program_interest_campaigns c WHERE c.host_barangay_id=NEW.host_barangay_id AND c.campaign_type='program_request' AND c.status IN ('gathering','requested','approved','scheduled','merged') AND c.id<>NEW.id) THEN
   RAISE EXCEPTION 'An active request already exists for this barangay' USING ERRCODE='23505';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP INDEX IF EXISTS ekapon.one_active_barangay_demand;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM ekapon.program_interest_campaigns WHERE campaign_type='program_request' AND status IN ('gathering','requested','approved','scheduled','merged') GROUP BY host_barangay_id HAVING count(*)>1) THEN
  CREATE UNIQUE INDEX IF NOT EXISTS one_active_barangay_demand ON ekapon.program_interest_campaigns(host_barangay_id) WHERE campaign_type='program_request' AND status IN ('gathering','requested','approved','scheduled','merged');
 END IF;
END $$;
COMMIT;
-- Rollback (only while no request is 'merged'):
--   BEGIN; DROP INDEX IF EXISTS ekapon.program_interest_people_request_uq; ALTER TABLE ekapon.program_interest_people DROP COLUMN IF EXISTS request_id;
--   ALTER TABLE ekapon.program_interest_campaigns DROP CONSTRAINT IF EXISTS program_interest_campaigns_merged_check; DROP INDEX IF EXISTS ekapon.program_interest_merged_into_idx;
--   ALTER TABLE ekapon.program_interest_campaigns DROP COLUMN IF EXISTS merged_into_id; then re-run the status/action checks, trigger and index from 023_workflow_redesign.sql; COMMIT;
