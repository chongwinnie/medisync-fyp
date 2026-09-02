-- Realistic development seed data for MedAgent
-- Note: auth0_sub values are placeholders for local/dev use.
-- Replace with real Auth0 subject IDs in production sync flow.

BEGIN;

-- ============================
-- Users and staff
-- ============================
INSERT INTO users (auth0_sub, email, role, is_active, email_verified, last_login)
VALUES
  ('auth0|admin_demo_001', 'admin@medagent.local', 'admin', true, true, now()),
  ('auth0|doctor_demo_001', 'dr.sarah@medagent.local', 'doctor', true, true, now()),
  ('auth0|nurse_demo_001', 'nurse.anna@medagent.local', 'nurse', true, true, now())
ON CONFLICT (auth0_sub) DO UPDATE
SET
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active,
  email_verified = EXCLUDED.email_verified,
  last_login = EXCLUDED.last_login,
  updated_at = now();

INSERT INTO staff (user_id, staff_code, full_name, department, specialization, phone, hire_date, base_salary)
SELECT u.id, 'STF-ADM-001', 'Admin User', 'Administration', 'Operations', '+60-11-1000-0001', DATE '2023-01-10', 8500.00
FROM users u
WHERE u.auth0_sub = 'auth0|admin_demo_001'
ON CONFLICT (staff_code) DO UPDATE
SET
  full_name = EXCLUDED.full_name,
  department = EXCLUDED.department,
  specialization = EXCLUDED.specialization,
  phone = EXCLUDED.phone,
  hire_date = EXCLUDED.hire_date,
  base_salary = EXCLUDED.base_salary,
  updated_at = now();

INSERT INTO staff (user_id, staff_code, full_name, department, specialization, phone, hire_date, base_salary)
SELECT u.id, 'STF-DOC-001', 'Dr. Sarah Chen', 'Internal Medicine', 'Endocrinology', '+60-11-1000-0002', DATE '2021-06-01', 15000.00
FROM users u
WHERE u.auth0_sub = 'auth0|doctor_demo_001'
ON CONFLICT (staff_code) DO UPDATE
SET
  full_name = EXCLUDED.full_name,
  department = EXCLUDED.department,
  specialization = EXCLUDED.specialization,
  phone = EXCLUDED.phone,
  hire_date = EXCLUDED.hire_date,
  base_salary = EXCLUDED.base_salary,
  updated_at = now();

INSERT INTO staff (user_id, staff_code, full_name, department, specialization, phone, hire_date, base_salary)
SELECT u.id, 'STF-NUR-001', 'Nurse Anna Lee', 'General Ward', 'Ward Nursing', '+60-11-1000-0003', DATE '2022-02-15', 7800.00
FROM users u
WHERE u.auth0_sub = 'auth0|nurse_demo_001'
ON CONFLICT (staff_code) DO UPDATE
SET
  full_name = EXCLUDED.full_name,
  department = EXCLUDED.department,
  specialization = EXCLUDED.specialization,
  phone = EXCLUDED.phone,
  hire_date = EXCLUDED.hire_date,
  base_salary = EXCLUDED.base_salary,
  updated_at = now();

-- ============================
-- Rooms, theatre, inventory
-- ============================
INSERT INTO rooms (room_number, ward, room_type, bed_count, status, special_equipment)
VALUES
  ('A-101', 'General', 'ward', 2, 'available', 'Cardiac monitor'),
  ('C-201', 'Consultation', 'consultation', 1, 'available', 'ECG')
ON CONFLICT (room_number, ward) DO UPDATE
SET
  room_type = EXCLUDED.room_type,
  bed_count = EXCLUDED.bed_count,
  status = EXCLUDED.status,
  special_equipment = EXCLUDED.special_equipment,
  updated_at = now();

INSERT INTO theatres (theatre_name, location, status, equipment_list)
VALUES ('OT-1', 'Block B', 'available', 'Anesthesia machine, Ventilator')
ON CONFLICT (theatre_name) DO UPDATE
SET
  location = EXCLUDED.location,
  status = EXCLUDED.status,
  equipment_list = EXCLUDED.equipment_list,
  updated_at = now();

