-- OPERATOR TEMPLATE: edit only in a private Supabase SQL Editor request.
-- Do not save the edited text in Git, messages or a shared document.
-- Run once after 01-fresh-schema.sql. Refuses any existing account.
-- Vercel must use the restricted API role, never postgres, for DATABASE_URL.
BEGIN;
DO $$
DECLARE
  api_password text := 'REPLACE_WITH_A_DISTINCT_RANDOM_API_PASSWORD';
  admin_password text := 'REPLACE_WITH_A_DISTINCT_RANDOM_ADMIN_PASSWORD';
  admin_username text := 'REPLACE_WITH_YOUR_ADMIN_USERNAME';
  admin_first_name text := 'REPLACE_WITH_YOUR_FIRST_NAME';
  admin_last_name text := 'REPLACE_WITH_YOUR_LAST_NAME';
BEGIN
  IF api_password LIKE 'REPLACE_%' OR admin_password LIKE 'REPLACE_%'
     OR admin_username LIKE 'REPLACE_%' OR admin_first_name LIKE 'REPLACE_%' OR admin_last_name LIKE 'REPLACE_%' THEN
    RAISE EXCEPTION 'Replace all five placeholders privately in the SQL Editor first.';
  END IF;
  IF length(api_password)<32 OR length(admin_password)<16 OR octet_length(admin_password)>72
     OR admin_password !~ '[A-Za-z]' OR admin_password !~ '[0-9]' OR api_password=admin_password THEN
    RAISE EXCEPTION 'Use distinct secrets: API password at least 32 characters; admin password 16-72 characters with letters and numbers.';
  END IF;
  LOCK TABLE ekapon.accounts IN EXCLUSIVE MODE;
  IF EXISTS(SELECT 1 FROM ekapon.accounts) THEN
    RAISE EXCEPTION 'Bootstrap refused: accounts already exist. Use the established account recovery procedure.';
  END IF;
  EXECUTE format('ALTER ROLE ekapon_api WITH LOGIN PASSWORD %L',api_password);
  INSERT INTO ekapon.accounts(username,account_type,first_name,last_name,password_hash,status)
  VALUES(admin_username,'SuperAdmin',admin_first_name,admin_last_name,
         extensions.crypt(admin_password,extensions.gen_salt('bf',12)),'Active');
END $$;
COMMIT;
-- No credentials are returned. Create Admins and Paravets through Accounts after sign-in.
