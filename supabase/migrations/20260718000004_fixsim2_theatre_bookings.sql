-- FIX-SIM-2 / F-33: seed theatres + bookings (missing from 20260628150000_seed_data)
-- Idempotent via natural keys / fixed booking UUIDs.

BEGIN;

INSERT INTO theatres (theatre_name, location, status, equipment_list)
VALUES
  ('OT-1', 'Block B Level 2', 'available', 'Anesthesia machine, Ventilator, Laparoscopy tower'),
  ('OT-2', 'Block B Level 2', 'available', 'Anesthesia machine, C-arm')
ON CONFLICT (theatre_name) DO UPDATE
SET
  location = EXCLUDED.location,
  status = EXCLUDED.status,
  equipment_list = EXCLUDED.equipment_list,
  updated_at = now();

INSERT INTO theatre_bookings (
  id, theatre_id, patient_id, lead_surgeon_id, booked_by,
  procedure_name, start_time, end_time, status, notes
)
SELECT
  '77777777-7777-7777-7777-777777777001'::uuid,
  t.id,
  p.id,
  d.id,
  a.id,
  'Diagnostic Cardiac Catheterization',
  (CURRENT_DATE + interval '2 days' + time '09:00') AT TIME ZONE 'Asia/Kuala_Lumpur',
  (CURRENT_DATE + interval '2 days' + time '11:00') AT TIME ZONE 'Asia/Kuala_Lumpur',
  'scheduled',
  'Pre-op clearance pending'
FROM theatres t
JOIN patients p ON p.patient_code = 'PT-1044'
JOIN staff d ON d.staff_code = 'STF-DOC-001'
JOIN staff a ON a.staff_code = 'STF-ADM-001'
WHERE t.theatre_name = 'OT-1'
ON CONFLICT (id) DO NOTHING;

INSERT INTO theatre_bookings (
  id, theatre_id, patient_id, lead_surgeon_id, booked_by,
  procedure_name, start_time, end_time, status, notes
)
SELECT
  '77777777-7777-7777-7777-777777777002'::uuid,
  t.id,
  p.id,
  d.id,
  a.id,
  'Bronchoscopy',
  (CURRENT_DATE + interval '3 days' + time '14:00') AT TIME ZONE 'Asia/Kuala_Lumpur',
  (CURRENT_DATE + interval '3 days' + time '15:30') AT TIME ZONE 'Asia/Kuala_Lumpur',
  'scheduled',
  'ICU step-down candidate'
FROM theatres t
JOIN patients p ON p.patient_code = 'PT-1047'
JOIN staff d ON d.staff_code = 'STF-DOC-001'
JOIN staff a ON a.staff_code = 'STF-ADM-001'
WHERE t.theatre_name = 'OT-2'
ON CONFLICT (id) DO NOTHING;

COMMIT;
