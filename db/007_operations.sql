-- =====================================================================
-- 007_operations.sql
-- Run in the Supabase SQL Editor AFTER 000, 001, 005 and 006.
--
-- STEP 1: run PART 1 on its own (one statement).
-- STEP 2: run PART 2 (everything from BEGIN to COMMIT).
--
-- What it adds: normalized census + registry tables, door-to-door review
-- decisions, ID-photo verification (30-day retention), time-limited access
-- grants, Admin permission requests, issue reports, in-app notifications,
-- account "On hold" state, new system settings, and daily maintenance.
-- It replaces db/005 + db/006 census_submissions (refuses to run if that
-- table already holds rows).
-- =====================================================================

-- ======================= PART 1 (run alone) ==========================
ALTER TYPE ekapon.account_status ADD VALUE IF NOT EXISTS 'On hold';

-- ======================= PART 2 ======================================
BEGIN;

DO $$
BEGIN
    IF to_regclass('ekapon.census_submissions') IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM ekapon.census_submissions) THEN
            RAISE EXCEPTION 'ekapon.census_submissions still contains rows. Export or clear them before running 007.';
        END IF;
        DROP TABLE ekapon.census_submissions;
    END IF;
END
$$;

-- ---------- Accounts ------------------------------------------------
ALTER TABLE ekapon.accounts
    ADD COLUMN locale         text NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'fil')),
    ADD COLUMN hold_reason    text CHECK (hold_reason IS NULL OR length(hold_reason) <= 300),
    ADD COLUMN id_verified_at timestamptz;
GRANT SELECT (locale, hold_reason, id_verified_at) ON ekapon.accounts TO ekapon_admin;
GRANT UPDATE (locale) ON ekapon.accounts TO ekapon_admin;

-- ---------- System settings and feature keys ------------------------
ALTER TABLE ekapon.system_settings DROP CONSTRAINT IF EXISTS system_settings_setting_key_check;
ALTER TABLE ekapon.system_settings ADD CONSTRAINT system_settings_setting_key_check CHECK (setting_key IN (
    'maintenance_mode', 'keepalive_enabled', 'backup_reminder_enabled',
    'backup_reminder_days', 'last_backup_at', 'last_maintenance_at', 'default_locale'));
INSERT INTO ekapon.system_settings (setting_key, setting_value) VALUES
    ('keepalive_enabled', 'true'),
    ('backup_reminder_enabled', 'true'),
    ('backup_reminder_days', '7'),
    ('last_backup_at', 'null'),
    ('last_maintenance_at', 'null'),
    ('default_locale', '"en"')
ON CONFLICT (setting_key) DO NOTHING;

ALTER TABLE ekapon.role_feature_access DROP CONSTRAINT IF EXISTS role_feature_access_feature_key_check;
ALTER TABLE ekapon.role_feature_access ADD CONSTRAINT role_feature_access_feature_key_check CHECK (feature_key IN (
    'operations', 'registry', 'field-team', 'reports', 'data-quality', 'data-management',
    'settings', 'census', 'accounts', 'id-verification'));

-- ---------- Shared helpers ------------------------------------------
CREATE FUNCTION ekapon.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

-- ---------- Registry (approved data) --------------------------------
CREATE TABLE ekapon.registry_owners (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    barangay_id          integer NOT NULL REFERENCES ekapon.barangays(id) ON DELETE RESTRICT,
    owner_name           text NOT NULL CHECK (length(btrim(owner_name)) BETWEEN 1 AND 120),
    address              text NOT NULL CHECK (length(btrim(address)) BETWEEN 1 AND 240),
    contact              text CHECK (contact IS NULL OR contact ~ '^09[0-9]{2}[- ]?[0-9]{3}[- ]?[0-9]{4}$'),
    source_submission_id uuid,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    archived_at          timestamptz
);
CREATE INDEX registry_owners_lookup_idx
    ON ekapon.registry_owners (barangay_id, lower(btrim(owner_name))) WHERE archived_at IS NULL;

CREATE TABLE ekapon.registry_pets (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id         uuid NOT NULL REFERENCES ekapon.registry_owners(id) ON DELETE CASCADE,
    pet_name         text NOT NULL CHECK (length(btrim(pet_name)) BETWEEN 1 AND 80),
    species          text NOT NULL CHECK (species IN ('Dog', 'Cat')),
    sex              text NOT NULL CHECK (sex IN ('Male', 'Female')),
    age_months       integer CHECK (age_months IS NULL OR age_months BETWEEN 0 AND 600),
    breed_type       text CHECK (breed_type IS NULL OR breed_type IN ('Mongrel', 'Pure')),
    color            text CHECK (color IS NULL OR length(color) <= 60),
    sterilized       boolean NOT NULL DEFAULT false,  -- castrated (male) or spayed (female)
    confinement      text CHECK (confinement IS NULL OR confinement IN ('Confined', 'Semi-confined', 'Free-roaming')),
    vaccine_1st      boolean NOT NULL DEFAULT false,
    vaccine_2nd      boolean NOT NULL DEFAULT false,
    vaccine_3rd      boolean NOT NULL DEFAULT false,
    vaccine_other    text CHECK (vaccine_other IS NULL OR length(vaccine_other) <= 120),
    booster          boolean NOT NULL DEFAULT false,
    laps             boolean NOT NULL DEFAULT false,  -- skipped year or date of vaccination
    registered_year  smallint CHECK (registered_year IS NULL OR registered_year BETWEEN 2000 AND 2100),
    remarks          text CHECK (remarks IS NULL OR length(remarks) <= 300),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    archived_at      timestamptz
);
CREATE INDEX registry_pets_owner_idx ON ekapon.registry_pets (owner_id) WHERE archived_at IS NULL;

CREATE TRIGGER registry_owners_touch BEFORE UPDATE ON ekapon.registry_owners
    FOR EACH ROW EXECUTE FUNCTION ekapon.touch_updated_at();
CREATE TRIGGER registry_pets_touch BEFORE UPDATE ON ekapon.registry_pets
    FOR EACH ROW EXECUTE FUNCTION ekapon.touch_updated_at();
CREATE TRIGGER registry_owners_audit AFTER INSERT OR UPDATE OR DELETE ON ekapon.registry_owners
    FOR EACH ROW EXECUTE FUNCTION ekapon.audit_row();
CREATE TRIGGER registry_pets_audit AFTER INSERT OR UPDATE OR DELETE ON ekapon.registry_pets
    FOR EACH ROW EXECUTE FUNCTION ekapon.audit_row();

