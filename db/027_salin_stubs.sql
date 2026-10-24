-- 027: stubs that paravets print in Salin, and that follow owner edits.
-- * Admin can send an approved batch to its barangay: Salin then lists it for
--   the paravets there to print. Status is unchanged (Approved until printed).
-- * When a paravet edits an owner in a program request, that owner's issued
--   stub is updated too; details_updated_at marks slips worth reprinting.
-- * The owner writes their name on the printed (blank-name) stub; the paravet
--   encodes it in Salin, and owner_confirmed_at records that.
-- Additive and idempotent: safe to run twice. Apply after 026.
BEGIN;
ALTER TABLE ekapon.stub_batches ADD COLUMN IF NOT EXISTS sent_by bigint REFERENCES ekapon.accounts(id) ON DELETE RESTRICT;
ALTER TABLE ekapon.stub_batches ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE ekapon.stub_tickets ADD COLUMN IF NOT EXISTS details_updated_at timestamptz;
ALTER TABLE ekapon.stub_tickets ADD COLUMN IF NOT EXISTS owner_confirmed_at timestamptz;
ALTER TABLE ekapon.stub_activity DROP CONSTRAINT IF EXISTS stub_activity_action_check;
ALTER TABLE ekapon.stub_activity ADD CONSTRAINT stub_activity_action_check CHECK (action IN ('batch-requested','batch-approved','batch-rejected','batch-printed','batch-reprinted','batch-handed-over','stub-issued','manual-issue-recorded','stub-cancelled','stub-redeemed','walk-in-submitted','attendance-voided','batch-sent','stub-details-updated','owner-confirmed'));
CREATE INDEX IF NOT EXISTS stub_tickets_interest_person_idx ON ekapon.stub_tickets(interest_person_id) WHERE interest_person_id IS NOT NULL;
COMMIT;
-- Rollback: BEGIN; DROP INDEX IF EXISTS ekapon.stub_tickets_interest_person_idx;
--   ALTER TABLE ekapon.stub_tickets DROP COLUMN IF EXISTS details_updated_at, DROP COLUMN IF EXISTS owner_confirmed_at;
--   ALTER TABLE ekapon.stub_batches DROP COLUMN IF EXISTS sent_at, DROP COLUMN IF EXISTS sent_by;
--   (after deleting any 'batch-sent'/'stub-details-updated'/'owner-confirmed' activity rows) restore the 012 action list on stub_activity_action_check; COMMIT;
