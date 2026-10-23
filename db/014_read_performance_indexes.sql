-- Lookup indexes only. Preserve every owner/pet relationship and historical row.
BEGIN;
CREATE INDEX IF NOT EXISTS dashboard_owner_name_barangay_lookup_idx
  ON ekapon.dashboard_records(lower(record_data->>'name'),lower(coalesce(record_data->>'barangay','')))
  WHERE dataset='owners' AND archived=false;
CREATE INDEX IF NOT EXISTS dashboard_pet_owner_id_lookup_idx
  ON ekapon.dashboard_records((record_data->>'owner_id'))
  WHERE dataset='pets' AND archived=false;
CREATE INDEX IF NOT EXISTS dashboard_pet_owner_name_lookup_idx
  ON ekapon.dashboard_records(lower(coalesce(record_data->>'owner',record_data->>'owner_name','')))
  WHERE dataset='pets' AND archived=false;
COMMIT;
