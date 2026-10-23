-- Additive: retain existing bytea files; hosted uploads use private object storage.
BEGIN;
CREATE TABLE IF NOT EXISTS ekapon.private_files (
    id uuid PRIMARY KEY,
    object_path text NOT NULL UNIQUE CHECK (object_path ~ '^(profiles|census|stubs)/[0-9a-f-]{36}$'),
    mime text NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp','application/pdf')),
    bytes integer NOT NULL CHECK (bytes BETWEEN 1 AND 3145728),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS private_files_cleanup_idx ON ekapon.private_files(created_at);
REVOKE ALL ON ekapon.private_files FROM PUBLIC;
GRANT SELECT,INSERT,DELETE ON ekapon.private_files TO ekapon_admin;

ALTER TABLE ekapon.account_preferences ADD COLUMN IF NOT EXISTS profile_file_id uuid REFERENCES ekapon.private_files(id) ON DELETE RESTRICT;
ALTER TABLE ekapon.account_preferences DROP CONSTRAINT IF EXISTS account_preferences_check;
ALTER TABLE ekapon.account_preferences DROP CONSTRAINT IF EXISTS account_preferences_photo_storage_check;
ALTER TABLE ekapon.account_preferences ADD CONSTRAINT account_preferences_photo_storage_check CHECK (
    ((profile_photo IS NOT NULL)::int + (profile_file_id IS NOT NULL)::int <= 1)
    AND ((profile_photo_mime IS NULL) = (profile_photo IS NULL AND profile_file_id IS NULL))
);
ALTER TABLE ekapon.census_attachments ADD COLUMN IF NOT EXISTS file_id uuid REFERENCES ekapon.private_files(id) ON DELETE RESTRICT;
ALTER TABLE ekapon.census_attachments ALTER COLUMN image DROP NOT NULL;
ALTER TABLE ekapon.census_attachments DROP CONSTRAINT IF EXISTS census_attachments_storage_check;
ALTER TABLE ekapon.census_attachments ADD CONSTRAINT census_attachments_storage_check CHECK (
    (image IS NOT NULL)::int + (file_id IS NOT NULL)::int = 1
);
ALTER TABLE ekapon.stub_batches ADD COLUMN IF NOT EXISTS external_pdf_file_id uuid REFERENCES ekapon.private_files(id) ON DELETE RESTRICT;
ALTER TABLE ekapon.stub_batches DROP CONSTRAINT IF EXISTS stub_batches_pdf_storage_check;
ALTER TABLE ekapon.stub_batches ADD CONSTRAINT stub_batches_pdf_storage_check CHECK (
    (external_pdf IS NOT NULL)::int + (external_pdf_file_id IS NOT NULL)::int <= 1
);
COMMIT;
