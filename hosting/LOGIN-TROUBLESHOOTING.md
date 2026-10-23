# Hosted login diagnosis

The browser's request helper is not an error report. Inspect DevTools > Network for the failed POST `/api/v1/auth/login`, its HTTP status and Response tab. A GET `/api/v1/auth/me` returning 401 before sign-in is expected and does not demonstrate missing database privileges. Do not share the request payload, credentials, cookies or connection strings.

## Check the actual deployment

On October 20, 2026, credential-free probes of `https://cms-cvo-sjdm.vercel.app` returned:

- GET `/api/v1/health`: HTTP 500, `INTERNAL`, request ID `7035151f-c75e-4b69-ba26-032e7275252f`.
- OPTIONS `/api/v1/auth/login`: HTTP 204, confirming the API route is present.

The earlier `congenial-parakeet-tan` deployment returned a healthy database check. That result does not establish the new project's environment configuration.

The health endpoint only executes `SELECT 1`. A failure there points to a database/configuration/connection issue before normal application table reads. Table-wide grants, an app Admin password reset, RLS bypass, or using the database owner in the application are not a justified fix for this evidence.

## Inspect without changing access

### Configuration validation before database access

Later October 20 checks returned 204 for OPTIONS `/api/v1/auth/login` without an Origin header, but 500 for the same OPTIONS request with `Origin: https://cms-cvo-sjdm.vercel.app`. In this project's handler, the latter validates configuration before returning OPTIONS and never queries the database. This pattern identifies a configuration validation failure; it does not establish whether the database password will work after configuration is corrected.

The diagnostic update adds a `configurationFields` array to the existing private runtime error entry, for example `{"errorCode":"INTERNAL","configurationFields":["SUPABASE_URL"]}`. It logs field names only; raw validation errors, secret values and connection strings are excluded. The public response remains generic. Deploy the updated source to the existing Vercel project, invoke health again, then find its request ID in Runtime Logs. Share only `configurationFields` or `databaseCode` and the request ID. If neither diagnostic field appears, report that rather than sharing raw environment values.

Confirm the active Production deployment was created after the settings were saved. A project-level settings change does not update an already running deployment. Use `SUPABASE_SECRET_KEY` from Settings > API Keys > Secret keys (`sb_secret_...`), or an existing legacy service-role key. A publishable/anonymous key, database password, JWT signing secret or personal access token does not substitute for it. The current config validator checks presence and length; health executes SQL only, so a passing health check does not verify Storage key validity or bucket access.

Optional numeric settings must be omitted or valid numbers; empty `SESSION_HOURS` and `LOGIN_IP_MAX_FAILURES` values fail validation. `FILE_STORAGE_DRIVER` must be exactly `supabase` in Production, and `SUPABASE_STORAGE_BUCKET` defaults to `ekapon-private` when omitted. Do not change role privileges or reset app passwords to resolve a configuration validation failure.

Run [05-diagnose-api-login.sql](05-diagnose-api-login.sql) in the intended Supabase project's SQL Editor as its owner. It returns only role/permission flags, not passwords, hashes or personal records. Expected: the API role exists; `rolcanlogin`, inherited application privileges, CONNECT, schema access and listed login functions are true. Public account columns are readable; password hashes are not.

If `rolcanlogin` is false and the API credential was already set correctly, the targeted correction is `ALTER ROLE ekapon_api LOGIN;`. If the role password was never established or no longer matches Vercel, use the private [06-rotate-api-login.sql](06-rotate-api-login.sql) template to enable login and set a new strong role password. Update Vercel's DATABASE_URL to that same password and redeploy. This does not reset any application's Admin/SuperAdmin password or grant new table/function privileges.

Do not rerun `01-fresh-schema.sql` or `02-configure-access.sql` against an installed database to recover login. The first is a fresh installer and the second intentionally refuses existing accounts.

## Verify Vercel server configuration privately

In the `cms-cvo-sjdm` project, verify the Production DATABASE_URL matches the intended Supabase project. Copy the exact Shared Transaction Pooler endpoint from Supabase's Connect dialog, port 6543. For the custom role the username is `ekapon_api.<project-ref>`; use the role password, not an app administrator password or Supabase API key. URL-encode special characters in the password. No literal square brackets, placeholder tokens or extra quotes should remain in the saved environment value.

Verify all other required server variables from `vercel-env.example.txt`, especially JWT_SECRET and the private Storage configuration. Check that changes are scoped to the environment actually deployed, then redeploy; old deployments do not acquire new environment values automatically. Confirm the Supabase project is active.

For logs, select the new project's **Runtime Logs**, the correct Production deployment and current time window. Search for the health request ID above, or invoke health again and use its new request ID. The app logs a safe SQLSTATE when available: `28P01` generally indicates database password authentication failure, `28000` invalid authorization, and `42501` missing privileges. Do not paste full raw error objects or connection strings.

Only after health returns 200 should you interpret the login result: `INVALID_CREDENTIALS` indicates application credentials; `ACCOUNT_LOCKED` / `FIRST_SIGN_IN_REQUIRED` indicate account state; `FORBIDDEN` needs the exact safe response and corresponding database privilege check. A successful POST followed by an unauthenticated `/auth/me` requires checking session cookie delivery and that both requests use the same hostname.

## Local verification

`npm test -- tests/api-role-login.test.ts --silent`: two tests passed. The existing API login, session lookup and health check work with the restricted `ekapon_api` role in the disposable local database, while direct password-hash reads remain denied. The diagnostic SQL was executed locally and the rotation template was verified to refuse unchanged placeholders. No hosted role, password, account, schema or environment variable was changed.

References: [Supabase roles](https://supabase.com/docs/guides/database/postgres/roles), [pooler connection format](https://supabase.com/docs/guides/database/connecting-to-postgres).

Diagnostic update verification: `npm test -- tests/config-diagnostics.test.ts tests/hosting-runtime.test.ts tests/api-role-login.test.ts --silent` passed all 14 tests; `npm run typecheck` passed. Tests verify rejected setting names, no secret values in logs/responses, generic public errors, body limits, restricted role login/session flow, and existing diagnostic SQL. No hosted settings, credentials or data were changed.
