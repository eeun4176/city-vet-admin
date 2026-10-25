-- 031: Supabase turns on row-level security for newly created tables, which
-- blocked every insert into ekapon.email_codes (from 030) for the API role.
-- e-Kapon does not use RLS: the API checks every account and scope itself,
-- like for all other ekapon tables. Turn it off for email_codes.
-- Idempotent: safe to run twice. Apply after 030.
BEGIN;
ALTER TABLE ekapon.email_codes DISABLE ROW LEVEL SECURITY;
COMMIT;
-- Rollback: ALTER TABLE ekapon.email_codes ENABLE ROW LEVEL SECURITY; (password reset by email stops working)