INSERT INTO inventory_items (sku, item_name, category, current_stock, minimum_level, reorder_quantity, unit, supplier_name, unit_cost, status)
VALUES
  ('MED-LEV-050', 'Levothyroxine 50mcg', 'medicine', 20, 30, 100, 'tablet', 'PharmaCare', 0.55, 'active'),
  ('SUP-GLO-100', 'Nitrile Gloves', 'supply', 500, 200, 1000, 'pair', 'MediSupply', 0.12, 'active')
ON CONFLICT (sku) DO UPDATE
SET
  item_name = EXCLUDED.item_name,
  category = EXCLUDED.category,
  current_stock = EXCLUDED.current_stock,
  minimum_level = EXCLUDED.minimum_level,
  reorder_quantity = EXCLUDED.reorder_quantity,
  unit = EXCLUDED.unit,
  supplier_name = EXCLUDED.supplier_name,
  unit_cost = EXCLUDED.unit_cost,
  status = EXCLUDED.status,
  updated_at = now();

-- ============================
-- Patients
-- ============================
INSERT INTO patients (
  patient_code, full_name, date_of_birth, gender, blood_type, phone,
  emergency_contact, allergies, primary_doctor_id, status, admitted_at
)
SELECT
  'P-1042', 'John Doe', DATE '1980-04-12', 'male', 'A+',
  '+60-12-700-1042',
  jsonb_build_object('name', 'Jane Doe', 'phone', '+60-12-700-0001', 'relationship', 'Spouse'),
  'Penicillin',
  s.id,
  'admitted',
  now() - interval '1 day'
FROM staff s
WHERE s.staff_code = 'STF-DOC-001'
ON CONFLICT (patient_code) DO UPDATE
SET
  full_name = EXCLUDED.full_name,
  date_of_birth = EXCLUDED.date_of_birth,
  gender = EXCLUDED.gender,
  blood_type = EXCLUDED.blood_type,
  phone = EXCLUDED.phone,
  emergency_contact = EXCLUDED.emergency_contact,
  allergies = EXCLUDED.allergies,
  primary_doctor_id = EXCLUDED.primary_doctor_id,
  status = EXCLUDED.status,
  admitted_at = EXCLUDED.admitted_at,
  updated_at = now();

INSERT INTO patients (
  patient_code, full_name, date_of_birth, gender, blood_type, phone,
  emergency_contact, allergies, primary_doctor_id, status
)
SELECT
  'P-1043', 'Alice Smith', DATE '1992-09-03', 'female', 'O-',
  '+60-12-700-1043',
  jsonb_build_object('name', 'Robert Smith', 'phone', '+60-12-700-0002', 'relationship', 'Father'),
  NULL,
  s.id,
  'outpatient'
FROM staff s
WHERE s.staff_code = 'STF-DOC-001'
ON CONFLICT (patient_code) DO UPDATE
SET
  full_name = EXCLUDED.full_name,
  date_of_birth = EXCLUDED.date_of_birth,
  gender = EXCLUDED.gender,
  blood_type = EXCLUDED.blood_type,
  phone = EXCLUDED.phone,
  emergency_contact = EXCLUDED.emergency_contact,
  allergies = EXCLUDED.allergies,
  primary_doctor_id = EXCLUDED.primary_doctor_id,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO patients (
  patient_code, full_name, date_of_birth, gender, blood_type, phone,
  emergency_contact, allergies, primary_doctor_id, status
)
SELECT
  'P-1044', 'Bob Johnson', DATE '1971-12-21', 'male', 'B+',
  '+60-12-700-1044',
  jsonb_build_object('name', 'Emily Johnson', 'phone', '+60-12-700-0003', 'relationship', 'Daughter'),
  'Latex',
  s.id,
  'outpatient'
FROM staff s
WHERE s.staff_code = 'STF-DOC-001'
ON CONFLICT (patient_code) DO UPDATE
SET
  full_name = EXCLUDED.full_name,
  date_of_birth = EXCLUDED.date_of_birth,
  gender = EXCLUDED.gender,
  blood_type = EXCLUDED.blood_type,
  phone = EXCLUDED.phone,
  emergency_contact = EXCLUDED.emergency_contact,
  allergies = EXCLUDED.allergies,
  primary_doctor_id = EXCLUDED.primary_doctor_id,
  status = EXCLUDED.status,
  updated_at = now();

