-- READ ONLY. After access/storage setup and before opening the hosted application.
SELECT file,applied_at FROM ekapon.schema_migrations ORDER BY file;
SELECT account_type,status,count(*) AS accounts FROM ekapon.accounts GROUP BY account_type,status;
SELECT 'dashboard_records' AS kind,count(*) AS rows FROM ekapon.dashboard_records
UNION ALL SELECT 'registry_owners',count(*) FROM ekapon.registry_owners
UNION ALL SELECT 'registry_pets',count(*) FROM ekapon.registry_pets
UNION ALL SELECT 'census_submissions',count(*) FROM ekapon.census_submissions
UNION ALL SELECT 'programs_and_demands',count(*) FROM ekapon.program_interest_campaigns
UNION ALL SELECT 'private_files',count(*) FROM ekapon.private_files;
SELECT count(*) AS official_barangays FROM ekapon.barangays;
SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls
FROM pg_roles WHERE rolname='ekapon_api';
SELECT has_schema_privilege('ekapon_api','ekapon','USAGE') AS api_has_schema_access,
       has_schema_privilege('ekapon_api','public','CREATE') AS api_can_create_public_objects,
       has_column_privilege('ekapon_api','ekapon.accounts','password_hash','SELECT') AS api_can_read_password_hashes;
SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets WHERE id='ekapon-private';
-- Expected: one Active SuperAdmin, zero operational rows, 62 barangays, LOGIN true,
-- elevated flags false, schema access true, public create false, password hash access false, bucket public false.