-- ---------- Census submissions (staging for review) ------------------
CREATE TABLE ekapon.census_submissions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    barangay_id         integer NOT NULL REFERENCES ekapon.barangays(id) ON DELETE RESTRICT,
    submitted_by        bigint REFERENCES ekapon.accounts(id) ON DELETE SET NULL,
    submitter_name      text NOT NULL,
    source              text NOT NULL CHECK (source IN ('form', 'csv', 'image')),
    census_date         date NOT NULL,
    label               text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 160),
    households_visited  integer NOT NULL DEFAULT 0 CHECK (households_visited >= 0),
    resubmits_id        uuid REFERENCES ekapon.census_submissions(id) ON DELETE SET NULL,
    status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
    reviewed_by         bigint REFERENCES ekapon.accounts(id) ON DELETE SET NULL,
    reviewer_name       text,
    reviewed_at         timestamptz,
    review_note         text CHECK (review_note IS NULL OR length(review_note) <= 500),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT census_submissions_review_state_check CHECK (
        (status IN ('pending', 'withdrawn') AND reviewed_at IS NULL)
        OR (status IN ('approved', 'rejected') AND reviewed_at IS NOT NULL AND reviewer_name IS NOT NULL)),
    CONSTRAINT census_submissions_reject_note_check CHECK (
        status <> 'rejected' OR length(btrim(coalesce(review_note, ''))) >= 3)
);
CREATE INDEX census_submissions_status_idx ON ekapon.census_submissions (status, created_at DESC);
CREATE INDEX census_submissions_barangay_idx ON ekapon.census_submissions (barangay_id, census_date DESC);
CREATE INDEX census_submissions_submitter_idx ON ekapon.census_submissions (submitted_by, created_at DESC);
CREATE TRIGGER census_submissions_touch BEFORE UPDATE ON ekapon.census_submissions
    FOR EACH ROW EXECUTE FUNCTION ekapon.touch_updated_at();
CREATE TRIGGER census_submissions_audit AFTER INSERT OR UPDATE OR DELETE ON ekapon.census_submissions
    FOR EACH ROW EXECUTE FUNCTION ekapon.audit_row();

ALTER TABLE ekapon.registry_owners
    ADD CONSTRAINT registry_owners_source_fk FOREIGN KEY (source_submission_id)
    REFERENCES ekapon.census_submissions(id) ON DELETE SET NULL;

CREATE TABLE ekapon.census_owners (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id     uuid NOT NULL REFERENCES ekapon.census_submissions(id) ON DELETE CASCADE,
    line_no           integer NOT NULL CHECK (line_no > 0),
    owner_name        text NOT NULL CHECK (length(btrim(owner_name)) BETWEEN 1 AND 120),
    address           text NOT NULL CHECK (length(btrim(address)) BETWEEN 1 AND 240),
    contact           text CHECK (contact IS NULL OR contact ~ '^09[0-9]{2}[- ]?[0-9]{3}[- ]?[0-9]{4}$'),
    decision          text NOT NULL DEFAULT 'pending'
                      CHECK (decision IN ('pending', 'new', 'merge', 'replace', 'keep', 'reject')),
    matched_owner_id  uuid REFERENCES ekapon.registry_owners(id) ON DELETE SET NULL,
    UNIQUE (submission_id, line_no)
);

CREATE TABLE ekapon.census_pets (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id         uuid NOT NULL REFERENCES ekapon.census_owners(id) ON DELETE CASCADE,
    line_no          integer NOT NULL CHECK (line_no > 0),
    pet_name         text NOT NULL CHECK (length(btrim(pet_name)) BETWEEN 1 AND 80),
    species          text NOT NULL CHECK (species IN ('Dog', 'Cat')),
    sex              text NOT NULL CHECK (sex IN ('Male', 'Female')),
    age_months       integer CHECK (age_months IS NULL OR age_months BETWEEN 0 AND 600),
    breed_type       text CHECK (breed_type IS NULL OR breed_type IN ('Mongrel', 'Pure')),
    color            text CHECK (color IS NULL OR length(color) <= 60),
    sterilized       boolean NOT NULL DEFAULT false,
    confinement      text CHECK (confinement IS NULL OR confinement IN ('Confined', 'Semi-confined', 'Free-roaming')),
    vaccine_1st      boolean NOT NULL DEFAULT false,
    vaccine_2nd      boolean NOT NULL DEFAULT false,
    vaccine_3rd      boolean NOT NULL DEFAULT false,
    vaccine_other    text CHECK (vaccine_other IS NULL OR length(vaccine_other) <= 120),
    booster          boolean NOT NULL DEFAULT false,
    laps             boolean NOT NULL DEFAULT false,
    registered_year  smallint CHECK (registered_year IS NULL OR registered_year BETWEEN 2000 AND 2100),
    remarks          text CHECK (remarks IS NULL OR length(remarks) <= 300),
    UNIQUE (owner_id, line_no)
);
CREATE INDEX census_owners_submission_idx ON ekapon.census_owners (submission_id);

-- Photos of paper census sheets (reviewed beside a data-entry form; no OCR).
CREATE TABLE ekapon.census_attachments (
    id             bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    submission_id  uuid NOT NULL REFERENCES ekapon.census_submissions(id) ON DELETE CASCADE,
    mime           text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
    image          bytea NOT NULL CHECK (octet_length(image) <= 500000),
    uploaded_by    bigint REFERENCES ekapon.accounts(id) ON DELETE SET NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    purge_after    timestamptz
);
CREATE INDEX census_attachments_submission_idx ON ekapon.census_attachments (submission_id);

-- ---------- ID-photo verification -----------------------------------
CREATE TABLE ekapon.id_verifications (
    id               bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    user_id          bigint NOT NULL REFERENCES ekapon.accounts(id) ON DELETE CASCADE,
    barangay_id      integer NOT NULL REFERENCES ekapon.barangays(id) ON DELETE RESTRICT,
    mime             text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
    image            bytea CHECK (image IS NULL OR octet_length(image) <= 500000),
    status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
    reviewer_id      bigint REFERENCES ekapon.accounts(id) ON DELETE SET NULL,
    reviewer_name    text,
    reviewed_at      timestamptz,
    decision_reason  text CHECK (decision_reason IS NULL OR length(decision_reason) <= 300),
    submitted_at     timestamptz NOT NULL DEFAULT now(),
    purge_after      timestamptz,
    purged_at        timestamptz,
    CHECK (image IS NOT NULL OR purged_at IS NOT NULL),
    CHECK (status = 'pending' OR (reviewed_at IS NOT NULL AND reviewer_name IS NOT NULL)),
    CHECK (status <> 'rejected' OR length(btrim(coalesce(decision_reason, ''))) >= 3)
);
CREATE UNIQUE INDEX id_verifications_one_pending_idx ON ekapon.id_verifications (user_id) WHERE status = 'pending';
CREATE INDEX id_verifications_queue_idx ON ekapon.id_verifications (barangay_id, status, submitted_at);

CREATE TABLE ekapon.id_verification_log (
    id               bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    verification_id  bigint REFERENCES ekapon.id_verifications(id) ON DELETE SET NULL,
    user_id          bigint,
    user_name        text NOT NULL,
    reviewer_id      bigint,
    reviewer_name    text NOT NULL,
    outcome          text NOT NULL CHECK (outcome IN ('verified', 'rejected')),
    reason           text,
    created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ekapon.prelistings ADD COLUMN user_id bigint REFERENCES ekapon.accounts(id) ON DELETE SET NULL;
CREATE FUNCTION ekapon.require_verified_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ekapon AS $$
BEGIN
    IF NEW.user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM ekapon.accounts
         WHERE id = NEW.user_id AND account_type = 'User' AND id_verified_at IS NOT NULL
           AND status = 'Active' AND archived_at IS NULL) THEN
        RAISE EXCEPTION 'Verify your valid ID before pre-listing.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER prelistings_require_verified BEFORE INSERT ON ekapon.prelistings
    FOR EACH ROW EXECUTE FUNCTION ekapon.require_verified_user();

