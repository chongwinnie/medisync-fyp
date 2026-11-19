-- FIX-ADMIN-1: seed current-week shifts so Staff AI Optimize / matrix have live data
-- (original seed was June 2026 only). Idempotent fixed UUIDs.

BEGIN;

INSERT INTO shift_schedules (
  id, staff_id, created_by, shift_date, start_time, end_time,
  location, shift_type, is_published, conflict_flagged
)
SELECT
  v.id,
  s.id,
  a.id,
  (date_trunc('week', CURRENT_DATE)::date + v.day_offset),
  v.start_time,
  v.end_time,
  v.location,
  v.shift_type::shift_type,
  true,
  v.conflict_flagged
FROM (
  VALUES
    (
      '88888888-8888-8888-8888-888888888001'::uuid,
      'STF-DOC-001',
      0,
      time '08:00',
      time '16:00',
      'Cardiology Clinic B-201',
      'morning',
      false
    ),
    (
      '88888888-8888-8888-8888-888888888002'::uuid,
      'STF-NUR-001',
      0,
      time '08:00',
      time '16:00',
      'General Ward A',
      'morning',
      false
    ),
    (
      '88888888-8888-8888-8888-888888888003'::uuid,
      'STF-DOC-001',
      1,
      time '08:00',
      time '16:00',
      'Cardiology Ward',
      'morning',
      true
    ),
    (
      '88888888-8888-8888-8888-888888888004'::uuid,
      'STF-NUR-001',
      1,
      time '16:00',
      time '23:59',
      'General Ward A',
      'afternoon',
      false
    ),
    (
      '88888888-8888-8888-8888-888888888005'::uuid,
      'STF-ADM-001',
      2,
      time '09:00',
      time '17:00',
      'Admin Office',
      'morning',
      false
    ),
    (
      '88888888-8888-8888-8888-888888888006'::uuid,
      'STF-NUR-001',
      3,
      time '00:00',
      time '08:00',
      'ICU',
      'night',
      false
    ),
    (
      '88888888-8888-8888-8888-888888888007'::uuid,
      'STF-DOC-001',
      4,
      time '08:00',
      time '16:00',
      'Cardiology Clinic B-201',
      'morning',
      false
    ),
    (
      '88888888-8888-8888-8888-888888888008'::uuid,
      'STF-NUR-001',
      5,
      time '08:00',
      time '16:00',
      'General Ward A',
      'morning',
      false
    )
) AS v(id, staff_code, day_offset, start_time, end_time, location, shift_type, conflict_flagged)
JOIN staff s ON s.staff_code = v.staff_code
JOIN staff a ON a.staff_code = 'STF-ADM-001'
ON CONFLICT (id) DO UPDATE
SET
  staff_id = EXCLUDED.staff_id,
  shift_date = EXCLUDED.shift_date,
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time,
  location = EXCLUDED.location,
  shift_type = EXCLUDED.shift_type,
  is_published = true,
  conflict_flagged = EXCLUDED.conflict_flagged,
  updated_at = now();

COMMIT;
