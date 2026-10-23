-- READ ONLY. Run in Supabase SQL Editor before choosing a database.
-- If ekapon exists, STOP: do not run 01-fresh-schema.sql here.
-- Keep existing projects intact; use a separate empty project for a fresh start.
SELECT current_database() AS database_name, version() AS postgres_version,
       to_regnamespace('ekapon') IS NOT NULL AS existing_ekapon_install;
SELECT n.nspname AS schema_name,c.relname AS table_name,c.reltuples::bigint AS estimated_rows
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('ekapon','public') AND c.relkind IN ('r','p')
ORDER BY n.nspname,c.relname;
SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls
FROM pg_roles WHERE rolname IN ('ekapon_api','ekapon_admin');
-- Counts above are planner estimates, not an authoritative record inventory.