-- ---------- Access grants, permission requests, issues, inbox --------
CREATE TABLE ekapon.access_grants (
    id               bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    grantee_id       bigint NOT NULL REFERENCES ekapon.accounts(id) ON DELETE CASCADE,
    permission       text NOT NULL CHECK (permission IN ('archive', 'restore', 'delete_submission', 'export_with_ids', 'view_user_ids')),
    barangay_id      integer REFERENCES ekapon.barangays(id) ON DELETE RESTRICT,
    reason           text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 300),
    granted_by       bigint REFERENCES ekapon.accounts(id) ON DELETE SET NULL,
    granted_by_name  text NOT NULL,
    granted_at       timestamptz NOT NULL DEFAULT now(),
    expires_at       timestamptz NOT NULL,
    revoked_at       timestamptz,
    revoked_by_name  text,
    revoke_reason    text,
    CHECK (expires_at > granted_at AND expires_at <= granted_at + interval '30 days 1 minute')
);
CREATE INDEX access_grants_active_idx ON ekapon.access_grants (grantee_id, permission) WHERE revoked_at IS NULL;

CREATE TABLE ekapon.permission_requests (
    id               bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    requester_id     bigint NOT NULL REFERENCES ekapon.accounts(id) ON DELETE CASCADE,
    requester_name   text NOT NULL,
    permission       text NOT NULL CHECK (permission IN ('archive', 'restore', 'delete_submission', 'export_with_ids', 'view_user_ids')),
    barangay_id      integer REFERENCES ekapon.barangays(id) ON DELETE RESTRICT,
    reason           text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 300),
    status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    decided_by_name  text,
    decided_at       timestamptz,
    decision_reason  text,
    remarks          text,
    grant_id         bigint REFERENCES ekapon.access_grants(id) ON DELETE SET NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CHECK (status = 'pending' OR (decided_at IS NOT NULL AND length(btrim(coalesce(decision_reason, ''))) >= 3
                                  AND length(btrim(coalesce(remarks, ''))) >= 1))
);
CREATE UNIQUE INDEX permission_requests_one_pending_idx
    ON ekapon.permission_requests (requester_id, permission) WHERE status = 'pending';

CREATE TABLE ekapon.issue_reports (
    id                bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    reporter_id       bigint REFERENCES ekapon.accounts(id) ON DELETE SET NULL,
    reporter_name     text NOT NULL,
    title             text NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 120),
    description       text NOT NULL CHECK (length(btrim(description)) BETWEEN 10 AND 2000),
    severity          text NOT NULL DEFAULT 'normal' CHECK (severity IN ('low', 'normal', 'high')),
    status            text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'dismissed')),
    resolution        text CHECK (resolution IS NULL OR length(resolution) <= 1000),
    resolved_by_name  text,
    resolved_at       timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX issue_reports_status_idx ON ekapon.issue_reports (status, created_at DESC);

CREATE TABLE ekapon.notifications (
    id            bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    recipient_id  bigint NOT NULL REFERENCES ekapon.accounts(id) ON DELETE CASCADE,
    kind          text NOT NULL,
    title         text NOT NULL,
    body          text,
    link          text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    read_at       timestamptz,
    archived_at   timestamptz
);
CREATE INDEX notifications_inbox_idx ON ekapon.notifications (recipient_id, created_at DESC);

CREATE TRIGGER access_grants_audit AFTER INSERT OR UPDATE OR DELETE ON ekapon.access_grants
    FOR EACH ROW EXECUTE FUNCTION ekapon.audit_row();
CREATE TRIGGER permission_requests_audit AFTER INSERT OR UPDATE OR DELETE ON ekapon.permission_requests
    FOR EACH ROW EXECUTE FUNCTION ekapon.audit_row();
CREATE TRIGGER issue_reports_audit AFTER INSERT OR UPDATE OR DELETE ON ekapon.issue_reports
    FOR EACH ROW EXECUTE FUNCTION ekapon.audit_row();

-- ---------- Internal helpers (not callable by the API login) ---------
CREATE FUNCTION ekapon.actor_account(p_allowed text[]) RETURNS ekapon.accounts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ekapon AS $$
DECLARE v ekapon.accounts;
BEGIN
    SELECT * INTO v FROM ekapon.accounts
     WHERE id = NULLIF(current_setting('app.account_id', true), '')::bigint
       AND archived_at IS NULL AND status = 'Active';
    IF NOT FOUND OR NOT (v.account_type::text = ANY (p_allowed)) THEN
        RAISE EXCEPTION 'You do not have permission to do this.' USING ERRCODE = '42501';
    END IF;
    RETURN v;
END $$;

