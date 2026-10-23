-- Preserve notifications while allowing users to remove them from their inbox.
ALTER TABLE ekapon.notifications
    ADD COLUMN IF NOT EXISTS archived_at timestamptz;

GRANT UPDATE (read_at, archived_at) ON ekapon.notifications TO ekapon_admin;
