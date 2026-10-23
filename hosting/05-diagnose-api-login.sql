-- READ ONLY. Run in Supabase SQL Editor as postgres/project owner.
-- This reports role privileges only. No passwords, hashes, account names or records are returned.
-- An empty first result means the expected role does not exist in this project.
SELECT r.rolname,r.rolcanlogin,r.rolinherit,r.rolconnlimit,r.rolvaliduntil,
       pg_has_role(r.oid,parent.oid,'USAGE') AS inherits_application_permissions,
       has_database_privilege(r.oid,current_database(),'CONNECT') AS can_connect_database,
       has_schema_privilege(r.oid,s.oid,'USAGE') AS can_use_application_schema
FROM pg_roles r
LEFT JOIN pg_roles parent ON parent.rolname='ekapon_admin'
LEFT JOIN pg_namespace s ON s.nspname='ekapon'
WHERE r.rolname='ekapon_api';

SELECT p.signature,p.oid IS NOT NULL AS installed,
       has_function_privilege(r.oid,p.oid,'EXECUTE') AS can_execute
FROM pg_roles r
CROSS JOIN LATERAL (
    VALUES
      ('ekapon.recent_failed_logins(inet,integer)',to_regprocedure('ekapon.recent_failed_logins(inet,integer)')::oid),
      ('ekapon.verify_password(text,text,inet)',to_regprocedure('ekapon.verify_password(text,text,inet)')::oid),
      ('ekapon.verify_temp_password(text,text,inet)',to_regprocedure('ekapon.verify_temp_password(text,text,inet)')::oid)
) AS p(signature,oid)
WHERE r.rolname='ekapon_api';

SELECT c.column_name,
       has_column_privilege(r.oid,t.oid,c.column_name,'SELECT') AS can_select
FROM pg_roles r
JOIN pg_class t ON t.oid=to_regclass('ekapon.accounts')
CROSS JOIN (VALUES ('id'),('account_type'),('full_name'),('username'),('account_key'),('password_hash')) AS c(column_name)
WHERE r.rolname='ekapon_api';
-- Expected: LOGIN, CONNECT, schema access, inherited application permissions,
-- installed/executable login functions, and the five public account fields = true.
-- password_hash SELECT must remain false.
-- All checks passing does NOT validate the password, remote pooler username/host,
-- TLS/network reachability, or Vercel environment/deployment selection.