-- ============================
-- Clinical details for John Doe
-- ============================
INSERT INTO patient_vitals (patient_id, recorded_by, heart_rate, blood_pressure_sys, blood_pressure_dia, temperature, o2_saturation, weight_kg, recorded_at)
SELECT p.id, n.id, 82, 132, 86, 37.2, 98, 76.4, now() - interval '4 hours'
FROM patients p
JOIN staff n ON n.staff_code = 'STF-NUR-001'
WHERE p.patient_code = 'P-1042';

INSERT INTO patient_conditions (patient_id, icd_code, condition_name, severity, onset_date, is_active, diagnosed_by)
SELECT p.id, 'E03.9', 'Hypothyroidism, unspecified', 'moderate', DATE '2026-06-20', true, d.id
FROM patients p
JOIN staff d ON d.staff_code = 'STF-DOC-001'
WHERE p.patient_code = 'P-1042'
ON CONFLICT DO NOTHING;

INSERT INTO medications (patient_id, prescribed_by, drug_name, dosage, frequency, route, start_date, status, notes)
SELECT p.id, d.id, 'Levothyroxine', '50 mcg', 'Once daily', 'Oral', DATE '2026-06-21', 'active', 'Take before breakfast'
FROM patients p
JOIN staff d ON d.staff_code = 'STF-DOC-001'
WHERE p.patient_code = 'P-1042';

INSERT INTO case_history (patient_id, staff_id, visit_type, chief_complaint, clinical_notes, assessment, plan, room_id, visit_date)
SELECT
  p.id,
  d.id,
  'consultation',
  'Fatigue and weight gain',
  'Patient reports worsening fatigue over 2 weeks.',
  'Likely hypothyroid progression.',
  'Review labs and adjust therapy.',
  r.id,
  now() - interval '6 hours'
FROM patients p
JOIN staff d ON d.staff_code = 'STF-DOC-001'
LEFT JOIN rooms r ON r.room_number = 'C-201' AND r.ward = 'Consultation'
WHERE p.patient_code = 'P-1042';

WITH new_plan AS (
  INSERT INTO treatment_plans (patient_id, created_by, reviewed_by, title, objectives, status, ai_assisted, ai_draft_content, start_date)
  SELECT
    p.id, d.id, d.id,
    'Thyroid Management Plan',
    'Normalize TSH and improve fatigue symptoms.',
    'active',
    true,
    'AI draft: monitor TSH every 6-8 weeks, titrate levothyroxine.',
    now()
  FROM patients p
  JOIN staff d ON d.staff_code = 'STF-DOC-001'
  WHERE p.patient_code = 'P-1042'
  RETURNING id
)
INSERT INTO treatment_plan_items (plan_id, intervention, frequency, responsible_role, status, sequence_order)
SELECT id, 'Repeat TSH test', 'Every 6 weeks', 'doctor', 'in_progress', 1 FROM new_plan
UNION ALL
SELECT id, 'Medication adherence counseling', 'Daily reinforcement', 'nurse', 'pending', 2 FROM new_plan;

INSERT INTO lab_results (
  patient_id, ordered_by, test_name, result_value, unit, reference_range,
  is_abnormal, status, collected_at, reported_at
)
SELECT
  p.id, d.id, 'TSH', '5.2', 'mIU/L', '0.4 - 4.0',
  true, 'finalized', now() - interval '8 hours', now() - interval '7 hours'
FROM patients p
JOIN staff d ON d.staff_code = 'STF-DOC-001'
WHERE p.patient_code = 'P-1042';

INSERT INTO diagnostic_reports (
  patient_id, requested_by, finalized_by, report_type, title, findings,
  ai_summary, ai_confidence, status, ai_assisted, report_date, finalized_at
)
SELECT
  p.id, d.id, d.id,
  'lab',
  'Thyroid Panel Review',
  'TSH elevated above reference range.',
  'Likely suboptimal hormone replacement; review dosage.',
  0.92,
  'finalized',
  true,
  now() - interval '7 hours',
  now() - interval '6 hours'
FROM patients p
JOIN staff d ON d.staff_code = 'STF-DOC-001'
WHERE p.patient_code = 'P-1042';

INSERT INTO diagnostic_images (report_id, uploaded_by, storage_bucket, storage_path, file_name, mime_type, file_size_bytes, ai_interpretation, ai_confidence)
SELECT
  dr.id,
  d.id,
  'diagnostic-images',
  'sample/P-1042/thyroid-ultrasound-2026-06-27.png',
  'thyroid-ultrasound-2026-06-27.png',
  'image/png',
  245901,
  'No suspicious nodule detected in sample image.',
  0.78
