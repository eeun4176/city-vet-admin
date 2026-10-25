-- 07: keep one stuck request from stalling the whole API. Run in the Supabase SQL Editor as the project owner.
-- Vercel ends a function after 60 s. If it was inside a transaction, its pooled database session can stay
-- "idle in transaction" and keep its locks, so later reads of the same tables wait until they time out too (504).
-- Run part 1 on its own first and keep its result; then run parts 2 and 3. Safe to run again.
-- No data is changed: part 2 only closes API sessions whose request has already ended.

-- 1. Look: open transactions, how long they have been open, and which sessions block which.
SELECT pid, usename, application_name, state, now() - xact_start AS open_for, wait_event_type, wait_event,
       pg_blocking_pids(pid) AS blocked_by, left(query, 120) AS last_query
  FROM pg_stat_activity
 WHERE datname = current_database() AND xact_start IS NOT NULL AND pid <> pg_backend_pid()
 ORDER BY xact_start;

-- 2. Clear: end API sessions left idle inside a transaction for over a minute.
SELECT pid, pg_terminate_backend(pid) AS ended
  FROM pg_stat_activity
 WHERE usename = 'ekapon_api' AND state LIKE 'idle in transaction%' AND now() - state_change > interval '1 minute';

-- 3. Prevent: the database ends such sessions itself and fails a waiting query with an error instead of hanging.
--    Below Vercel's 60 s limit, so the API can still answer. New pooled sessions pick these up.
ALTER ROLE ekapon_api SET idle_in_transaction_session_timeout = '20s';
ALTER ROLE ekapon_api SET lock_timeout = '10s';
ALTER ROLE ekapon_api SET statement_timeout = '45s';
-- Rollback: ALTER ROLE ekapon_api RESET idle_in_transaction_session_timeout; (and the same for lock_timeout, statement_timeout)
