-- Prepared for local disposable validation only. No data or identity changes.
-- These orderings match bounded Recent updates and the default registry list.
BEGIN;
CREATE INDEX IF NOT EXISTS dashboard_registry_recent_order_idx
  ON ekapon.dashboard_records(dataset,updated_at DESC,record_id)
  WHERE dataset IN ('owners','pets');
CREATE INDEX IF NOT EXISTS dashboard_registry_list_order_idx
  ON ekapon.dashboard_records(dataset,archived,updated_at DESC NULLS LAST,record_id DESC)
  WHERE dataset IN ('owners','pets');
CREATE INDEX IF NOT EXISTS dashboard_registry_area_read_idx
  ON ekapon.dashboard_records(dataset,lower(btrim(record_data->>'barangay')),archived,updated_at DESC,record_id)
  WHERE dataset IN ('owners','pets');
CREATE INDEX IF NOT EXISTS attendance_recent_order_idx
  ON ekapon.program_attendance((coalesce(voided_at,created_at)) DESC,(id::text));
CREATE INDEX IF NOT EXISTS standalone_recent_order_idx
  ON ekapon.standalone_services((coalesce(voided_at,created_at)) DESC,(id::text));
CREATE INDEX IF NOT EXISTS interest_people_recent_order_idx
  ON ekapon.program_interest_people(updated_at DESC,(id::text));
COMMIT;
