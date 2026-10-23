BEGIN;
-- Confirmed snapshots survive later registry changes. Images are never part of this workflow.
CREATE TABLE IF NOT EXISTS ekapon.standalone_services (
 id uuid PRIMARY KEY,
 actor_id bigint NOT NULL REFERENCES ekapon.accounts(id) ON DELETE RESTRICT,
 payload_hash text NOT NULL,
 owner_record_id text NOT NULL,
 owner_snapshot jsonb NOT NULL CHECK (jsonb_typeof(owner_snapshot)='object'),
 pets_snapshot jsonb NOT NULL CHECK (jsonb_typeof(pets_snapshot)='array' AND jsonb_array_length(pets_snapshot) BETWEEN 1 AND 30),
 served_on date NOT NULL,
 location text NOT NULL CHECK(length(btrim(location)) BETWEEN 1 AND 300),
 provider text NOT NULL CHECK(length(btrim(provider)) BETWEEN 1 AND 120),
 note text NOT NULL DEFAULT '',duplicate_reason text,
 status text NOT NULL DEFAULT 'Submitted' CHECK(status IN ('Submitted','Voided')),
 created_at timestamptz NOT NULL DEFAULT now(),
 voided_by bigint REFERENCES ekapon.accounts(id) ON DELETE RESTRICT,
 voided_at timestamptz,void_reason text,
 CHECK ((status='Submitted' AND voided_by IS NULL AND voided_at IS NULL AND void_reason IS NULL)
   OR (status='Voided' AND voided_by IS NOT NULL AND voided_at IS NOT NULL AND length(btrim(void_reason))>=3))
);
CREATE INDEX IF NOT EXISTS standalone_services_owner_date_idx ON ekapon.standalone_services(owner_record_id,served_on) WHERE status='Submitted';
CREATE INDEX IF NOT EXISTS standalone_services_date_idx ON ekapon.standalone_services(served_on DESC,id);
GRANT SELECT,INSERT,UPDATE ON ekapon.standalone_services TO ekapon_admin;

CREATE OR REPLACE FUNCTION ekapon.field_record_navigation_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,ekapon AS $$
DECLARE item jsonb; area integer;
BEGIN
 FOR item IN SELECT value FROM jsonb_array_elements(CASE WHEN TG_OP='INSERT' THEN jsonb_build_array(to_jsonb(NEW)) WHEN TG_OP='DELETE' THEN jsonb_build_array(to_jsonb(OLD)) ELSE jsonb_build_array(to_jsonb(OLD),to_jsonb(NEW)) END) LOOP
  IF TG_TABLE_NAME='standalone_services' THEN
   area:=coalesce(ekapon.find_barangay(item->'owner_snapshot'->>'barangay'),0);
   PERFORM ekapon.touch_navigation('services',area);PERFORM ekapon.touch_navigation('reports',area);
  ELSIF item->>'status'='approved' THEN
   PERFORM ekapon.touch_navigation('respondents',(item->>'barangay_id')::integer);
  END IF;
 END LOOP;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS field_record_navigation ON ekapon.standalone_services;
CREATE TRIGGER field_record_navigation AFTER INSERT OR UPDATE OR DELETE ON ekapon.standalone_services FOR EACH ROW EXECUTE FUNCTION ekapon.field_record_navigation_trigger();
DROP TRIGGER IF EXISTS field_record_navigation ON ekapon.census_submissions;
CREATE TRIGGER field_record_navigation AFTER INSERT OR UPDATE OR DELETE ON ekapon.census_submissions FOR EACH ROW EXECUTE FUNCTION ekapon.field_record_navigation_trigger();
COMMIT;
