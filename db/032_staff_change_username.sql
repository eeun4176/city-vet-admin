-- 032: An Admin changes their own username from the Account page (PATCH /auth/credentials).
-- The API checks the current password first; usernames stay unique through accounts_username_uq.
-- Idempotent: safe to run twice. Apply after 031.
BEGIN;
GRANT UPDATE (username) ON ekapon.accounts TO ekapon_admin;
COMMIT;
-- Rollback: REVOKE UPDATE (username) ON ekapon.accounts FROM ekapon_admin; (changing usernames stops working)