FROM diagnostic_reports dr
JOIN patients p ON p.id = dr.patient_id
JOIN staff d ON d.staff_code = 'STF-DOC-001'
WHERE p.patient_code = 'P-1042'
LIMIT 1;

-- ============================
-- Appointments + reminders + queue
-- ============================
INSERT INTO appointments (
  patient_id, staff_id, booked_by, room_id, visit_type, start_time, end_time,
  duration_minutes, status, conflict_detected, notes
)
SELECT
  p.id, d.id, a.id, r.id,
  'consultation',
  now() + interval '1 hour',
  now() + interval '1 hour 30 minutes',
  30,
  'confirmed',
  false,
  'Follow-up for thyroid medication adjustment'
FROM patients p
JOIN staff d ON d.staff_code = 'STF-DOC-001'
JOIN staff a ON a.staff_code = 'STF-ADM-001'
LEFT JOIN rooms r ON r.room_number = 'C-201' AND r.ward = 'Consultation'
WHERE p.patient_code = 'P-1042';

INSERT INTO appointment_reminders (appointment_id, channel, status, scheduled_at)
SELECT ap.id, 'email', 'pending', ap.start_time - interval '45 minutes'
FROM appointments ap
JOIN patients p ON p.id = ap.patient_id
WHERE p.patient_code = 'P-1042'
ORDER BY ap.created_at DESC
LIMIT 1;

INSERT INTO appointment_queue (appointment_id, queue_number, status, checked_in_at)
SELECT ap.id, 12, 'waiting', now() - interval '5 minutes'
FROM appointments ap
JOIN patients p ON p.id = ap.patient_id
WHERE p.patient_code = 'P-1042'
ORDER BY ap.created_at DESC
LIMIT 1
ON CONFLICT (appointment_id) DO UPDATE
SET
  queue_number = EXCLUDED.queue_number,
  status = EXCLUDED.status,
  checked_in_at = EXCLUDED.checked_in_at,
  updated_at = now();

-- ============================
-- Resource allocation
-- ============================
INSERT INTO bed_allocations (room_id, patient_id, allocated_by, bed_number, admission_date, expected_discharge, special_requirements, is_active)
SELECT
  r.id, p.id, n.id, 1, CURRENT_DATE, CURRENT_DATE + 2, 'Low-noise room preferred', true
FROM rooms r
JOIN patients p ON p.patient_code = 'P-1042'
JOIN staff n ON n.staff_code = 'STF-NUR-001'
WHERE r.room_number = 'A-101' AND r.ward = 'General'
ON CONFLICT DO NOTHING;

INSERT INTO theatre_bookings (theatre_id, patient_id, lead_surgeon_id, booked_by, procedure_name, start_time, end_time, status, notes)
SELECT
  t.id, p.id, d.id, a.id,
  'Diagnostic Laryngoscopy',
  now() + interval '2 days',
  now() + interval '2 days 1 hour',
  'scheduled',
  'Pre-op clearance pending'
FROM theatres t
JOIN patients p ON p.patient_code = 'P-1044'
JOIN staff d ON d.staff_code = 'STF-DOC-001'
JOIN staff a ON a.staff_code = 'STF-ADM-001'
WHERE t.theatre_name = 'OT-1';

-- ============================
-- Staff shifts/attendance/payroll
-- ============================
INSERT INTO shift_schedules (staff_id, created_by, shift_date, start_time, end_time, location, shift_type, is_published, conflict_flagged)
SELECT d.id, a.id, CURRENT_DATE, TIME '08:00', TIME '16:00', 'Ward A', 'morning', true, false
FROM staff d
JOIN staff a ON a.staff_code = 'STF-ADM-001'
WHERE d.staff_code = 'STF-DOC-001';

INSERT INTO shift_schedules (staff_id, created_by, shift_date, start_time, end_time, location, shift_type, is_published, conflict_flagged)
SELECT n.id, a.id, CURRENT_DATE, TIME '07:00', TIME '15:00', 'Ward A', 'morning', true, false
FROM staff n
JOIN staff a ON a.staff_code = 'STF-ADM-001'
WHERE n.staff_code = 'STF-NUR-001';

