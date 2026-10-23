BEGIN;
-- Stable aliases keep the staff workspace editable without name-based copying.
CREATE TABLE IF NOT EXISTS ekapon.registry_source_links (
 dataset text NOT NULL CHECK(dataset IN ('owners','pets')),
 source_id uuid NOT NULL,record_id text NOT NULL,
 PRIMARY KEY(dataset,source_id),UNIQUE(dataset,record_id)
);
GRANT SELECT,INSERT ON ekapon.registry_source_links TO ekapon_admin;
ALTER TABLE ekapon.census_review_snapshots ADD COLUMN IF NOT EXISTS before_workspace jsonb,ADD COLUMN IF NOT EXISTS after_workspace jsonb;

CREATE OR REPLACE FUNCTION ekapon.publish_registry_owner(p_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE o record; target text; p record;
BEGIN
 SELECT r.*,b.name AS barangay FROM ekapon.registry_owners r JOIN ekapon.barangays b ON b.id=r.barangay_id WHERE r.id=p_id INTO o;
 IF NOT FOUND THEN RETURN; END IF;
 INSERT INTO ekapon.registry_source_links(dataset,source_id,record_id) VALUES('owners',p_id,'census-owner:'||p_id) ON CONFLICT DO NOTHING;
 SELECT record_id INTO target FROM ekapon.registry_source_links WHERE dataset='owners' AND source_id=p_id;
 INSERT INTO ekapon.dashboard_records AS d(dataset,record_id,record_data,archived)
 VALUES('owners',target,jsonb_build_object('id',target,'name',o.owner_name,'address',o.address,'contact',coalesce(o.contact,''),'barangay',o.barangay,'barangayId',o.barangay_id,'source',CASE WHEN o.source_submission_id IS NULL THEN 'Staff registry' ELSE 'Approved census' END,'sourceSubmissionId',o.source_submission_id,'_censusSourceId',p_id),o.archived_at IS NOT NULL)
 ON CONFLICT(dataset,record_id) DO UPDATE SET record_data=(d.record_data-'_censusWithdrawn')||excluded.record_data,archived=excluded.archived,updated_at=now();
END $$;
CREATE OR REPLACE FUNCTION ekapon.publish_registry_pet(p_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE p record; target text; owner_target text;
BEGIN
 SELECT r.*,o.owner_name,o.barangay_id,b.name AS barangay,o.archived_at AS owner_archived FROM ekapon.registry_pets r JOIN ekapon.registry_owners o ON o.id=r.owner_id JOIN ekapon.barangays b ON b.id=o.barangay_id WHERE r.id=p_id INTO p;
 IF NOT FOUND THEN RETURN; END IF;
 PERFORM ekapon.publish_registry_owner(p.owner_id);
 SELECT record_id INTO owner_target FROM ekapon.registry_source_links WHERE dataset='owners' AND source_id=p.owner_id;
 INSERT INTO ekapon.registry_source_links(dataset,source_id,record_id) VALUES('pets',p_id,'census-pet:'||p_id) ON CONFLICT DO NOTHING;
 SELECT record_id INTO target FROM ekapon.registry_source_links WHERE dataset='pets' AND source_id=p_id;
 INSERT INTO ekapon.dashboard_records AS d(dataset,record_id,record_data,archived)
 VALUES('pets',target,jsonb_build_object('id',target,'petName',p.pet_name,'owner_id',owner_target,'owner',p.owner_name,'barangay',p.barangay,'barangayId',p.barangay_id,'species',p.species,'sex',p.sex,'age_months',p.age_months,'breed_type',p.breed_type,'color',p.color,'sterilized',p.sterilized,'confinement',p.confinement,'vaccine_1st',p.vaccine_1st,'vaccine_2nd',p.vaccine_2nd,'vaccine_3rd',p.vaccine_3rd,'vaccine_other',p.vaccine_other,'booster',p.booster,'laps',p.laps,'registered_year',p.registered_year,'remarks',p.remarks,'_censusSourceId',p_id),p.archived_at IS NOT NULL OR p.owner_archived IS NOT NULL)
 ON CONFLICT(dataset,record_id) DO UPDATE SET record_data=(d.record_data-'_censusWithdrawn')||excluded.record_data,archived=excluded.archived,updated_at=now();
END $$;
CREATE OR REPLACE FUNCTION ekapon.registry_to_workspace() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind text; p record;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('registry-owner-pet-writes'));
 kind:=CASE WHEN TG_TABLE_NAME='registry_owners' THEN 'owners' ELSE 'pets' END;
 IF TG_OP='DELETE' THEN
  UPDATE ekapon.dashboard_records d SET archived=true,record_data=record_data||'{"_censusWithdrawn":true}'::jsonb,updated_at=now()
  FROM ekapon.registry_source_links l WHERE l.dataset=kind AND l.source_id=OLD.id AND d.dataset=l.dataset AND d.record_id=l.record_id;
  RETURN OLD;
 END IF;
 IF kind='owners' THEN
  PERFORM ekapon.publish_registry_owner(NEW.id);
  FOR p IN SELECT id FROM ekapon.registry_pets WHERE owner_id=NEW.id LOOP PERFORM ekapon.publish_registry_pet(p.id); END LOOP;
 ELSE PERFORM ekapon.publish_registry_pet(NEW.id); END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS registry_owner_workspace ON ekapon.registry_owners;
CREATE TRIGGER registry_owner_workspace AFTER INSERT OR UPDATE OR DELETE ON ekapon.registry_owners FOR EACH ROW EXECUTE FUNCTION ekapon.registry_to_workspace();
DROP TRIGGER IF EXISTS registry_pet_workspace ON ekapon.registry_pets;
CREATE TRIGGER registry_pet_workspace AFTER INSERT OR UPDATE OR DELETE ON ekapon.registry_pets FOR EACH ROW EXECUTE FUNCTION ekapon.registry_to_workspace();
-- Existing approved census registry records gain aliases; existing staff records remain separate.
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT id FROM ekapon.registry_owners LOOP PERFORM ekapon.publish_registry_owner(r.id); END LOOP;
 FOR r IN SELECT id FROM ekapon.registry_pets LOOP PERFORM ekapon.publish_registry_pet(r.id); END LOOP;
END $$;
COMMIT;
