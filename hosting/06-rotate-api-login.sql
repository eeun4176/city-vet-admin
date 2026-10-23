-- OPTIONAL PRIVATE OPERATOR TEMPLATE. Use only after confirming the target project.
-- Repairs disabled database LOGIN / rotates its credential; does not change app account passwords.
-- This preserves all existing data and table/function privileges.
-- After running, update Vercel DATABASE_URL with this same new password and redeploy.
BEGIN;
DO $$
DECLARE
    api_password text := 'REPLACE_WITH_A_NEW_RANDOM_API_PASSWORD';
BEGIN
    IF api_password='REPLACE_WITH_A_NEW_RANDOM_API_PASSWORD' OR length(api_password)<32 THEN
        RAISE EXCEPTION 'Choose a new random API password of at least 32 characters privately first.';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekapon_api') THEN
        RAISE EXCEPTION 'ekapon_api is missing. Verify the target project and installation; no role was created.';
    END IF;
    EXECUTE format('ALTER ROLE ekapon_api WITH LOGIN PASSWORD %L',api_password);
END $$;
COMMIT;
-- The password is never returned. Do not commit/share an edited copy.