INSERT INTO attendance_records (staff_id, attendance_date, clock_in, clock_out, hours_worked, overtime_hours, status, notes)
SELECT d.id, CURRENT_DATE, TIME '08:02', TIME '16:10', 8.13, 0.17, 'present', 'On time'
FROM staff d
WHERE d.staff_code = 'STF-DOC-001'
ON CONFLICT (staff_id, attendance_date) DO UPDATE
SET
  clock_in = EXCLUDED.clock_in,
  clock_out = EXCLUDED.clock_out,
  hours_worked = EXCLUDED.hours_worked,
  overtime_hours = EXCLUDED.overtime_hours,
  status = EXCLUDED.status,
  notes = EXCLUDED.notes,
  updated_at = now();

INSERT INTO payroll_records (staff_id, processed_by, pay_month, pay_year, days_worked, base_salary, overtime_pay, deductions, net_pay, status, processed_at)
SELECT
  d.id, a.id, EXTRACT(MONTH FROM now())::int, EXTRACT(YEAR FROM now())::int,
  20, 15000.00, 250.00, 100.00, 15150.00, 'processed', now()
FROM staff d
JOIN staff a ON a.staff_code = 'STF-ADM-001'
WHERE d.staff_code = 'STF-DOC-001'
ON CONFLICT (staff_id, pay_month, pay_year) DO UPDATE
SET
  processed_by = EXCLUDED.processed_by,
  days_worked = EXCLUDED.days_worked,
  base_salary = EXCLUDED.base_salary,
  overtime_pay = EXCLUDED.overtime_pay,
  deductions = EXCLUDED.deductions,
  net_pay = EXCLUDED.net_pay,
  status = EXCLUDED.status,
  processed_at = EXCLUDED.processed_at,
  updated_at = now();

-- ============================
-- Notifications, chat, logs
-- ============================
INSERT INTO notifications (user_id, type, title, body, entity_type)
SELECT u.id, 'clinical', 'Lab Alert: John Doe', 'TSH is above normal range. Review treatment plan.', 'lab_results'
FROM users u
WHERE u.auth0_sub = 'auth0|doctor_demo_001';

INSERT INTO notifications (user_id, type, title, body, entity_type)
SELECT u.id, 'appointment', 'Upcoming Appointment', 'John Doe follow-up starts in 1 hour.', 'appointments'
FROM users u
WHERE u.auth0_sub = 'auth0|doctor_demo_001';

INSERT INTO notifications (user_id, type, title, body, entity_type)
SELECT u.id, 'staff', 'Shift Published', 'Your shift for today has been published.', 'shift_schedules'
FROM users u
WHERE u.auth0_sub = 'auth0|nurse_demo_001';

WITH session_row AS (
  INSERT INTO chat_sessions (user_id, title, supervisor_session_id)
  SELECT u.id, 'John Doe Case Review', 'sess-demo-001'
  FROM users u
  WHERE u.auth0_sub = 'auth0|doctor_demo_001'
  RETURNING id, user_id
)
INSERT INTO chat_messages (session_id, role, content, metadata)
SELECT id, 'assistant', 'Hello Dr. Chen. I can help review John Doe lab trends.', jsonb_build_object('source', 'seed')
FROM session_row
UNION ALL
SELECT id, 'user', 'Show me the latest TSH result for John Doe.', jsonb_build_object('source', 'seed')
FROM session_row
UNION ALL
SELECT id, 'assistant', 'Latest TSH is 5.2 mIU/L, above reference range.', jsonb_build_object('source', 'seed', 'confidence', 0.92)
FROM session_row;

INSERT INTO ai_agent_logs (triggered_by, agent_name, supervisor_session_id, user_input, agent_output, entity_type, confidence_score, tokens_used, response_ms)
SELECT
  u.id,
  'medical_diagnostics_agent',
  'sess-demo-001',
  'Analyze latest thyroid panel for John Doe',
  'TSH elevated. Recommend treatment plan review.',
  'diagnostic_reports',
  0.92,
  684,
  420
FROM users u
WHERE u.auth0_sub = 'auth0|doctor_demo_001';

INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values, ip_address)
SELECT
  u.id,
  'seed_insert',
  'patients',
  p.id,
  jsonb_build_object('patient_code', p.patient_code, 'status', p.status),
  '127.0.0.1'::inet
FROM users u
JOIN patients p ON p.patient_code = 'P-1042'
WHERE u.auth0_sub = 'auth0|admin_demo_001';

COMMIT;