CREATE FUNCTION ekapon.notify(p_recipient bigint, p_kind text, p_title text, p_body text, p_link text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, ekapon AS $$
    INSERT INTO ekapon.notifications (recipient_id, kind, title, body, link)
    VALUES (p_recipient, p_kind, p_title, p_body, p_link)
$$;

CREATE FUNCTION ekapon.notify_role(p_role text, p_kind text, p_title text, p_body text, p_link text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, ekapon AS $$
    INSERT INTO ekapon.notifications (recipient_id, kind, title, body, link)
    SELECT id, p_kind, p_title, p_body, p_link FROM ekapon.accounts
     WHERE account_type::text = p_role AND status = 'Active' AND archived_at IS NULL
$$;

REVOKE ALL ON FUNCTION ekapon.actor_account(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION ekapon.notify(bigint, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ekapon.notify_role(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ekapon.require_verified_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION ekapon.touch_updated_at() FROM PUBLIC;

-- ---------- Account state (SuperAdmin) --------------------------------
CREATE FUNCTION ekapon.set_account_state(p_account_id bigint, p_state text, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ekapon AS $$
DECLARE v_actor ekapon.accounts; v_target ekapon.accounts;
BEGIN
    v_actor := ekapon.actor_account(ARRAY['SuperAdmin']);
    SELECT * INTO v_target FROM ekapon.accounts WHERE id = p_account_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Account not found.' USING ERRCODE = '22023'; END IF;
    IF v_target.id = v_actor.id OR v_target.account_type = 'SuperAdmin' THEN
        RAISE EXCEPTION 'SuperAdmin accounts cannot be put on hold or disabled.' USING ERRCODE = '42501';
    END IF;
    IF p_state NOT IN ('Active', 'On hold', 'Disabled') THEN
        RAISE EXCEPTION 'Unknown account state.' USING ERRCODE = '22023';
    END IF;
    IF p_state <> 'Active' AND length(btrim(coalesce(p_reason, ''))) < 3 THEN
        RAISE EXCEPTION 'A reason is required.' USING ERRCODE = '22023';
    END IF;
    IF p_state = 'Active' THEN
        IF v_target.password_hash IS NULL THEN
            RAISE EXCEPTION 'This account has no permanent password yet. Issue a new temporary password instead.' USING ERRCODE = '22023';
        END IF;
        UPDATE ekapon.accounts SET status = 'Active', hold_reason = NULL, failed_login_count = 0, locked_until = NULL
         WHERE id = v_target.id;
    ELSE
        UPDATE ekapon.accounts SET status = p_state::ekapon.account_status, hold_reason = btrim(p_reason)
         WHERE id = v_target.id;
    END IF;
    PERFORM ekapon.log_activity('Account set to ' || p_state, coalesce(v_target.account_key, v_target.username));
END $$;

-- ---------- ID-photo functions ---------------------------------------
CREATE FUNCTION ekapon.submit_id_photo(p_image bytea, p_mime text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ekapon AS $$
DECLARE v_user ekapon.accounts; v_id bigint;
BEGIN
    v_user := ekapon.actor_account(ARRAY['User']);
    IF v_user.id_verified_at IS NOT NULL THEN
        RAISE EXCEPTION 'Your ID is already verified.' USING ERRCODE = '22023';
    END IF;
    IF p_mime NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
        RAISE EXCEPTION 'Upload a JPEG, PNG or WebP photo.' USING ERRCODE = '22023';
    END IF;
    IF p_image IS NULL OR octet_length(p_image) = 0 OR octet_length(p_image) > 500000 THEN
        RAISE EXCEPTION 'The photo must be under 500 KB.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM ekapon.id_verifications WHERE user_id = v_user.id AND status = 'pending') THEN
        RAISE EXCEPTION 'You already have an ID photo waiting for review.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO ekapon.id_verifications (user_id, barangay_id, mime, image)
    VALUES (v_user.id, v_user.barangay_id, p_mime, p_image) RETURNING id INTO v_id;
    INSERT INTO ekapon.notifications (recipient_id, kind, title, body, link)
    SELECT a.id, 'id_verification', 'ID photo to review', v_user.full_name || ' submitted a valid ID.', '/id-verification'
      FROM ekapon.accounts a
     WHERE a.account_type = 'Paravet' AND a.barangay_id = v_user.barangay_id
       AND a.status = 'Active' AND a.archived_at IS NULL;
    RETURN v_id;
END $$;

CREATE FUNCTION ekapon.get_id_photo(p_id bigint) RETURNS TABLE (image bytea, mime text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ekapon AS $$
DECLARE v_actor ekapon.accounts; v_row ekapon.id_verifications;
BEGIN
    v_actor := ekapon.actor_account(ARRAY['SuperAdmin', 'Admin', 'Paravet']);
    SELECT * INTO v_row FROM ekapon.id_verifications WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ID photo not found.' USING ERRCODE = '22023'; END IF;
    IF v_actor.account_type = 'Paravet' AND v_actor.barangay_id IS DISTINCT FROM v_row.barangay_id THEN
        RAISE EXCEPTION 'This ID belongs to another barangay.' USING ERRCODE = '42501';
    END IF;
    IF v_row.image IS NULL THEN
        RAISE EXCEPTION 'This photo was deleted after the retention period.' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY SELECT v_row.image, v_row.mime;
END $$;

CREATE FUNCTION ekapon.decide_id_verification(p_id bigint, p_outcome text, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ekapon AS $$
DECLARE v_actor ekapon.accounts; v_row ekapon.id_verifications; v_user ekapon.accounts;
BEGIN
    v_actor := ekapon.actor_account(ARRAY['SuperAdmin', 'Admin', 'Paravet']);
    SELECT * INTO v_row FROM ekapon.id_verifications WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ID verification not found.' USING ERRCODE = '22023'; END IF;
    IF v_actor.account_type = 'Paravet' AND v_actor.barangay_id IS DISTINCT FROM v_row.barangay_id THEN
        RAISE EXCEPTION 'You can only review IDs from your assigned barangay.' USING ERRCODE = '42501';
    END IF;
    IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'This ID was already reviewed.' USING ERRCODE = '22023'; END IF;
    IF p_outcome NOT IN ('verified', 'rejected') THEN RAISE EXCEPTION 'Unknown outcome.' USING ERRCODE = '22023'; END IF;
    IF p_outcome = 'rejected' AND length(btrim(coalesce(p_reason, ''))) < 3 THEN
        RAISE EXCEPTION 'Tell the user why, or ask for a clearer photo.' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_user FROM ekapon.accounts WHERE id = v_row.user_id;
    UPDATE ekapon.id_verifications
       SET status = p_outcome, reviewer_id = v_actor.id, reviewer_name = v_actor.full_name,
           reviewed_at = now(), decision_reason = NULLIF(btrim(coalesce(p_reason, '')), ''),
           purge_after = now() + interval '30 days'
     WHERE id = p_id;
    IF p_outcome = 'verified' THEN
        UPDATE ekapon.accounts SET id_verified_at = now() WHERE id = v_row.user_id;
    END IF;
    INSERT INTO ekapon.id_verification_log (verification_id, user_id, user_name, reviewer_id, reviewer_name, outcome, reason)
    VALUES (p_id, v_row.user_id, v_user.full_name, v_actor.id, v_actor.full_name, p_outcome, NULLIF(btrim(coalesce(p_reason, '')), ''));
    PERFORM ekapon.notify(v_row.user_id, 'id_verification',
        CASE p_outcome WHEN 'verified' THEN 'Your ID is verified' ELSE 'Your ID needs another photo' END,
        CASE p_outcome WHEN 'verified' THEN 'You can now pre-list your pets.' ELSE coalesce(p_reason, '') END, '/account');
END $$;

-- ---------- Census review --------------------------------------------
CREATE FUNCTION ekapon.census_owner_candidates(p_submission uuid)
RETURNS TABLE (census_owner_id uuid, registry_owner_id uuid, owner_name text, address text, pet_count bigint)
LANGUAGE sql STABLE AS $$
    SELECT co.id, ro.id, ro.owner_name, ro.address,
           (SELECT count(*) FROM ekapon.registry_pets p WHERE p.owner_id = ro.id AND p.archived_at IS NULL)
      FROM ekapon.census_owners co
      JOIN ekapon.census_submissions s ON s.id = co.submission_id
      JOIN ekapon.registry_owners ro ON ro.barangay_id = s.barangay_id AND ro.archived_at IS NULL
       AND lower(btrim(ro.owner_name)) = lower(btrim(co.owner_name))
     WHERE co.submission_id = p_submission
$$;

CREATE FUNCTION ekapon.decide_census_submission(p_id uuid, p_decision text, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ekapon AS $$
DECLARE
    v_actor ekapon.accounts; v_sub ekapon.census_submissions;
    v_owner ekapon.census_owners; v_pet ekapon.census_pets;
    v_reg_owner uuid; v_reg_pet uuid;
    v_new integer := 0; v_changed integer := 0; v_skipped integer := 0; v_pets integer := 0;
BEGIN
    v_actor := ekapon.actor_account(ARRAY['SuperAdmin', 'Admin']);
    SELECT * INTO v_sub FROM ekapon.census_submissions WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Census submission not found.' USING ERRCODE = '22023'; END IF;
    IF v_sub.status <> 'pending' THEN
        RAISE EXCEPTION 'This submission was already reviewed or withdrawn.' USING ERRCODE = '22023';
    END IF;
    IF p_decision NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'Unknown decision.' USING ERRCODE = '22023';
    END IF;

    IF p_decision = 'reject' THEN
        IF length(btrim(coalesce(p_note, ''))) < 3 THEN
            RAISE EXCEPTION 'Give the Paravet a reason for rejecting this census.' USING ERRCODE = '22023';
        END IF;
        UPDATE ekapon.census_submissions
           SET status = 'rejected', reviewed_by = v_actor.id, reviewer_name = v_actor.full_name,
               reviewed_at = now(), review_note = btrim(p_note)
         WHERE id = p_id;
    ELSE
        IF EXISTS (SELECT 1 FROM ekapon.census_owners WHERE submission_id = p_id AND decision = 'pending') THEN
            RAISE EXCEPTION 'Choose a decision for every owner before approving.' USING ERRCODE = '22023';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM ekapon.census_owners WHERE submission_id = p_id AND decision IN ('new', 'merge', 'replace')) THEN
            RAISE EXCEPTION 'Nothing to approve. Reject the census instead.' USING ERRCODE = '22023';
        END IF;
        FOR v_owner IN SELECT * FROM ekapon.census_owners
                        WHERE submission_id = p_id AND decision IN ('new', 'merge', 'replace') ORDER BY line_no LOOP
            IF v_owner.decision = 'new' THEN
                INSERT INTO ekapon.registry_owners (barangay_id, owner_name, address, contact, source_submission_id)
                VALUES (v_sub.barangay_id, btrim(v_owner.owner_name), btrim(v_owner.address), v_owner.contact, p_id)
                RETURNING id INTO v_reg_owner;
                v_new := v_new + 1;
            ELSE
                IF v_owner.matched_owner_id IS NULL THEN
                    RAISE EXCEPTION 'Owner on line % needs a matching registry owner.', v_owner.line_no USING ERRCODE = '22023';
                END IF;
                SELECT id INTO v_reg_owner FROM ekapon.registry_owners
                 WHERE id = v_owner.matched_owner_id AND barangay_id = v_sub.barangay_id AND archived_at IS NULL FOR UPDATE;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Owner on line % matches a record from another barangay or an archived record.', v_owner.line_no USING ERRCODE = '22023';
                END IF;
                IF v_owner.decision = 'merge' THEN
                    UPDATE ekapon.registry_owners
                       SET address = CASE WHEN btrim(address) = '' THEN btrim(v_owner.address) ELSE address END,
                           contact = coalesce(contact, v_owner.contact)
                     WHERE id = v_reg_owner;
                ELSE
                    UPDATE ekapon.registry_owners
                       SET address = btrim(v_owner.address), contact = coalesce(v_owner.contact, contact)
                     WHERE id = v_reg_owner;
                END IF;
                v_changed := v_changed + 1;
            END IF;

            FOR v_pet IN SELECT * FROM ekapon.census_pets WHERE owner_id = v_owner.id ORDER BY line_no LOOP
                v_reg_pet := NULL;
                IF v_owner.decision <> 'new' THEN
                    SELECT id INTO v_reg_pet FROM ekapon.registry_pets
                     WHERE owner_id = v_reg_owner AND species = v_pet.species AND archived_at IS NULL
                       AND lower(btrim(pet_name)) = lower(btrim(v_pet.pet_name)) LIMIT 1;
                END IF;
                IF v_reg_pet IS NULL THEN
                    INSERT INTO ekapon.registry_pets (owner_id, pet_name, species, sex, age_months, breed_type, color,
                        sterilized, confinement, vaccine_1st, vaccine_2nd, vaccine_3rd, vaccine_other, booster, laps,
                        registered_year, remarks)
                    VALUES (v_reg_owner, btrim(v_pet.pet_name), v_pet.species, v_pet.sex, v_pet.age_months, v_pet.breed_type,
                        v_pet.color, v_pet.sterilized, v_pet.confinement, v_pet.vaccine_1st, v_pet.vaccine_2nd,
                        v_pet.vaccine_3rd, v_pet.vaccine_other, v_pet.booster, v_pet.laps, v_pet.registered_year, v_pet.remarks);
                    v_pets := v_pets + 1;
                ELSIF v_owner.decision = 'merge' THEN
                    UPDATE ekapon.registry_pets SET
                        age_months = coalesce(age_months, v_pet.age_months), breed_type = coalesce(breed_type, v_pet.breed_type),
                        color = coalesce(color, v_pet.color), confinement = coalesce(confinement, v_pet.confinement),
                        vaccine_other = coalesce(vaccine_other, v_pet.vaccine_other),
                        registered_year = coalesce(registered_year, v_pet.registered_year), remarks = coalesce(remarks, v_pet.remarks),
                        sterilized = sterilized OR v_pet.sterilized, vaccine_1st = vaccine_1st OR v_pet.vaccine_1st,
                        vaccine_2nd = vaccine_2nd OR v_pet.vaccine_2nd, vaccine_3rd = vaccine_3rd OR v_pet.vaccine_3rd,
                        booster = booster OR v_pet.booster, laps = laps OR v_pet.laps
                     WHERE id = v_reg_pet;
                ELSE
                    UPDATE ekapon.registry_pets SET
                        sex = v_pet.sex, age_months = coalesce(v_pet.age_months, age_months),
                        breed_type = coalesce(v_pet.breed_type, breed_type), color = coalesce(v_pet.color, color),
                        confinement = coalesce(v_pet.confinement, confinement), vaccine_other = coalesce(v_pet.vaccine_other, vaccine_other),
                        registered_year = coalesce(v_pet.registered_year, registered_year), remarks = coalesce(v_pet.remarks, remarks),
                        sterilized = v_pet.sterilized, vaccine_1st = v_pet.vaccine_1st, vaccine_2nd = v_pet.vaccine_2nd,
                        vaccine_3rd = v_pet.vaccine_3rd, booster = v_pet.booster, laps = v_pet.laps
                     WHERE id = v_reg_pet;
                END IF;
            END LOOP;
        END LOOP;
        SELECT count(*) INTO v_skipped FROM ekapon.census_owners WHERE submission_id = p_id AND decision IN ('keep', 'reject');
        UPDATE ekapon.census_submissions
           SET status = 'approved', reviewed_by = v_actor.id, reviewer_name = v_actor.full_name,
               reviewed_at = now(), review_note = NULLIF(btrim(coalesce(p_note, '')), '')
         WHERE id = p_id;
    END IF;

    UPDATE ekapon.census_attachments SET purge_after = now() + interval '30 days' WHERE submission_id = p_id;
    IF v_sub.submitted_by IS NOT NULL THEN
        PERFORM ekapon.notify(v_sub.submitted_by, 'census',
            CASE p_decision WHEN 'approve' THEN 'Census approved' ELSE 'Census rejected' END,
            v_sub.label || CASE WHEN p_note IS NOT NULL AND btrim(p_note) <> '' THEN ' - ' || btrim(p_note) ELSE '' END,
            '/census/mine/' || p_id);
    END IF;
    PERFORM ekapon.log_activity('Census ' || p_decision || 'd', p_id::text);
    RETURN jsonb_build_object('status', CASE p_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END,
        'newOwners', v_new, 'updatedOwners', v_changed, 'skippedOwners', v_skipped, 'newPets', v_pets);
END $$;

CREATE FUNCTION ekapon.notify_census_submitted(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ekapon AS $$
DECLARE v_actor ekapon.accounts; v_sub ekapon.census_submissions;
BEGIN
    v_actor := ekapon.actor_account(ARRAY['Paravet']);
    SELECT * INTO v_sub FROM ekapon.census_submissions WHERE id = p_id AND submitted_by = v_actor.id AND status = 'pending';
    IF NOT FOUND THEN RAISE EXCEPTION 'Census submission not found.' USING ERRCODE = '22023'; END IF;
    PERFORM ekapon.notify_role('Admin', 'census', 'Census to review', v_actor.full_name || ' submitted ' || v_sub.label || '.', '/census/review/pending/' || p_id);
    PERFORM ekapon.notify_role('SuperAdmin', 'census', 'Census to review', v_actor.full_name || ' submitted ' || v_sub.label || '.', '/census/review/pending/' || p_id);
END $$;

-- ---------- Census output views --------------------------------------
-- Households come from approved submissions in the chosen year; animal counts come from
-- the approved registry as it stands now. NULL barangay = whole city.
CREATE FUNCTION ekapon.census_front_page(p_barangay_id integer, p_year integer)
RETURNS TABLE (
    households integer, pet_owners integer, dogs integer, dogs_male integer, dogs_female integer,
    cats integer, cats_male integer, cats_female integer,
    spayed_female_dogs integer, castrated_male_dogs integer, spayed_female_cats integer, castrated_male_cats integer,
    registered_dogs integer, confined_dogs integer, confined_cats integer,
    semi_confined_dogs integer, semi_confined_cats integer, free_roaming_dogs integer, free_roaming_cats integer,
    booster_dogs integer, booster_cats integer, laps_dogs integer, laps_cats integer)
LANGUAGE sql STABLE AS $$
    WITH pets AS (
        SELECT p.*, o.barangay_id FROM ekapon.registry_pets p
          JOIN ekapon.registry_owners o ON o.id = p.owner_id
         WHERE o.archived_at IS NULL AND p.archived_at IS NULL
           AND (p_barangay_id IS NULL OR o.barangay_id = p_barangay_id))
    SELECT
        coalesce((SELECT sum(households_visited) FROM ekapon.census_submissions
                   WHERE status = 'approved' AND extract(year FROM census_date) = p_year
                     AND (p_barangay_id IS NULL OR barangay_id = p_barangay_id)), 0)::integer,
        (SELECT count(*) FROM ekapon.registry_owners o
          WHERE o.archived_at IS NULL AND (p_barangay_id IS NULL OR o.barangay_id = p_barangay_id)
            AND EXISTS (SELECT 1 FROM pets WHERE pets.owner_id = o.id))::integer,
        count(*) FILTER (WHERE species = 'Dog')::integer,
        count(*) FILTER (WHERE species = 'Dog' AND sex = 'Male')::integer,
        count(*) FILTER (WHERE species = 'Dog' AND sex = 'Female')::integer,
        count(*) FILTER (WHERE species = 'Cat')::integer,
        count(*) FILTER (WHERE species = 'Cat' AND sex = 'Male')::integer,
        count(*) FILTER (WHERE species = 'Cat' AND sex = 'Female')::integer,
        count(*) FILTER (WHERE species = 'Dog' AND sex = 'Female' AND sterilized)::integer,
        count(*) FILTER (WHERE species = 'Dog' AND sex = 'Male' AND sterilized)::integer,
        count(*) FILTER (WHERE species = 'Cat' AND sex = 'Female' AND sterilized)::integer,
        count(*) FILTER (WHERE species = 'Cat' AND sex = 'Male' AND sterilized)::integer,
        count(*) FILTER (WHERE species = 'Dog' AND registered_year = p_year)::integer,
        count(*) FILTER (WHERE species = 'Dog' AND confinement = 'Confined')::integer,
        count(*) FILTER (WHERE species = 'Cat' AND confinement = 'Confined')::integer,
        count(*) FILTER (WHERE species = 'Dog' AND confinement = 'Semi-confined')::integer,
        count(*) FILTER (WHERE species = 'Cat' AND confinement = 'Semi-confined')::integer,
        count(*) FILTER (WHERE species = 'Dog' AND confinement = 'Free-roaming')::integer,
        count(*) FILTER (WHERE species = 'Cat' AND confinement = 'Free-roaming')::integer,
        count(*) FILTER (WHERE species = 'Dog' AND booster)::integer,
        count(*) FILTER (WHERE species = 'Cat' AND booster)::integer,
        count(*) FILTER (WHERE species = 'Dog' AND laps)::integer,
        count(*) FILTER (WHERE species = 'Cat' AND laps)::integer
      FROM pets
$$;

CREATE VIEW ekapon.census_summary_v AS
SELECT o.id AS owner_id, o.barangay_id, o.owner_name,
    count(p.id) FILTER (WHERE p.species = 'Dog') AS dogs,
    count(p.id) FILTER (WHERE p.species = 'Cat') AS cats,
    count(p.id) FILTER (WHERE p.species = 'Dog' AND p.sex = 'Male') AS male_dogs,
    count(p.id) FILTER (WHERE p.species = 'Cat' AND p.sex = 'Male') AS male_cats,
    count(p.id) FILTER (WHERE p.species = 'Dog' AND p.sex = 'Female') AS female_dogs,
    count(p.id) FILTER (WHERE p.species = 'Cat' AND p.sex = 'Female') AS female_cats,
    count(p.id) FILTER (WHERE p.species = 'Dog' AND p.sex = 'Male' AND p.sterilized) AS castrated_dogs,
    count(p.id) FILTER (WHERE p.species = 'Cat' AND p.sex = 'Male' AND p.sterilized) AS castrated_cats,
    count(p.id) FILTER (WHERE p.species = 'Dog' AND p.sex = 'Female' AND p.sterilized) AS spayed_dogs,
    count(p.id) FILTER (WHERE p.species = 'Cat' AND p.sex = 'Female' AND p.sterilized) AS spayed_cats,
    count(p.id) FILTER (WHERE p.species = 'Dog' AND p.confinement = 'Confined') AS confined_dogs,
    count(p.id) FILTER (WHERE p.species = 'Cat' AND p.confinement = 'Confined') AS confined_cats,
    count(p.id) FILTER (WHERE p.species = 'Dog' AND p.confinement = 'Semi-confined') AS semi_confined_dogs,
    count(p.id) FILTER (WHERE p.species = 'Cat' AND p.confinement = 'Semi-confined') AS semi_confined_cats,
    count(p.id) FILTER (WHERE p.species = 'Dog' AND p.confinement = 'Free-roaming') AS free_roaming_dogs,
    count(p.id) FILTER (WHERE p.species = 'Cat' AND p.confinement = 'Free-roaming') AS free_roaming_cats,
    count(p.id) FILTER (WHERE p.species = 'Dog' AND p.vaccine_1st) AS first_year_dogs,
    count(p.id) FILTER (WHERE p.species = 'Cat' AND p.vaccine_1st) AS first_year_cats,
    count(p.id) FILTER (WHERE p.species = 'Dog' AND p.vaccine_2nd) AS second_year_dogs,
    count(p.id) FILTER (WHERE p.species = 'Cat' AND p.vaccine_2nd) AS second_year_cats,
    count(p.id) FILTER (WHERE p.species = 'Dog' AND p.vaccine_3rd) AS third_year_dogs,
    count(p.id) FILTER (WHERE p.species = 'Cat' AND p.vaccine_3rd) AS third_year_cats,
    count(p.id) FILTER (WHERE p.species = 'Dog' AND p.vaccine_other IS NOT NULL) AS other_dogs,
    count(p.id) FILTER (WHERE p.species = 'Cat' AND p.vaccine_other IS NOT NULL) AS other_cats
  FROM ekapon.registry_owners o
  LEFT JOIN ekapon.registry_pets p ON p.owner_id = o.id AND p.archived_at IS NULL
 WHERE o.archived_at IS NULL
 GROUP BY o.id;

-- ---------- Access grants and permission requests ---------------------
CREATE FUNCTION ekapon.has_grant(p_account bigint, p_permission text, p_barangay integer DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, ekapon AS $$
    SELECT EXISTS (SELECT 1 FROM ekapon.access_grants
                    WHERE grantee_id = p_account AND permission = p_permission
                      AND revoked_at IS NULL AND expires_at > now()
                      AND (barangay_id IS NULL OR barangay_id = p_barangay))
$$;

CREATE FUNCTION ekapon.grant_access(p_grantee bigint, p_permission text, p_barangay integer, p_reason text, p_days integer)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ekapon AS $$
DECLARE v_actor ekapon.accounts; v_target ekapon.accounts; v_id bigint;
BEGIN
    v_actor := ekapon.actor_account(ARRAY['SuperAdmin']);
    SELECT * INTO v_target FROM ekapon.accounts WHERE id = p_grantee AND archived_at IS NULL AND status = 'Active';
    IF NOT FOUND OR v_target.account_type::text NOT IN ('Admin', 'Paravet') THEN
        RAISE EXCEPTION 'Access can only be granted to active Admin or Paravet accounts.' USING ERRCODE = '22023';
    END IF;
    IF p_days IS NULL OR p_days < 1 OR p_days > 30 THEN
        RAISE EXCEPTION 'Choose a duration from 1 to 30 days.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO ekapon.access_grants (grantee_id, permission, barangay_id, reason, granted_by, granted_by_name, expires_at)
    VALUES (p_grantee, p_permission, p_barangay, p_reason, v_actor.id, v_actor.full_name, now() + make_interval(days => p_days))
    RETURNING id INTO v_id;
    PERFORM ekapon.notify(p_grantee, 'access', 'Temporary access granted',
        p_permission || ' for ' || p_days || ' day(s): ' || p_reason, '/access');
    PERFORM ekapon.log_activity('Access granted: ' || p_permission, coalesce(v_target.account_key, v_target.username));
    RETURN v_id;
END $$;

CREATE FUNCTION ekapon.revoke_access(p_grant bigint, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ekapon AS $$
DECLARE v_actor ekapon.accounts; v_row ekapon.access_grants;
BEGIN
    v_actor := ekapon.actor_account(ARRAY['SuperAdmin']);
    IF length(btrim(coalesce(p_reason, ''))) < 3 THEN
        RAISE EXCEPTION 'A reason is required.' USING ERRCODE = '22023';
    END IF;
    UPDATE ekapon.access_grants SET revoked_at = now(), revoked_by_name = v_actor.full_name, revoke_reason = btrim(p_reason)
     WHERE id = p_grant AND revoked_at IS NULL RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'Grant not found or already revoked.' USING ERRCODE = '22023'; END IF;
    PERFORM ekapon.notify(v_row.grantee_id, 'access', 'Temporary access revoked', v_row.permission || ': ' || btrim(p_reason), '/access');
    PERFORM ekapon.log_activity('Access revoked: ' || v_row.permission, p_grant::text);
END $$;

CREATE FUNCTION ekapon.request_permission(p_permission text, p_barangay integer, p_reason text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ekapon AS $$
DECLARE v_actor ekapon.accounts; v_id bigint;
BEGIN
    v_actor := ekapon.actor_account(ARRAY['Admin']);
    INSERT INTO ekapon.permission_requests (requester_id, requester_name, permission, barangay_id, reason)
    VALUES (v_actor.id, v_actor.full_name, p_permission, p_barangay, btrim(p_reason)) RETURNING id INTO v_id;
    PERFORM ekapon.notify_role('SuperAdmin', 'permission_request', 'Permission request',
        v_actor.full_name || ' asked for ' || p_permission || '.', '/access');
    RETURN v_id;
END $$;

CREATE FUNCTION ekapon.decide_permission_request(p_id bigint, p_approve boolean, p_reason text, p_remarks text, p_days integer DEFAULT 7)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ekapon AS $$
DECLARE v_actor ekapon.accounts; v_req ekapon.permission_requests; v_grant bigint;
BEGIN
    v_actor := ekapon.actor_account(ARRAY['SuperAdmin']);
    IF length(btrim(coalesce(p_reason, ''))) < 3 OR length(btrim(coalesce(p_remarks, ''))) < 1 THEN
        RAISE EXCEPTION 'A decision needs both a reason and remarks.' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_req FROM ekapon.permission_requests WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR v_req.status <> 'pending' THEN
        RAISE EXCEPTION 'This request was already decided.' USING ERRCODE = '22023';
    END IF;
    IF p_approve THEN
        v_grant := ekapon.grant_access(v_req.requester_id, v_req.permission, v_req.barangay_id, v_req.reason, p_days);
    END IF;
    UPDATE ekapon.permission_requests
       SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
           decided_by_name = v_actor.full_name, decided_at = now(),
           decision_reason = btrim(p_reason), remarks = btrim(p_remarks), grant_id = v_grant
     WHERE id = p_id;
    PERFORM ekapon.notify(v_req.requester_id, 'permission_request',
        CASE WHEN p_approve THEN 'Permission request approved' ELSE 'Permission request rejected' END,
        btrim(p_reason) || ' - ' || btrim(p_remarks), '/access');
END $$;

-- ---------- Issue reports ---------------------------------------------
CREATE FUNCTION ekapon.submit_issue_report(p_title text, p_description text, p_severity text DEFAULT 'normal')
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ekapon AS $$
DECLARE v_actor ekapon.accounts; v_id bigint;
BEGIN
    v_actor := ekapon.actor_account(ARRAY['Admin', 'Paravet']);
    INSERT INTO ekapon.issue_reports (reporter_id, reporter_name, title, description, severity)
    VALUES (v_actor.id, v_actor.full_name, btrim(p_title), btrim(p_description), p_severity) RETURNING id INTO v_id;
    PERFORM ekapon.notify_role('SuperAdmin', 'issue', 'Technical issue reported', v_actor.full_name || ': ' || btrim(p_title), '/issues');
    RETURN v_id;
END $$;

CREATE FUNCTION ekapon.update_issue_report(p_id bigint, p_status text, p_resolution text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ekapon AS $$
DECLARE v_actor ekapon.accounts; v_row ekapon.issue_reports;
BEGIN
    v_actor := ekapon.actor_account(ARRAY['SuperAdmin']);
    IF p_status IN ('resolved', 'dismissed') AND length(btrim(coalesce(p_resolution, ''))) < 3 THEN
        RAISE EXCEPTION 'Add a short note explaining the outcome.' USING ERRCODE = '22023';
    END IF;
    UPDATE ekapon.issue_reports
       SET status = p_status, resolution = NULLIF(btrim(coalesce(p_resolution, '')), ''),
           resolved_by_name = CASE WHEN p_status IN ('resolved', 'dismissed') THEN v_actor.full_name END,
           resolved_at = CASE WHEN p_status IN ('resolved', 'dismissed') THEN now() END
     WHERE id = p_id RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'Issue report not found.' USING ERRCODE = '22023'; END IF;
    IF v_row.reporter_id IS NOT NULL THEN
        PERFORM ekapon.notify(v_row.reporter_id, 'issue', 'Your issue report is ' || replace(p_status, '_', ' '), v_row.title, '/issues');
    END IF;
END $$;

-- ---------- Daily maintenance (called by the Vercel cron; also keeps the project awake) ----
CREATE FUNCTION ekapon.run_daily_maintenance() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, ekapon AS $$
DECLARE v_ids integer; v_census integer;
BEGIN
    UPDATE ekapon.id_verifications SET image = NULL, purged_at = now()
     WHERE image IS NOT NULL AND purge_after IS NOT NULL AND purge_after <= now();
    GET DIAGNOSTICS v_ids = ROW_COUNT;
    DELETE FROM ekapon.census_attachments WHERE purge_after IS NOT NULL AND purge_after <= now();
    GET DIAGNOSTICS v_census = ROW_COUNT;
    DELETE FROM ekapon.notifications WHERE read_at IS NOT NULL AND created_at < now() - interval '90 days';
    UPDATE ekapon.system_settings SET setting_value = to_jsonb(now()), updated_at = now()
     WHERE setting_key = 'last_maintenance_at';
    RETURN jsonb_build_object('idPhotosPurged', v_ids, 'censusImagesPurged', v_census, 'at', now());
END $$;

-- ---------- Replace two baseline functions so "On hold" is honoured ----
CREATE OR REPLACE FUNCTION ekapon.verify_password(p_login text, p_password text, p_ip inet DEFAULT NULL)
RETURNS TABLE (o_ok boolean, o_reason text, o_account_id bigint)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, ekapon, extensions
AS $$
DECLARE
    v_account ekapon.accounts%ROWTYPE;
    v_max_attempts integer := ekapon.setting_int('max_login_attempts');
    v_reason text;
BEGIN
    SELECT * INTO v_account
      FROM ekapon.accounts
     WHERE (lower(username) = lower(p_login) OR account_key = upper(btrim(p_login)))
       AND archived_at IS NULL
     FOR UPDATE;
    IF NOT FOUND THEN
        PERFORM ekapon.log_login_attempt(p_login, NULL, 'permanent', false, 'unknown account', p_ip);
        RETURN QUERY SELECT false, 'invalid'::text, NULL::bigint;
        RETURN;
    END IF;
    v_reason := CASE
        WHEN v_account.status = 'Disabled' THEN 'disabled'
        WHEN v_account.status = 'On hold' THEN 'on_hold'
        WHEN v_account.status = 'Locked' OR v_account.locked_until > now() THEN 'locked'
        WHEN v_account.status IN ('Temporary password pending', 'Temporary password expired') THEN 'use_temporary_password'
        WHEN v_account.status = 'Password reset required' THEN 'must_reset'
    END;
    IF v_reason IS NOT NULL THEN
        PERFORM ekapon.log_login_attempt(p_login, v_account.id, 'permanent', false, v_reason, p_ip);
        RETURN QUERY SELECT false, v_reason, v_account.id;
        RETURN;
    END IF;

    IF v_account.password_hash IS NOT NULL
       AND extensions.crypt(COALESCE(p_password, ''), v_account.password_hash) = v_account.password_hash THEN
        UPDATE ekapon.accounts
           SET failed_login_count = 0, locked_until = NULL, last_login_at = now()
         WHERE id = v_account.id;
        PERFORM ekapon.log_login_attempt(p_login, v_account.id, 'permanent', true, NULL, p_ip);
        RETURN QUERY SELECT true, 'ok'::text, v_account.id;
        RETURN;
    END IF;

    UPDATE ekapon.accounts
       SET locked_until = CASE WHEN failed_login_count + 1 >= v_max_attempts
                               THEN now() + interval '15 minutes' ELSE locked_until END,
           failed_login_count = CASE WHEN failed_login_count + 1 >= v_max_attempts
                                     THEN 0 ELSE failed_login_count + 1 END
     WHERE id = v_account.id;
    PERFORM ekapon.log_login_attempt(p_login, v_account.id, 'permanent', false, 'invalid', p_ip);
    RETURN QUERY SELECT false, 'invalid'::text, v_account.id;
END
$$;

CREATE OR REPLACE FUNCTION ekapon.issue_temp_password(p_account_id bigint)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, ekapon, extensions
AS $$
DECLARE
    v_account ekapon.accounts%ROWTYPE;
    v_password text := '';
    v_alphabet constant text := 'ABCDEFGHJKLMNPQRTUVWXYabcdefghjkmnpqrtuvwxy346789';
    v_byte integer;
    v_limit integer := (256 / length(v_alphabet)) * length(v_alphabet);
BEGIN
    SELECT * INTO STRICT v_account FROM ekapon.accounts WHERE id = p_account_id FOR UPDATE;
    IF v_account.account_type NOT IN ('Paravet', 'User')
       OR v_account.status IN ('Disabled', 'On hold')
       OR v_account.archived_at IS NOT NULL THEN
        RAISE EXCEPTION 'Temporary passwords are only for active portal accounts.' USING ERRCODE = '22023';
    END IF;

    UPDATE ekapon.temp_credentials
       SET destroyed_at = COALESCE(destroyed_at, now())
     WHERE account_id = p_account_id AND used_at IS NULL AND destroyed_at IS NULL;

    WHILE length(v_password) < 8 LOOP
        v_byte := get_byte(extensions.gen_random_bytes(1), 0);
        IF v_byte < v_limit THEN
            v_password := v_password || substr(v_alphabet, (v_byte % length(v_alphabet)) + 1, 1);
        END IF;
    END LOOP;
    v_password := substr(v_password, 1, 4) || '-' || substr(v_password, 5, 4);

    INSERT INTO ekapon.temp_credentials (account_id, password_hash, expires_at)
    VALUES (p_account_id, extensions.crypt(v_password, extensions.gen_salt('bf', 12)), now() + interval '15 minutes');

    UPDATE ekapon.accounts
       SET status = 'Temporary password pending', password_hash = NULL,
           failed_login_count = 0, locked_until = NULL
     WHERE id = p_account_id;
    RETURN v_password;
END
$$;

-- ---------- Privileges for the API login ------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ekapon.census_submissions, ekapon.census_owners, ekapon.census_pets TO ekapon_admin;
GRANT SELECT, INSERT, DELETE ON ekapon.census_attachments TO ekapon_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ekapon.registry_owners, ekapon.registry_pets TO ekapon_admin;
-- The API can never read ID photo bytes directly; it must call get_id_photo().
GRANT SELECT (id, user_id, barangay_id, mime, status, reviewer_id, reviewer_name, reviewed_at,
              decision_reason, submitted_at, purge_after, purged_at) ON ekapon.id_verifications TO ekapon_admin;
GRANT SELECT ON ekapon.id_verification_log, ekapon.access_grants, ekapon.permission_requests,
                ekapon.issue_reports, ekapon.census_summary_v TO ekapon_admin;
GRANT SELECT ON ekapon.notifications TO ekapon_admin;
GRANT UPDATE (read_at, archived_at) ON ekapon.notifications TO ekapon_admin;
GRANT USAGE, SELECT ON SEQUENCE ekapon.census_attachments_id_seq TO ekapon_admin;
GRANT EXECUTE ON FUNCTION
    ekapon.set_account_state(bigint, text, text),
    ekapon.submit_id_photo(bytea, text),
    ekapon.get_id_photo(bigint),
    ekapon.decide_id_verification(bigint, text, text),
    ekapon.census_owner_candidates(uuid),
    ekapon.decide_census_submission(uuid, text, text),
    ekapon.notify_census_submitted(uuid),
    ekapon.census_front_page(integer, integer),
    ekapon.has_grant(bigint, text, integer),
    ekapon.grant_access(bigint, text, integer, text, integer),
    ekapon.revoke_access(bigint, text),
    ekapon.request_permission(text, integer, text),
    ekapon.decide_permission_request(bigint, boolean, text, text, integer),
    ekapon.submit_issue_report(text, text, text),
    ekapon.update_issue_report(bigint, text, text),
    ekapon.run_daily_maintenance()
TO ekapon_admin;

COMMIT;
