CREATE TABLE IF NOT EXISTS ekapon.account_preferences (
    account_id bigint PRIMARY KEY REFERENCES ekapon.accounts(id) ON DELETE CASCADE,
    theme text NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
    error_duration_minutes smallint NOT NULL DEFAULT 5 CHECK (error_duration_minutes BETWEEN 1 AND 60),
    profile_photo bytea,
    profile_photo_mime text CHECK (profile_photo_mime IS NULL OR profile_photo_mime IN ('image/jpeg', 'image/png', 'image/webp')),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((profile_photo IS NULL) = (profile_photo_mime IS NULL)),
    CHECK (profile_photo IS NULL OR octet_length(profile_photo) <= 2097152)
);

CREATE TABLE IF NOT EXISTS ekapon.edit_undo (
    token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id bigint NOT NULL REFERENCES ekapon.accounts(id) ON DELETE CASCADE,
    entity_type text NOT NULL CHECK (entity_type IN ('account_profile', 'account', 'dashboard_record')),
    entity_key text NOT NULL,
    before_data jsonb NOT NULL CHECK (jsonb_typeof(before_data) = 'object'),
    after_data jsonb NOT NULL CHECK (jsonb_typeof(after_data) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
    undone_at timestamptz,
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS edit_undo_actor_expiry_idx
    ON ekapon.edit_undo (actor_id, expires_at DESC)
    WHERE undone_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON ekapon.account_preferences TO ekapon_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ekapon.edit_undo TO ekapon_admin;
