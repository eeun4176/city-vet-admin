-- SUPABASE ONLY. Keep the bucket private; app cookies are not Supabase Auth JWTs.
-- The Vercel API checks account/role/barangay before using its server-only Storage key.
-- No anon/authenticated Storage access policies are created.
BEGIN;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects') THEN
    RAISE EXCEPTION 'Existing Storage policies need review. Broad policies could expose this private bucket; no policies were changed.';
  END IF;
  IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='ekapon-private') THEN
    RAISE EXCEPTION 'Bucket already exists. Inspect its privacy, limits and policies before reusing it.';
  END IF;
END $$;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('ekapon-private','ekapon-private',false,3145728,
       ARRAY['image/jpeg','image/png','image/webp','application/pdf']);
COMMIT;
